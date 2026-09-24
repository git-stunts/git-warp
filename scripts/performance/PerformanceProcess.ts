import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type {
  PerformanceSample,
  PerformanceScenarioName,
  WorkerObservation,
} from './PerformanceModel.ts';

const RESULT_PREFIX = 'GIT_WARP_PERFORMANCE_SAMPLE=';

export async function runPerformanceProcess(
  scenario: PerformanceScenarioName,
  repositoryPath: string,
  heapMib?: number,
): Promise<PerformanceSample> {
  const workerPath = fileURLToPath(new URL('./PerformanceWorker.js', import.meta.url));
  const workerArgs = [
    ...(heapMib === undefined ? [] : [`--max-old-space-size=${String(heapMib)}`]),
    workerPath,
    '--repo',
    repositoryPath,
    '--scenario',
    scenario,
  ];
  const useGnuTime = process.platform === 'linux' && existsSync('/usr/bin/time');
  const timingPath = `${repositoryPath}/gnu-time.tsv`;
  const command = useGnuTime ? '/usr/bin/time' : process.execPath;
  const args = useGnuTime
    ? ['-f', '%U\t%S\t%e\t%M', '-o', timingPath, process.execPath, ...workerArgs]
    : workerArgs;
  const completed = await spawnAndCollect(command, args, {
    ...process.env,
    GIT_WARP_PERF_READS: scenario === 'bounded-memory-read' ? '1' : '16',
  });
  const workerSample = parseWorkerSample(completed.stdout);
  if (!useGnuTime) {
    return workerSample;
  }
  const timing = parseGnuTime(await readFile(timingPath, 'utf8'));
  await rm(timingPath, { force: true });
  return Object.freeze({
    ...workerSample,
    cpuSystemMs: timing.systemSeconds * 1000,
    cpuTotalMs: (timing.userSeconds + timing.systemSeconds) * 1000,
    cpuUserMs: timing.userSeconds * 1000,
    maxRssBytes: timing.maxRssKib * 1024,
    throughputPerSecond: workerSample.observation.operationCount / timing.wallSeconds,
    wallMs: timing.wallSeconds * 1000,
  });
}

async function spawnAndCollect(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<Readonly<{ stderr: string; stdout: string }>> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        rejectPromise(new Error(
          `Performance worker failed (${String(code)}, ${String(signal)}): ${stderr}`,
        ));
        return;
      }
      resolvePromise(Object.freeze({ stderr, stdout }));
    });
  });
}

function parseWorkerSample(stdout: string): PerformanceSample {
  const line = stdout.split('\n').find((entry) => entry.startsWith(RESULT_PREFIX));
  if (line === undefined) {
    throw new Error(`Performance worker emitted no sample: ${stdout}`);
  }
  const parsed: unknown = JSON.parse(line.slice(RESULT_PREFIX.length));
  if (!isPerformanceSample(parsed)) {
    throw new Error('Performance worker emitted an invalid sample');
  }
  return parsed;
}

function isPerformanceSample(value: unknown): value is PerformanceSample {
  if (
    !isRecord(value)
    || !isRecord(value['gitCommandHistogram'])
    || !isWorkerObservation(value['observation'])
  ) {
    return false;
  }
  return [
    value['cpuSystemMs'],
    value['cpuTotalMs'],
    value['cpuUserMs'],
    value['gitCommandCount'],
    value['heapUsedBytes'],
    value['maxRssBytes'],
    value['throughputPerSecond'],
    value['wallMs'],
  ].every((metric) => typeof metric === 'number' && Number.isFinite(metric));
}

function isWorkerObservation(value: unknown): value is WorkerObservation {
  return isRecord(value)
    && typeof value['cachedWholeState'] === 'boolean'
    && typeof value['operationCount'] === 'number'
    && typeof value['replayCount'] === 'number'
    && typeof value['resultBytes'] === 'number'
    && typeof value['resultCount'] === 'number'
    && (value['timeToFirstReadingMs'] === null
      || typeof value['timeToFirstReadingMs'] === 'number');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseGnuTime(value: string): Readonly<{
  maxRssKib: number;
  systemSeconds: number;
  userSeconds: number;
  wallSeconds: number;
}> {
  const fields = value.trim().split('\t').map(Number);
  const [userSeconds, systemSeconds, wallSeconds, maxRssKib] = fields;
  if (
    fields.length !== 4
    || userSeconds === undefined
    || systemSeconds === undefined
    || wallSeconds === undefined
    || maxRssKib === undefined
    || fields.some((field) => !Number.isFinite(field))
  ) {
    throw new Error(`GNU time emitted invalid metrics: ${value}`);
  }
  return Object.freeze({ maxRssKib, systemSeconds, userSeconds, wallSeconds });
}
