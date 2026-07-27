import type {
  MigratedReadPerformancePolicy,
  MigratedReadRuntimeSummary,
  MigratedReadScenario,
  MigratedReadScenarioSummary,
} from './MigratedReadPerformanceModel.ts';
import {
  MIGRATED_READ_SCENARIOS,
} from './MigratedReadPerformanceModel.ts';

export function evaluateMigratedReadPerformance(
  v18: MigratedReadRuntimeSummary,
  v19: MigratedReadRuntimeSummary,
  policy: MigratedReadPerformancePolicy,
): readonly string[] {
  return Object.freeze(MIGRATED_READ_SCENARIOS.flatMap((scenario) =>
    scenarioFailures(scenario, v18[scenario], v19[scenario], policy)
  ));
}

function scenarioFailures(
  scenario: MigratedReadScenario,
  v18: MigratedReadScenarioSummary,
  v19: MigratedReadScenarioSummary,
  policy: MigratedReadPerformancePolicy,
): string[] {
  const failures: string[] = [];
  requireStorageEvidence(failures, scenario, v18, v19);
  const wallImprovement = v18.wallMs.median - v19.wallMs.median;
  const wallRatio = v19.wallMs.median / v18.wallMs.median;
  const maximumWallRatio = 1 - policy.minimumWallImprovementRatio;
  if (
    wallImprovement < policy.minimumWallImprovementMs
    || wallRatio > maximumWallRatio
  ) {
    failures.push(
      `${scenario} wall improvement was ${formatPercent(1 - wallRatio)} `
        + `and ${wallImprovement.toFixed(1)} ms; required `
        + `${formatPercent(policy.minimumWallImprovementRatio)} and `
        + `${policy.minimumWallImprovementMs.toFixed(1)} ms`,
    );
  }
  const gitRatio = v19.gitCommandCount.median / v18.gitCommandCount.median;
  const maximumGitRatio = 1 - policy.minimumGitCommandImprovementRatio;
  if (gitRatio > maximumGitRatio) {
    failures.push(
      `${scenario} Git command improvement was ${formatPercent(1 - gitRatio)}; `
        + `required ${formatPercent(policy.minimumGitCommandImprovementRatio)}`,
    );
  }
  const cpuDelta = v19.cpuTotalMs.median - v18.cpuTotalMs.median;
  const cpuRatio = v19.cpuTotalMs.median / v18.cpuTotalMs.median;
  if (
    cpuDelta > policy.cpuNoiseFloorMs
    && cpuRatio > policy.maximumCpuRatio
  ) {
    failures.push(
      `${scenario} CPU ratio ${cpuRatio.toFixed(3)} exceeds `
        + `${policy.maximumCpuRatio.toFixed(3)}`,
    );
  }
  ratioFailure(
    failures,
    scenario,
    'peak heap',
    v18.peakHeapUsedBytes.median,
    v19.peakHeapUsedBytes.median,
    policy.maximumHeapRatio,
  );
  ratioFailure(
    failures,
    scenario,
    'peak RSS',
    v18.maxRssBytes.median,
    v19.maxRssBytes.median,
    policy.maximumRssRatio,
  );
  return failures;
}

function requireStorageEvidence(
  failures: string[],
  scenario: string,
  v18: MigratedReadScenarioSummary,
  v19: MigratedReadScenarioSummary,
): void {
  if (v18.samples.some((sample) =>
    sample.basisKind !== 'checkpoint-tail'
    || sample.supportStatus !== 'checkpoint-tail'
    || sample.receiptStatus !== null
  )) {
    failures.push(`${scenario} v18 checkpoint-tail evidence is incomplete`);
  }
  if (v19.samples.some((sample) =>
    sample.basisKind !== 'opaque-evidence'
    || sample.supportStatus !== 'supported'
    || sample.receiptStatus !== 'completed'
  )) {
    failures.push(`${scenario} v19 retained evidence is incomplete`);
  }
}

function ratioFailure(
  failures: string[],
  scenario: string,
  metric: string,
  v18: number,
  v19: number,
  maximumRatio: number,
): void {
  const ratio = v19 / v18;
  if (ratio > maximumRatio) {
    failures.push(
      `${scenario} ${metric} ratio ${ratio.toFixed(3)} exceeds `
        + `${maximumRatio.toFixed(3)}`,
    );
  }
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
