import { execFileSync, spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PERFORMANCE_COMPARISON_SCHEMA_VERSION,
  parsePerformanceComparison,
  type PerformanceComparison,
  type PerformanceExecutionStep,
} from './PerformanceComparisonModel.ts';
import {
  parsePerformanceResult,
  type PerformanceResult,
} from './PerformanceModel.ts';
import { mergePerformanceResults } from './PerformanceResultMerge.ts';
import {
  requireStreamingProofReport,
  type StreamingPerformanceReport,
} from './StreamingPerformanceReport.ts';

const CI_BASE_NODES = 25;
const CI_INCREMENTAL_NODES = 5;
const CI_PROPERTY_BYTES = 256;
const FIRST_BATCH_RUNS = 3;
const SECOND_BATCH_RUNS = 2;

type RefName = 'base' | 'head';
type RefRun = Readonly<{
  commit: string;
  directory: string;
  name: RefName;
}>;
type ComparisonOptions = Readonly<{
  baseDirectory: string;
  headDirectory: string;
  orderSeed: number;
  outputDirectory: string;
}>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  await mkdir(options.outputDirectory, { recursive: true });
  const refs: Readonly<Record<RefName, RefRun>> = Object.freeze({
    base: refRun('base', options.baseDirectory),
    head: refRun('head', options.headDirectory),
  });
  const first = options.orderSeed % 2 === 0 ? refs.base : refs.head;
  const second = first.name === 'base' ? refs.head : refs.base;
  const order: PerformanceExecutionStep[] = [];
  const batches = new Map<string, PerformanceResult>();

  await runMaterializationBatch(first, 'a', FIRST_BATCH_RUNS, 1, options, order, batches);
  await runMaterializationBatch(second, 'a', FIRST_BATCH_RUNS, 1, options, order, batches);
  await runMaterializationBatch(second, 'b', SECOND_BATCH_RUNS, 0, options, order, batches);
  await runMaterializationBatch(first, 'b', SECOND_BATCH_RUNS, 0, options, order, batches);

  const streaming = new Map<RefName, StreamingPerformanceReport>();
  await runStreamingProof(second, options, order, streaming);
  await runStreamingProof(first, options, order, streaming);

  const comparison: PerformanceComparison = Object.freeze({
    base: Object.freeze({
      materialization: mergePerformanceResults([
        requireBatch(batches, 'base-a'),
        requireBatch(batches, 'base-b'),
      ]),
      streaming: requireStreaming(streaming, 'base'),
    }),
    executionOrder: Object.freeze(order),
    generatedAt: new Date().toISOString(),
    head: Object.freeze({
      materialization: mergePerformanceResults([
        requireBatch(batches, 'head-a'),
        requireBatch(batches, 'head-b'),
      ]),
      streaming: requireStreaming(streaming, 'head'),
    }),
    schemaVersion: PERFORMANCE_COMPARISON_SCHEMA_VERSION,
  });
  parsePerformanceComparison(comparison);
  await writeJson(join(options.outputDirectory, 'base.json'), comparison.base.materialization);
  await writeJson(join(options.outputDirectory, 'head.json'), comparison.head.materialization);
  await writeJson(join(options.outputDirectory, 'comparison.json'), comparison);
  process.stdout.write(
    `Performance comparison complete: ${join(options.outputDirectory, 'comparison.json')}\n`,
  );
}

async function runMaterializationBatch(
  ref: RefRun,
  phase: 'a' | 'b',
  measuredRuns: number,
  warmupRuns: number,
  options: ComparisonOptions,
  order: PerformanceExecutionStep[],
  batches: Map<string, PerformanceResult>,
): Promise<void> {
  const key = `${ref.name}-${phase}`;
  const outputPath = join(options.outputDirectory, `${key}.json`);
  order.push(`${ref.name}-materialization-${phase}`);
  await runNode(
    ref,
    ['dist/scripts/performance/RunPerformance.js', '--output', outputPath],
    {
      GIT_WARP_PERF_BASE_NODES: String(CI_BASE_NODES),
      GIT_WARP_PERF_COMMIT: ref.commit,
      GIT_WARP_PERF_INCREMENTAL_NODES: String(CI_INCREMENTAL_NODES),
      GIT_WARP_PERF_PROPERTY_BYTES: String(CI_PROPERTY_BYTES),
      GIT_WARP_PERF_RUNS: String(measuredRuns),
      GIT_WARP_PERF_WARMUPS: String(warmupRuns),
    },
  );
  batches.set(key, parsePerformanceResult(await readJson(outputPath)));
}

async function runStreamingProof(
  ref: RefRun,
  options: ComparisonOptions,
  order: PerformanceExecutionStep[],
  reports: Map<RefName, StreamingPerformanceReport>,
): Promise<void> {
  const outputPath = join(options.outputDirectory, `${ref.name}-streaming.json`);
  order.push(`${ref.name}-streaming`);
  await runNode(
    ref,
    [
      'dist/scripts/performance/RunStreamingPerformance.js',
      '--profile',
      'proof',
      '--output',
      outputPath,
    ],
    {},
  );
  reports.set(ref.name, requireStreamingProofReport(await readJson(outputPath)));
}

async function runNode(
  ref: RefRun,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
): Promise<void> {
  process.stdout.write(`Running ${ref.name}: node ${args.join(' ')}\n`);
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ref.directory,
      env: {
        ...process.env,
        ...environment,
        RUNNER_ENVIRONMENT: process.env['RUNNER_ENVIRONMENT'] ?? 'local-comparison',
      },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(
        `${ref.name} performance child failed: ${signal ?? String(code)}`,
      ));
    });
  });
}

function refRun(name: RefName, directory: string): RefRun {
  return Object.freeze({
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: directory,
      encoding: 'utf8',
    }).trim(),
    directory,
    name,
  });
}

function requireBatch(
  batches: ReadonlyMap<string, PerformanceResult>,
  key: string,
): PerformanceResult {
  const result = batches.get(key);
  if (result === undefined) {
    throw new Error(`Missing performance batch: ${key}`);
  }
  return result;
}

function requireStreaming(
  reports: ReadonlyMap<RefName, StreamingPerformanceReport>,
  name: RefName,
): StreamingPerformanceReport {
  const report = reports.get(name);
  if (report === undefined) {
    throw new Error(`Missing streaming report: ${name}`);
  }
  return report;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseOptions(args: readonly string[]): ComparisonOptions {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--base-directory',
    '--head-directory',
    '--order-seed',
    '--output-directory',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === undefined || value === undefined) {
      throw new Error('Performance comparison arguments require option/value pairs');
    }
    if (!allowed.has(argument)) {
      throw new Error(`Unknown performance comparison argument: ${argument}`);
    }
    if (values.has(argument)) {
      throw new Error(`Duplicate performance comparison argument: ${argument}`);
    }
    values.set(argument, value);
  }
  const baseDirectory = values.get('--base-directory');
  const headDirectory = values.get('--head-directory');
  const outputDirectory = values.get('--output-directory');
  const rawSeed = values.get('--order-seed');
  if (
    baseDirectory === undefined
    || headDirectory === undefined
    || outputDirectory === undefined
    || rawSeed === undefined
  ) {
    throw new Error(
      'Performance comparison requires base/head/output directories and order seed',
    );
  }
  const orderSeed = Number(rawSeed);
  if (!Number.isSafeInteger(orderSeed) || orderSeed < 0) {
    throw new Error('Performance comparison order seed must be non-negative');
  }
  if (resolve(baseDirectory) === resolve(headDirectory)) {
    throw new Error('Performance comparison requires distinct base and head directories');
  }
  return Object.freeze({
    baseDirectory: resolve(baseDirectory),
    headDirectory: resolve(headDirectory),
    orderSeed,
    outputDirectory: resolve(outputDirectory),
  });
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
