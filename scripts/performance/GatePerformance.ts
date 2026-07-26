import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import z from 'zod';
import {
  PERFORMANCE_SCENARIOS,
  parsePerformanceResult,
  type PerformanceResult,
  type PerformanceScenarioName,
  type ScenarioResult,
} from './PerformanceModel.ts';

const scenarioThresholds = z.object({
  'cold-materialize': z.number().finite().nonnegative(),
  'incremental-materialize': z.number().finite().nonnegative(),
  'warm-materialize': z.number().finite().nonnegative(),
}).strict();

export const PerformancePolicySchema = z.object({
  absolute: z.object({
    cpuTotalMedianMs: scenarioThresholds,
  }).strict(),
  relative: z.object({
    cpuNoiseFloorMs: scenarioThresholds,
    cpuRegressionRatio: z.number().finite().gte(1),
  }).strict(),
  schemaVersion: z.literal(1),
  wallTime: z.literal('diagnostic'),
}).strict();

export type PerformancePolicy = Readonly<z.infer<typeof PerformancePolicySchema>>;

type GateOptions = Readonly<{
  basePath?: string;
  headPath: string;
  policyPath: string;
  summaryPath?: string;
}>;

export type PerformanceGateEvaluation = Readonly<{
  failures: readonly string[];
  summary: string;
}>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const policy = await readPolicy(options.policyPath);
  const head = await readResult(options.headPath);
  const base = options.basePath === undefined
    ? null
    : await readResult(options.basePath);
  const evaluation = evaluatePerformanceGate(head, base, policy);
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
): PerformanceGateEvaluation {
  const failures = [
    ...absoluteFailures(head, policy),
    ...(base === null ? [] : relativeFailures(base, head, policy)),
  ];
  return Object.freeze({
    failures: Object.freeze(failures),
    summary: renderSummary(head, base, failures),
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

function requireComparable(base: PerformanceResult, head: PerformanceResult): void {
  if (
    base.environment.architecture !== head.environment.architecture
    || base.environment.platform !== head.environment.platform
    || base.environment.git !== head.environment.git
    || base.environment.gitCas !== head.environment.gitCas
    || nodeMajor(base.environment.node) !== nodeMajor(head.environment.node)
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

function renderSummary(
  head: PerformanceResult,
  base: PerformanceResult | null,
  failures: readonly string[],
): string {
  const lines = [
    '# git-warp materialization performance gate',
    '',
    `Result: **${failures.length === 0 ? 'PASS' : 'FAIL'}**`,
    '',
    '| Scenario | Head CPU | Base CPU | Head wall | Base wall | Head RSS | CPU MAD |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const scenario of PERFORMANCE_SCENARIOS) {
    lines.push(summaryRow(
      scenario,
      head.scenarios[scenario],
      base?.scenarios[scenario],
    ));
  }
  lines.push(
    '',
    'CPU is blocking. Wall time and RSS are diagnostic in this materialization slice.',
    '',
    base === null
      ? 'Comparison mode: reviewed absolute bootstrap policy.'
      : 'Comparison mode: same-environment base/head CPU gate plus absolute policy.',
  );
  if (failures.length > 0) {
    lines.push('', '## Failures', '', ...failures.map((failure) => `- ${failure}`));
  }
  return `${lines.join('\n')}\n`;
}

function summaryRow(
  scenario: PerformanceScenarioName,
  head: ScenarioResult,
  base: ScenarioResult | undefined,
): string {
  return `| ${scenario} | ${head.cpuTotalMs.median.toFixed(1)} ms | `
    + `${formatMetric(base?.cpuTotalMs.median, 'ms')} | `
    + `${head.wallMs.median.toFixed(1)} ms | `
    + `${formatMetric(base?.wallMs.median, 'ms')} | `
    + `${formatMebibytes(head.maxRssBytes.maximum)} | `
    + `${head.cpuTotalMs.mad.toFixed(1)} ms |`;
}

function formatMetric(value: number | undefined, unit: string): string {
  return value === undefined ? 'n/a' : `${value.toFixed(1)} ${unit}`;
}

function formatMebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function metricFailure(metric: string, actual: number, maximum: number): string {
  return `${metric}: ${actual.toFixed(1)} ms exceeds ${maximum.toFixed(1)} ms`;
}

async function readResult(path: string): Promise<PerformanceResult> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return parsePerformanceResult(value);
}

async function readPolicy(path: string): Promise<PerformancePolicy> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return PerformancePolicySchema.parse(value);
}

function nodeMajor(version: string): string {
  return version.replace(/^v/u, '').split('.')[0] ?? version;
}

function parseOptions(args: readonly string[]): GateOptions {
  let headPath: string | undefined;
  let basePath: string | undefined;
  let summaryPath: string | undefined;
  let policyPath = resolve('benchmarks/v19/policy.json');
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Performance gate argument requires a value: ${String(argument)}`);
    }
    if (argument === '--head') {
      headPath = resolve(value);
    } else if (argument === '--base') {
      basePath = resolve(value);
    } else if (argument === '--policy') {
      policyPath = resolve(value);
    } else if (argument === '--summary') {
      summaryPath = resolve(value);
    } else {
      throw new Error(`Unknown performance gate argument: ${String(argument)}`);
    }
    index += 1;
  }
  if (headPath === undefined) {
    throw new Error('Performance gate requires --head');
  }
  return Object.freeze({
    ...(basePath === undefined ? {} : { basePath }),
    headPath,
    policyPath,
    ...(summaryPath === undefined ? {} : { summaryPath }),
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
