import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  preparePerformanceFixture,
  type CorpusSpec,
} from './PerformanceFixture.ts';
import {
  PERFORMANCE_SCHEMA_VERSION,
  summarizeScenario,
  type PerformanceResult,
  type PerformanceSample,
  type PerformanceScenarioName,
} from './PerformanceModel.ts';
import { runPerformanceProcess } from './PerformanceProcess.ts';

const MEBIBYTE = 1024 * 1024;
const DEFAULT_CPU_NODES = 1_500;
const DEFAULT_CPU_PROPERTY_BYTES = 256;
const DEFAULT_INCREMENTAL_NODES = 25;
const DEFAULT_MEASURED_RUNS = 5;
const DEFAULT_WARMUP_RUNS = 1;
const DEFAULT_STREAMING_NODES = 1_024;
const DEFAULT_STREAMING_PROPERTY_BYTES = 256 * 1024;
const DEFAULT_STREAMING_HEAP_MIB = 48;
const MAX_STREAMING_RSS_BYTES = 256 * MEBIBYTE;
const MIN_LOGICAL_TO_HEAP_RATIO = 4;

type RunOptions = Readonly<{
  measuredRuns: number;
  outputPath: string;
  warmupRuns: number;
}>;

async function main(): Promise<void> {
  const options = parseRunOptions(process.argv.slice(2));
  const cpuSpec = Object.freeze({
    nodeCount: readPositiveInteger('GIT_WARP_PERF_CPU_NODES', DEFAULT_CPU_NODES),
    propertyBytesPerNode: readPositiveInteger(
      'GIT_WARP_PERF_CPU_PROPERTY_BYTES',
      DEFAULT_CPU_PROPERTY_BYTES,
    ),
    suffixNodeCount: readPositiveInteger(
      'GIT_WARP_PERF_INCREMENTAL_NODES',
      DEFAULT_INCREMENTAL_NODES,
    ),
  });
  const cold = await measureScenario(
    'cold-materialize',
    cpuSpec,
    options,
  );
  const warm = await measureScenario(
    'warm-property-read',
    cpuSpec,
    options,
  );
  const incremental = await measureScenario(
    'incremental-materialize',
    cpuSpec,
    options,
  );
  const streamingHeapMib = readPositiveInteger(
    'GIT_WARP_PERF_STREAM_HEAP_MIB',
    DEFAULT_STREAMING_HEAP_MIB,
  );
  const streaming = await measureStreamingScenario({
    nodeCount: readPositiveInteger(
      'GIT_WARP_PERF_STREAM_NODES',
      DEFAULT_STREAMING_NODES,
    ),
    propertyBytesPerNode: readPositiveInteger(
      'GIT_WARP_PERF_STREAM_PROPERTY_BYTES',
      DEFAULT_STREAMING_PROPERTY_BYTES,
    ),
  }, streamingHeapMib);
  const heapCapBytes = streamingHeapMib * MEBIBYTE;
  const logicalToHeapRatio = streaming.corpus.logicalPropertyBytes / heapCapBytes;
  const streamingSample = requireFirstSample(streaming.samples);
  const streamingPassed = logicalToHeapRatio >= MIN_LOGICAL_TO_HEAP_RATIO
    && streamingSample.maxRssBytes <= MAX_STREAMING_RSS_BYTES
    && streamingSample.observation.cachedWholeState === false
    && streamingSample.observation.replayCount === 0
    && streamingSample.observation.resultCount > 0;
  if (!streamingPassed) {
    throw new Error('Bounded-memory performance contract failed');
  }
  const cpuInfo = cpus();
  const lifecycleMetrics = process.platform === 'linux' && existsSync('/usr/bin/time');
  const result: PerformanceResult = Object.freeze({
    commit: readCommit(),
    environment: Object.freeze({
      architecture: process.arch,
      cpuCount: cpuInfo.length,
      cpuModel: cpuInfo[0]?.model ?? 'unknown',
      node: process.version,
      platform: process.platform,
      runner: process.env['RUNNER_ENVIRONMENT'] ?? 'local',
    }),
    generatedAt: new Date().toISOString(),
    instrumentation: Object.freeze({
      casHitMiss: null,
      casHitMissReason: 'git-cas does not yet expose operation-scoped cache counters',
      cpuScope: lifecycleMetrics ? 'process-and-descendants' : 'node-process',
      gitCommands: 'counted-plumbing-calls',
      rssScope: lifecycleMetrics ? 'process-and-descendants' : 'worker-process',
      wallClock: lifecycleMetrics ? 'worker-lifecycle' : 'measured-operation',
    }),
    scenarios: Object.freeze({
      'bounded-memory-read': streaming,
      'cold-materialize': cold,
      'incremental-materialize': incremental,
      'warm-property-read': warm,
    }),
    schemaVersion: PERFORMANCE_SCHEMA_VERSION,
    streamingContract: Object.freeze({
      heapCapBytes,
      logicalToHeapRatio,
      maximumRssBytes: MAX_STREAMING_RSS_BYTES,
      passed: streamingPassed,
    }),
  });
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  printSummary(result, options.outputPath);
}

async function measureScenario(
  scenario: Exclude<PerformanceScenarioName, 'bounded-memory-read'>,
  spec: CorpusSpec,
  options: RunOptions,
) {
  const samples: PerformanceSample[] = [];
  const seed = await preparePerformanceFixture(scenario, spec);
  try {
    const totalRuns = options.warmupRuns + options.measuredRuns;
    for (let run = 0; run < totalRuns; run += 1) {
      const fixture = await copyPerformanceFixture(seed);
      try {
        const sample = await runPerformanceProcess(scenario, fixture.repositoryPath);
        if (run >= options.warmupRuns) {
          samples.push(sample);
        }
      } finally {
        await fixture.cleanup();
      }
    }
  } finally {
    await seed.cleanup();
  }
  return summarizeScenario(scenario, seed.manifest.corpus, samples, options.warmupRuns);
}

async function copyPerformanceFixture(
  seed: Awaited<ReturnType<typeof preparePerformanceFixture>>,
): Promise<Awaited<ReturnType<typeof preparePerformanceFixture>>> {
  const parent = await mkdtemp(join(dirname(seed.repositoryPath), 'git-warp-performance-copy-'));
  const repositoryPath = join(parent, 'repository');
  try {
    await cp(seed.repositoryPath, repositoryPath, { recursive: true });
    return Object.freeze({
      cleanup: async () => await rm(parent, { recursive: true, force: true }),
      manifest: seed.manifest,
      repositoryPath,
    });
  } catch (raw) {
    await rm(parent, { recursive: true, force: true });
    throw raw;
  }
}

async function measureStreamingScenario(
  spec: CorpusSpec,
  heapMib: number,
) {
  const scenario = 'bounded-memory-read';
  const fixture = await preparePerformanceFixture(scenario, spec);
  try {
    const sample = await runPerformanceProcess(scenario, fixture.repositoryPath, heapMib);
    return summarizeScenario(scenario, fixture.manifest.corpus, [sample], 0);
  } finally {
    await fixture.cleanup();
  }
}

function parseRunOptions(args: readonly string[]): RunOptions {
  let outputPath = resolve('benchmarks/v19/results/latest.json');
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--output' && value !== undefined) {
      outputPath = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown performance argument: ${String(argument)}`);
    }
  }
  return Object.freeze({
    measuredRuns: readPositiveInteger('GIT_WARP_PERF_RUNS', DEFAULT_MEASURED_RUNS),
    outputPath,
    warmupRuns: readNonNegativeInteger('GIT_WARP_PERF_WARMUPS', DEFAULT_WARMUP_RUNS),
  });
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = readInteger(name, fallback);
  if (value <= 0) {
    throw new Error(`${name} must be positive`);
  }
  return value;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const value = readInteger(name, fallback);
  if (value < 0) {
    throw new Error(`${name} must be non-negative`);
  }
  return value;
}

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return value;
}

function requireFirstSample(samples: readonly PerformanceSample[]): PerformanceSample {
  const sample = samples[0];
  if (sample === undefined) {
    throw new Error('Streaming scenario emitted no sample');
  }
  return sample;
}

function readCommit(): string {
  const configured = process.env['GIT_WARP_PERF_COMMIT'];
  if (configured !== undefined) {
    return configured;
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function printSummary(result: PerformanceResult, outputPath: string): void {
  process.stdout.write(`Performance results: ${outputPath}\n`);
  for (const scenario of Object.values(result.scenarios)) {
    process.stdout.write(
      `${scenario.scenario}: CPU ${scenario.cpuTotalMs.median.toFixed(1)} ms, `
      + `wall ${scenario.wallMs.median.toFixed(1)} ms, `
      + `RSS ${(scenario.maxRssBytes.median / MEBIBYTE).toFixed(1)} MiB\n`,
    );
  }
  process.stdout.write(
    `Streaming ratio: ${result.streamingContract.logicalToHeapRatio.toFixed(2)}x `
    + `(pass=${String(result.streamingContract.passed)})\n`,
  );
}

main().catch((raw: unknown) => {
  const message = raw instanceof Error ? raw.stack ?? raw.message : String(raw);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
