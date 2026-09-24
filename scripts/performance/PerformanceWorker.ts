import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  openPerformanceRuntime,
  readPerformanceFixtureManifest,
} from './PerformanceFixture.ts';
import type {
  PerformanceSample,
  PerformanceScenarioName,
  WorkerObservation,
} from './PerformanceModel.ts';

const RESULT_PREFIX = 'GIT_WARP_PERFORMANCE_SAMPLE=';

export type PerformanceWorkerOptions = Readonly<{
  repositoryPath: string;
  scenario: PerformanceScenarioName;
}>;

async function main(): Promise<void> {
  const options = parseWorkerOptions(process.argv.slice(2));
  const sample = await runPerformanceWorker(options);
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(sample)}\n`);
}

export async function runPerformanceWorker(
  options: PerformanceWorkerOptions,
): Promise<PerformanceSample> {
  const manifest = await readPerformanceFixtureManifest(options.repositoryPath);
  if (manifest.scenario !== options.scenario) {
    throw new Error('Performance worker scenario does not match its fixture');
  }
  const opened = await openPerformanceRuntime(options.repositoryPath);
  const gitCommandsBefore = opened.gitCommandCount();
  const gitHistogramBefore = opened.gitCommandHistogram();
  let replayCount = 0;
  const loadPatchChain = opened.runtime._loadPatchChainFromSha.bind(opened.runtime);
  opened.runtime._loadPatchChainFromSha = async (...args) => {
    replayCount += 1;
    return await loadPatchChain(...args);
  };

  try {
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    const operation = options.scenario === 'warm-property-read'
      || options.scenario === 'bounded-memory-read'
      ? await readRetainedProperties(
        opened.runtime,
        manifest.targetNodeId,
        manifest.expectedPropertyBytes,
      )
      : await materializeCorpus(opened.runtime, manifest.targetNodeId);
    const wallMs = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    return Object.freeze({
      cpuSystemMs: cpu.system / 1000,
      cpuTotalMs: (cpu.user + cpu.system) / 1000,
      cpuUserMs: cpu.user / 1000,
      gitCommandCount: opened.gitCommandCount() - gitCommandsBefore,
      gitCommandHistogram: subtractHistograms(
        opened.gitCommandHistogram(),
        gitHistogramBefore,
      ),
      heapUsedBytes: process.memoryUsage().heapUsed,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      observation: Object.freeze({ ...operation, replayCount }),
      throughputPerSecond: operation.operationCount / (wallMs / 1000),
      wallMs,
    });
  } finally {
    await opened.runtime.close();
  }
}

function subtractHistograms(
  after: Readonly<Record<string, number>>,
  before: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(after)
      .map(([command, count]) => [command, count - (before[command] ?? 0)] as const)
      .filter(([, count]) => count > 0),
  ));
}

async function readRetainedProperties(
  runtime: Awaited<ReturnType<typeof openPerformanceRuntime>>['runtime'],
  nodeId: string,
  expectedPropertyBytes: number,
): Promise<Omit<WorkerObservation, 'replayCount'>> {
  const operationCount = readOperationCount();
  let resultBytes = 0;
  let timeToFirstReadingMs: number | null = null;
  const startedAt = performance.now();
  for (let index = 0; index < operationCount; index += 1) {
    const properties = await runtime.getNodeProps(nodeId);
    const payload = properties?.['payload'];
    if (typeof payload !== 'string') {
      throw new Error('Bounded property read did not return the expected payload');
    }
    const payloadBytes = Buffer.byteLength(payload);
    if (payloadBytes !== expectedPropertyBytes) {
      throw new Error('Bounded property read returned an unexpected payload size');
    }
    resultBytes += payloadBytes;
    timeToFirstReadingMs ??= performance.now() - startedAt;
  }
  return Object.freeze({
    cachedWholeState: runtime._cachedState !== null,
    operationCount,
    resultBytes,
    resultCount: operationCount,
    timeToFirstReadingMs,
  });
}

async function materializeCorpus(
  runtime: Awaited<ReturnType<typeof openPerformanceRuntime>>['runtime'],
  targetNodeId: string,
): Promise<Omit<WorkerObservation, 'replayCount'>> {
  const state = await runtime.materialize();
  if (!state.nodeAlive.contains(targetNodeId)) {
    throw new Error('Materialized performance corpus is missing its target node');
  }
  return Object.freeze({
    cachedWholeState: runtime._cachedState !== null,
    operationCount: 1,
    resultBytes: 0,
    resultCount: 1,
    timeToFirstReadingMs: null,
  });
}

function readOperationCount(): number {
  const raw = process.env['GIT_WARP_PERF_READS'];
  if (raw === undefined) {
    return 16;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('GIT_WARP_PERF_READS must be a positive safe integer');
  }
  return value;
}

function parseWorkerOptions(args: readonly string[]): PerformanceWorkerOptions {
  let repositoryPath: string | undefined;
  let scenario: PerformanceScenarioName | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--repo' && value !== undefined) {
      repositoryPath = value;
      index += 1;
    } else if (argument === '--scenario' && isScenario(value)) {
      scenario = value;
      index += 1;
    } else {
      throw new Error(`Unknown performance worker argument: ${String(argument)}`);
    }
  }
  if (repositoryPath === undefined || scenario === undefined) {
    throw new Error('Performance worker requires --repo and --scenario');
  }
  return Object.freeze({ repositoryPath, scenario });
}

function isScenario(value: string | undefined): value is PerformanceScenarioName {
  return value === 'cold-materialize'
    || value === 'warm-property-read'
    || value === 'incremental-materialize'
    || value === 'bounded-memory-read';
}

if (isMainModule()) {
  void main().catch((raw: unknown) => {
    const message = raw instanceof Error ? raw.stack ?? raw.message : String(raw);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}
