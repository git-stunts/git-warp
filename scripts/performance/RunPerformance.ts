import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  preparePerformanceFixture,
  type CorpusSpec,
} from './PerformanceFixture.ts';
import {
  PERFORMANCE_SCHEMA_VERSION,
  validatePerformanceResult,
  type PerformanceResult,
  type PerformanceSample,
  type PerformanceScenarioName,
} from './PerformanceModel.ts';
import {
  runPerformanceProcess,
  supportsGnuTime,
} from './PerformanceProcess.ts';
import { summarizeScenario } from './PerformanceStatistics.ts';

const DEFAULT_BASE_NODES = 1_500;
const DEFAULT_INCREMENTAL_NODES = 25;
const DEFAULT_MEASURED_RUNS = 5;
const DEFAULT_PROPERTY_BYTES = 256;
const DEFAULT_WARMUP_RUNS = 1;

type RunOptions = Readonly<{
  measuredRuns: number;
  outputPath: string;
  warmupRuns: number;
}>;

async function main(): Promise<void> {
  const options = parseRunOptions(process.argv.slice(2));
  const baseSpec = Object.freeze({
    baseNodeCount: readPositiveInteger(
      'GIT_WARP_PERF_BASE_NODES',
      DEFAULT_BASE_NODES,
    ),
    propertyBytesPerNode: readPositiveInteger(
      'GIT_WARP_PERF_PROPERTY_BYTES',
      DEFAULT_PROPERTY_BYTES,
    ),
  });
  const incrementalSpec = Object.freeze({
    ...baseSpec,
    suffixNodeCount: readPositiveInteger(
      'GIT_WARP_PERF_INCREMENTAL_NODES',
      DEFAULT_INCREMENTAL_NODES,
    ),
  });

  const cold = await measureScenario('cold-materialize', baseSpec, options);
  const warm = await measureScenario('warm-materialize', baseSpec, options);
  const incremental = await measureScenario(
    'incremental-materialize',
    incrementalSpec,
    options,
  );
  const cpuInfo = cpus();
  const lifecycleMetrics = supportsGnuTime();
  const result: PerformanceResult = Object.freeze({
    commit: readCommit(),
    environment: Object.freeze({
      architecture: process.arch,
      cpuCount: cpuInfo.length,
      cpuModel: cpuInfo[0]?.model ?? 'unknown',
      git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
      gitCas: readInstalledPackageVersion('@git-stunts/git-cas'),
      node: process.version,
      platform: process.platform,
      runner: process.env['RUNNER_ENVIRONMENT'] ?? 'local',
    }),
    generatedAt: new Date().toISOString(),
    instrumentation: Object.freeze({
      corpusSetup: 'excluded',
      cpuScope: lifecycleMetrics ? 'process-and-descendants' : 'node-process',
      gitCommands: 'timed-operation-plumbing-calls',
      memoryScope: lifecycleMetrics ? 'worker-lifecycle' : 'node-process',
      wallClock: 'materialize-operation',
    }),
    scenarios: Object.freeze({
      'cold-materialize': cold,
      'incremental-materialize': incremental,
      'warm-materialize': warm,
    }),
    schemaVersion: PERFORMANCE_SCHEMA_VERSION,
  });
  validatePerformanceResult(result);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  printSummary(result, options.outputPath);
}

async function measureScenario(
  scenario: PerformanceScenarioName,
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
  const parent = await mkdtemp(join(dirname(seed.repositoryPath), 'git-warp-perf-copy-'));
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
    measuredRuns: readPositiveInteger(
      'GIT_WARP_PERF_RUNS',
      DEFAULT_MEASURED_RUNS,
    ),
    outputPath,
    warmupRuns: readNonNegativeInteger(
      'GIT_WARP_PERF_WARMUPS',
      DEFAULT_WARMUP_RUNS,
    ),
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

function readCommit(): string {
  const configured = process.env['GIT_WARP_PERF_COMMIT'];
  if (configured !== undefined) {
    return configured;
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function readInstalledPackageVersion(packageName: string): string {
  const require = createRequire(import.meta.url);
  let current = dirname(require.resolve(packageName));
  while (current !== dirname(current)) {
    const packagePath = join(current, 'package.json');
    if (existsSync(packagePath)) {
      const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as unknown;
      if (
        parsed !== null
        && typeof parsed === 'object'
        && !Array.isArray(parsed)
        && 'name' in parsed
        && parsed.name === packageName
        && 'version' in parsed
        && typeof parsed.version === 'string'
      ) {
        return parsed.version;
      }
    }
    current = dirname(current);
  }
  throw new Error(`Cannot resolve installed package version: ${packageName}`);
}

function printSummary(result: PerformanceResult, outputPath: string): void {
  process.stdout.write(`Performance results: ${outputPath}\n`);
  for (const scenario of Object.values(result.scenarios)) {
    process.stdout.write(
      `${scenario.scenario}: CPU ${scenario.cpuTotalMs.median.toFixed(1)} ms, `
      + `wall ${scenario.wallMs.median.toFixed(1)} ms, `
      + `RSS ${(scenario.maxRssBytes.median / (1024 * 1024)).toFixed(1)} MiB\n`,
    );
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  void main().catch((raw: unknown) => {
    const message = raw instanceof Error ? raw.stack ?? raw.message : String(raw);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
