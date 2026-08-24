import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parsePerformanceComparison,
  type PerformanceComparison,
} from './PerformanceComparisonModel.ts';
import {
  parsePerformanceResult,
  type PerformanceResult,
} from './PerformanceModel.ts';
import {
  absoluteFailures,
  relativeFailures,
  streamingFailures,
} from './PerformanceGateChecks.ts';
import {
  PerformancePolicySchema,
  type PerformancePolicy,
} from './PerformancePolicy.ts';
import { renderPerformanceSummary } from './PerformanceSummary.ts';
import type { StreamingPerformanceReport } from './StreamingPerformanceReport.ts';

export { PerformancePolicySchema, type PerformancePolicy };

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
