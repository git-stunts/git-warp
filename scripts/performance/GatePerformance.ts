import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  PerformanceResult,
  PerformanceScenarioName,
  ScenarioResult,
} from './PerformanceModel.ts';

const SCENARIOS: readonly PerformanceScenarioName[] = Object.freeze([
  'cold-materialize',
  'warm-property-read',
  'incremental-materialize',
  'bounded-memory-read',
]);

type PerformancePolicy = Readonly<{
  absolute: Readonly<{
    cpuTotalMedianMs: Readonly<Record<PerformanceScenarioName, number>>;
    maximumRssBytes: number;
    minimumLogicalToHeapRatio: number;
    wallMedianMs: Readonly<Record<PerformanceScenarioName, number>>;
  }>;
  relative: Readonly<{
    cpuNoiseFloorMs: Readonly<Record<PerformanceScenarioName, number>>;
    cpuRegressionRatio: number;
    rssNoiseFloorBytes: number;
    rssRegressionRatio: number;
    wallNoiseFloorMs: Readonly<Record<PerformanceScenarioName, number>>;
    wallRegressionRatio: number;
  }>;
  schemaVersion: number;
}>;

type GateOptions = Readonly<{
  basePath?: string;
  headPath: string;
  policyPath: string;
  summaryPath?: string;
}>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const policy = await readPolicy(options.policyPath);
  const head = await readResult(options.headPath);
  const base = options.basePath === undefined
    ? null
    : await readResult(options.basePath);
  const failures = [
    ...absoluteFailures(head, policy),
    ...(base === null ? [] : relativeFailures(base, head, policy)),
  ];
  const summary = renderSummary(head, base, policy, failures);
  process.stdout.write(summary);
  if (options.summaryPath !== undefined) {
    await writeFile(options.summaryPath, summary, 'utf8');
  }
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function absoluteFailures(
  head: PerformanceResult,
  policy: PerformancePolicy,
): string[] {
  const failures: string[] = [];
  if (!head.streamingContract.passed) {
    failures.push('bounded-memory contract did not complete successfully');
  }
  if (
    head.streamingContract.logicalToHeapRatio
    < policy.absolute.minimumLogicalToHeapRatio
  ) {
    failures.push('logical graph is not sufficiently larger than the heap cap');
  }
  const memory = head.scenarios['bounded-memory-read'].maxRssBytes.maximum;
  if (memory > policy.absolute.maximumRssBytes) {
    failures.push(metricFailure(
      'bounded-memory maximum RSS',
      memory,
      policy.absolute.maximumRssBytes,
      'bytes',
    ));
  }
  for (const scenario of SCENARIOS) {
    const actual = head.scenarios[scenario].cpuTotalMs.median;
    const maximum = policy.absolute.cpuTotalMedianMs[scenario];
    if (actual > maximum) {
      failures.push(metricFailure(`${scenario} median CPU`, actual, maximum, 'ms'));
    }
    const actualWall = head.scenarios[scenario].wallMs.median;
    const maximumWall = policy.absolute.wallMedianMs[scenario];
    if (actualWall > maximumWall) {
      failures.push(metricFailure(`${scenario} median wall time`, actualWall, maximumWall, 'ms'));
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
  for (const scenario of SCENARIOS) {
    const baseCpu = base.scenarios[scenario].cpuTotalMs.median;
    const headCpu = head.scenarios[scenario].cpuTotalMs.median;
    const maximum = baseCpu * policy.relative.cpuRegressionRatio
      + policy.relative.cpuNoiseFloorMs[scenario];
    if (headCpu > maximum) {
      failures.push(metricFailure(`${scenario} median CPU`, headCpu, maximum, 'ms'));
    }
    const baseWall = base.scenarios[scenario].wallMs.median;
    const headWall = head.scenarios[scenario].wallMs.median;
    const maximumWall = baseWall * policy.relative.wallRegressionRatio
      + policy.relative.wallNoiseFloorMs[scenario];
    if (headWall > maximumWall) {
      failures.push(metricFailure(
        `${scenario} median wall-time regression`,
        headWall,
        maximumWall,
        'ms',
      ));
    }
  }
  const baseRss = base.scenarios['bounded-memory-read'].maxRssBytes.maximum;
  const headRss = head.scenarios['bounded-memory-read'].maxRssBytes.maximum;
  const maximumRss = baseRss * policy.relative.rssRegressionRatio
    + policy.relative.rssNoiseFloorBytes;
  if (headRss > maximumRss) {
    failures.push(metricFailure(
      'bounded-memory maximum RSS regression',
      headRss,
      maximumRss,
      'bytes',
    ));
  }
  return failures;
}

function requireComparable(base: PerformanceResult, head: PerformanceResult): void {
  if (base.schemaVersion !== head.schemaVersion) {
    throw new Error('Base and head performance schemas differ');
  }
  if (
    base.environment.architecture !== head.environment.architecture
    || base.environment.platform !== head.environment.platform
    || nodeMajor(base.environment.node) !== nodeMajor(head.environment.node)
  ) {
    throw new Error('Base and head performance environments are not comparable');
  }
  for (const scenario of SCENARIOS) {
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
  policy: PerformancePolicy,
  failures: readonly string[],
): string {
  const lines = [
    '# git-warp performance gate',
    '',
    `Result: **${failures.length === 0 ? 'PASS' : 'FAIL'}**`,
    '',
    '| Scenario | Head CPU | Base CPU | Head wall | Base wall | Head RSS | CPU MAD |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const scenario of SCENARIOS) {
    const headScenario = head.scenarios[scenario];
    const baseScenario = base?.scenarios[scenario];
    lines.push(summaryRow(scenario, headScenario, baseScenario));
  }
  lines.push(
    '',
    `Streaming graph/heap ratio: ${head.streamingContract.logicalToHeapRatio.toFixed(2)}x `
      + `(minimum ${policy.absolute.minimumLogicalToHeapRatio.toFixed(2)}x)`,
    '',
    base === null
      ? 'Comparison mode: absolute bootstrap policy (base has no v19 harness).'
      : 'Comparison mode: same-runner base/head relative gate plus absolute policy.',
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
    + `${base === undefined ? 'n/a' : `${base.cpuTotalMs.median.toFixed(1)} ms`} | `
    + `${head.wallMs.median.toFixed(1)} ms | `
    + `${base === undefined ? 'n/a' : `${base.wallMs.median.toFixed(1)} ms`} | `
    + `${formatMebibytes(head.maxRssBytes.maximum)} | `
    + `${head.cpuTotalMs.mad.toFixed(1)} ms |`;
}

function formatMebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function metricFailure(
  metric: string,
  actual: number,
  maximum: number,
  unit: 'bytes' | 'ms',
): string {
  const formattedActual = unit === 'bytes' ? formatMebibytes(actual) : `${actual.toFixed(1)} ms`;
  const formattedMaximum = unit === 'bytes'
    ? formatMebibytes(maximum)
    : `${maximum.toFixed(1)} ms`;
  return `${metric}: ${formattedActual} exceeds ${formattedMaximum}`;
}

async function readResult(path: string): Promise<PerformanceResult> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(value) || !isRecord(value['scenarios']) || !isRecord(value['environment'])) {
    throw new Error(`Invalid performance result: ${path}`);
  }
  for (const scenario of SCENARIOS) {
    if (!isRecord(value['scenarios'][scenario])) {
      throw new Error(`Performance result is missing scenario: ${scenario}`);
    }
  }
  return value as PerformanceResult; // nosemgrep: ts-no-unsafe-type-assertion -- benchmark envelope shape validated before policy evaluation
}

async function readPolicy(path: string): Promise<PerformancePolicy> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(value) || !isRecord(value['absolute']) || !isRecord(value['relative'])) {
    throw new Error(`Invalid performance policy: ${path}`);
  }
  return value as PerformancePolicy; // nosemgrep: ts-no-unsafe-type-assertion -- checked-in policy shape validated before use
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

main().catch((raw: unknown) => {
  const message = raw instanceof Error ? raw.stack ?? raw.message : String(raw);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
