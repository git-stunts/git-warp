import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  PerformanceSampleSchema,
  type PerformanceSample,
  type PerformanceScenarioName,
} from './PerformanceModel.ts';

const RESULT_PREFIX = 'GIT_WARP_PERFORMANCE_SAMPLE=';
const WORKER_TIMEOUT_MS = 10 * 60 * 1000;

export async function runPerformanceProcess(
  scenario: PerformanceScenarioName,
  repositoryPath: string,
): Promise<PerformanceSample> {
  const workerPath = fileURLToPath(new URL('./PerformanceWorker.js', import.meta.url));
  const workerArgs = [
    workerPath,
    '--repo',
    repositoryPath,
    '--scenario',
    scenario,
  ];
  const useGnuTime = supportsGnuTime();
  const timingPath = `${repositoryPath}/gnu-time.tsv`;
  const command = useGnuTime ? '/usr/bin/time' : process.execPath;
  const args = useGnuTime
    ? ['-f', '%U\t%S\t%e\t%M', '-o', timingPath, process.execPath, ...workerArgs]
    : workerArgs;
  const completed = await spawnAndCollect(
    command,
    args,
    process.env,
    WORKER_TIMEOUT_MS,
  );
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
    maxRssBytes: Math.max(workerSample.maxRssBytes, timing.maxRssKib * 1024),
    workerLifecycleWallMs: timing.wallSeconds * 1000,
  });
}

export function supportsGnuTime(): boolean {
  return process.platform === 'linux' && existsSync('/usr/bin/time');
}

export async function spawnAndCollect(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<Readonly<{ stderr: string; stdout: string }>> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const detached = process.platform !== 'win32';
    const child = spawn(command, args, {
      detached,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (complete: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      complete();
    };
    const timeout = setTimeout(() => {
      try {
        if (detached && child.pid !== undefined) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch (raw) {
        const message = raw instanceof Error ? raw.message : String(raw);
        settle(() => rejectPromise(new Error(
          `Performance worker timed out and could not be killed: ${message}`,
        )));
        return;
      }
      settle(() => rejectPromise(new Error(
        `Performance worker timed out after ${String(timeoutMs)} ms`,
      )));
    }, timeoutMs);
    timeout.unref();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => {
      settle(() => rejectPromise(error));
    });
    child.once('close', (code, signal) => {
      settle(() => {
        if (code !== 0) {
          rejectPromise(new Error(
            `Performance worker failed (${String(code)}, ${String(signal)}): ${stderr}`,
          ));
          return;
        }
        resolvePromise(Object.freeze({ stderr, stdout }));
      });
    });
  });
}

function parseWorkerSample(stdout: string): PerformanceSample {
  const line = stdout.split('\n').find((entry) => entry.startsWith(RESULT_PREFIX));
  if (line === undefined) {
    throw new Error(`Performance worker emitted no sample: ${stdout}`);
  }
  const parsed: unknown = JSON.parse(line.slice(RESULT_PREFIX.length));
  return PerformanceSampleSchema.parse(parsed);
}

export function parseGnuTime(value: string): Readonly<{
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
