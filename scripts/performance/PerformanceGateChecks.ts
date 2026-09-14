import {
  PERFORMANCE_SCENARIOS,
  type PerformanceResult,
  type PerformanceScenarioName,
  type ScenarioResult,
} from './PerformanceModel.ts';
import { comparablePerformanceEnvironment } from './PerformanceEnvironment.ts';
import type { PerformancePolicy } from './PerformancePolicy.ts';
import type { StreamingPerformanceReport } from './StreamingPerformanceReport.ts';

export function absoluteFailures(
  head: PerformanceResult,
  policy: PerformancePolicy,
): string[] {
  return PERFORMANCE_SCENARIOS.flatMap((scenario) => scenarioAbsoluteFailures(
    head.scenarios[scenario],
    scenario,
    policy,
  ));
}

function scenarioAbsoluteFailures(
  result: ScenarioResult,
  scenario: PerformanceScenarioName,
  policy: PerformancePolicy,
): string[] {
  return [
    ...envelopeFailures(result, scenario, policy),
    ...structuralFailures(result, scenario, policy),
  ];
}

function envelopeFailures(
  result: ScenarioResult,
  scenario: PerformanceScenarioName,
  policy: PerformancePolicy,
): string[] {
  const failures: string[] = [];
  const cpu = result.cpuTotalMs.median;
  const cpuCeiling = policy.absolute.cpuTotalMedianMs[scenario];
  if (cpu > cpuCeiling) {
    failures.push(metricFailure(`${scenario} median CPU`, cpu, cpuCeiling));
  }
  const rss = result.maxRssBytes.maximum;
  const rssCeiling = policy.absolute.maxRssBytes[scenario];
  if (rss > rssCeiling) {
    failures.push(byteMetricFailure(`${scenario} maximum RSS`, rss, rssCeiling));
  }
  const heap = result.peakHeapUsedBytes.maximum;
  const heapCeiling = policy.absolute.peakHeapUsedBytes[scenario];
  if (heap > heapCeiling) {
    failures.push(byteMetricFailure(`${scenario} peak heap`, heap, heapCeiling));
  }
  return failures;
}

function structuralFailures(
  result: ScenarioResult,
  scenario: PerformanceScenarioName,
  policy: PerformancePolicy,
): string[] {
  const commands = result.gitCommandCount.median;
  const ceiling = policy.absolute.gitCommandMedian[scenario];
  if (commands <= ceiling) {
    return [];
  }
  return [countMetricFailure(`${scenario} median Git commands`, commands, ceiling)];
}

export function relativeFailures(
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
    const baseCommands = base.scenarios[scenario].gitCommandCount.median;
    const headCommands = head.scenarios[scenario].gitCommandCount.median;
    const commandCeiling = Math.floor(
      baseCommands * policy.relative.gitCommandRegressionRatio,
    );
    if (headCommands > commandCeiling) {
      failures.push(countMetricFailure(
        `${scenario} median Git command regression`,
        headCommands,
        commandCeiling,
      ));
    }
  }
  return failures;
}

export function streamingFailures(
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

function countMetricFailure(metric: string, actual: number, maximum: number): string {
  return `${metric}: ${String(actual)} exceeds ${String(maximum)}`;
}

function byteMetricFailure(metric: string, actual: number, maximum: number): string {
  const mebibyte = 1024 * 1024;
  return `${metric}: ${(actual / mebibyte).toFixed(1)} MiB exceeds `
    + `${(maximum / mebibyte).toFixed(1)} MiB`;
}
