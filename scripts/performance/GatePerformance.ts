import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import z from 'zod';
import {
  parsePerformanceComparison,
  type PerformanceComparison,
} from './PerformanceComparisonModel.ts';
import {
  PERFORMANCE_SCENARIOS,
  parsePerformanceResult,
  type PerformanceResult,
} from './PerformanceModel.ts';
import { comparablePerformanceEnvironment } from './PerformanceEnvironment.ts';
import { renderPerformanceSummary } from './PerformanceSummary.ts';
import type { StreamingPerformanceReport } from './StreamingPerformanceReport.ts';

const scenarioThresholds = z.object({
  'cold-materialize': z.number().finite().nonnegative(),
  'incremental-materialize': z.number().finite().nonnegative(),
  'warm-materialize': z.number().finite().nonnegative(),
}).strict();

export const PerformancePolicySchema = z.object({
  absolute: z.object({
    cpuTotalMedianMs: scenarioThresholds,
    maxRssBytes: scenarioThresholds,
    peakHeapUsedBytes: scenarioThresholds,
  }).strict(),
  relative: z.object({
    cpuNoiseFloorMs: scenarioThresholds,
    cpuRegressionRatio: z.number().finite().gte(1),
  }).strict(),
  schemaVersion: z.literal(1),
  streaming: z.object({
    maxRssBytes: z.number().finite().positive(),
    peakHeapUsedBytes: z.number().finite().positive(),
  }).strict(),
  wallTime: z.literal('diagnostic'),
}).strict();

export type PerformancePolicy = Readonly<z.infer<typeof PerformancePolicySchema>>;
type GateOptions = Readonly<{
  basePath?: string;
  comparisonPath?: string;
  headPath?: string;
  policyPath: string;
  summaryPath?: string;
}>;

type MutableGatePaths = {
  basePath?: string;
  comparisonPath?: string;
  headPath?: string;
  policyPath: string;
  summaryPath?: string;
};

export type PerformanceGateEvaluation = Readonly<{
  failures: readonly string[];
  summary: string;
}>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const policy = await readPolicy(options.policyPath);
  const comparison = options.comparisonPath === undefined
    ? null
    : await readComparison(options.comparisonPath);
  const head = comparison === null
    ? await readResult(requireHeadPath(options))
    : comparison.head.materialization;
  const base = comparison?.base.materialization
    ?? (options.basePath === undefined ? null : await readResult(options.basePath));
  const evaluation = evaluatePerformanceGate(
    head,
    base,
    policy,
    comparison?.head.streaming,
    comparison?.base.streaming,
    comparison?.executionOrder,
  );
  process.stdout.write(evaluation.summary);
  if (options.summaryPath !== undefined) {
    await writeFile(options.summaryPath, evaluation.summary, 'utf8');
  }
  if (evaluation.failures.length > 0) {
    process.exitCode = 1;
  }
}

export function evaluatePerformanceGate(
  head: PerformanceResult,
  base: PerformanceResult | null,
  policy: PerformancePolicy,
  streamingHead?: StreamingPerformanceReport,
  streamingBase?: StreamingPerformanceReport,
  executionOrder?: readonly string[],
): PerformanceGateEvaluation {
  const failures = [
    ...absoluteFailures(head, policy),
    ...(base === null ? [] : relativeFailures(base, head, policy)),
    ...(streamingHead === undefined ? [] : streamingFailures(streamingHead, policy)),
  ];
  return Object.freeze({
    failures: Object.freeze(failures),
    summary: renderPerformanceSummary(
      head,
      base,
      failures,
      streamingHead,
      streamingBase,
      executionOrder,
    ),
  });
}

function absoluteFailures(
  head: PerformanceResult,
  policy: PerformancePolicy,
): string[] {
  const failures: string[] = [];
  for (const scenario of PERFORMANCE_SCENARIOS) {
    const actual = head.scenarios[scenario].cpuTotalMs.median;
    const maximum = policy.absolute.cpuTotalMedianMs[scenario];
    if (actual > maximum) {
      failures.push(metricFailure(`${scenario} median CPU`, actual, maximum));
    }
    const actualRss = head.scenarios[scenario].maxRssBytes.maximum;
    const maximumRss = policy.absolute.maxRssBytes[scenario];
    if (actualRss > maximumRss) {
      failures.push(byteMetricFailure(
        `${scenario} maximum RSS`,
        actualRss,
        maximumRss,
      ));
    }
    const actualHeap = head.scenarios[scenario].peakHeapUsedBytes.maximum;
    const maximumHeap = policy.absolute.peakHeapUsedBytes[scenario];
    if (actualHeap > maximumHeap) {
      failures.push(byteMetricFailure(
        `${scenario} peak heap`,
        actualHeap,
        maximumHeap,
      ));
    }
  }
  return failures;
}

function relativeFailures(
  base: PerformanceResult,
  head: PerformanceResult,
  policy: PerformancePolicy,
): string[] {
  requireComparable(base, head);
  const failures: string[] = [];
  for (const scenario of PERFORMANCE_SCENARIOS) {
    const baseCpu = base.scenarios[scenario].cpuTotalMs.median;
    const headCpu = head.scenarios[scenario].cpuTotalMs.median;
    const maximum = baseCpu * policy.relative.cpuRegressionRatio
      + policy.relative.cpuNoiseFloorMs[scenario];
    if (headCpu > maximum) {
      failures.push(metricFailure(`${scenario} median CPU regression`, headCpu, maximum));
    }
  }
  return failures;
}

function streamingFailures(
  head: StreamingPerformanceReport,
  policy: PerformancePolicy,
): string[] {
  const failures: string[] = [];
  const metrics = head.streaming.metrics;
  if (metrics.maxRssBytes > policy.streaming.maxRssBytes) {
    failures.push(byteMetricFailure(
      'streaming maximum RSS',
      metrics.maxRssBytes,
      policy.streaming.maxRssBytes,
    ));
  }
  if (metrics.peakHeapUsedBytes > policy.streaming.peakHeapUsedBytes) {
    failures.push(byteMetricFailure(
      'streaming peak heap',
      metrics.peakHeapUsedBytes,
      policy.streaming.peakHeapUsedBytes,
    ));
  }
  return failures;
}

function requireComparable(base: PerformanceResult, head: PerformanceResult): void {
  if (
    JSON.stringify(comparablePerformanceEnvironment(base))
      !== JSON.stringify(comparablePerformanceEnvironment(head))
    || JSON.stringify(base.instrumentation) !== JSON.stringify(head.instrumentation)
  ) {
    throw new Error('Base and head performance environments are not comparable');
  }
  for (const scenario of PERFORMANCE_SCENARIOS) {
    const baseCorpus = JSON.stringify(base.scenarios[scenario].corpus);
    const headCorpus = JSON.stringify(head.scenarios[scenario].corpus);
    if (baseCorpus !== headCorpus) {
      throw new Error(`Base and head corpora differ: ${scenario}`);
    }
  }
}

function metricFailure(metric: string, actual: number, maximum: number): string {
  return `${metric}: ${actual.toFixed(1)} ms exceeds ${maximum.toFixed(1)} ms`;
}

function byteMetricFailure(metric: string, actual: number, maximum: number): string {
  const mebibyte = 1024 * 1024;
  return `${metric}: ${(actual / mebibyte).toFixed(1)} MiB exceeds `
    + `${(maximum / mebibyte).toFixed(1)} MiB`;
}

async function readResult(path: string): Promise<PerformanceResult> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return parsePerformanceResult(value);
}

async function readComparison(path: string): Promise<PerformanceComparison> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return parsePerformanceComparison(value);
}

async function readPolicy(path: string): Promise<PerformancePolicy> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return PerformancePolicySchema.parse(value);
}

function parseOptions(args: readonly string[]): GateOptions {
  const paths: MutableGatePaths = {
    policyPath: resolve('benchmarks/v19/policy.json'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Performance gate argument requires a value: ${String(argument)}`);
    }
    assignPathArgument(paths, argument, value);
    index += 1;
  }
  if (paths.headPath === undefined && paths.comparisonPath === undefined) {
    throw new Error('Performance gate requires --head or --comparison');
  }
  if (paths.headPath !== undefined && paths.comparisonPath !== undefined) {
    throw new Error('Performance gate accepts either --head or --comparison');
  }
  if (paths.basePath !== undefined && paths.comparisonPath !== undefined) {
    throw new Error('Performance gate comparison input already contains its base');
  }
  return Object.freeze({ ...paths });
}

function assignPathArgument(
  paths: MutableGatePaths,
  argument: string | undefined,
  value: string,
): void {
  const path = resolve(value);
  if (argument === '--head') {
    paths.headPath = path;
  } else if (argument === '--base') {
    paths.basePath = path;
  } else if (argument === '--comparison') {
    paths.comparisonPath = path;
  } else if (argument === '--policy') {
    paths.policyPath = path;
  } else if (argument === '--summary') {
    paths.summaryPath = path;
  } else {
    throw new Error(`Unknown performance gate argument: ${String(argument)}`);
  }
}

function requireHeadPath(options: GateOptions): string {
  if (options.headPath === undefined) {
    throw new Error('Performance gate requires --head');
  }
  return options.headPath;
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
