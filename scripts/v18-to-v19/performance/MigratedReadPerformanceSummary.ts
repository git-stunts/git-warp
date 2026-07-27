import type {
  MigratedReadPerformanceReport,
  MigratedReadScenario,
  MigratedReadScenarioSummary,
} from './MigratedReadPerformanceModel.ts';
import {
  MIGRATED_READ_SCENARIOS,
} from './MigratedReadPerformanceModel.ts';

export function renderMigratedReadPerformanceSummary(
  report: MigratedReadPerformanceReport,
): string {
  const rows = MIGRATED_READ_SCENARIOS.map((scenario) => renderRow(
    scenario,
    report.runtimes.v18[scenario],
    report.runtimes.v19[scenario],
  )).join('\n');
  const failures = report.failures.length === 0
    ? ''
    : `\n## Failures\n\n${report.failures.map((failure) =>
      `- ${failure}`
    ).join('\n')}\n`;
  return `# Migrated v18-to-v19 retained-read performance

Result: **${report.result}**

| Scenario | v18 wall | v19 wall | Improvement | v18 Git | v19 Git | Improvement | v19 heap |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows}

The authentic ${formatMebibytes(report.fixture.bundleBytes)} fixture contains ${
  String(report.fixture.patchCount)
} published-v18 patches. One-shot migration took ${
  report.migration.wallMs.toFixed(1)
} ms and is excluded from every retained-read sample.

Candidate commit: \`${report.environment.v19Commit}\` with package metadata
\`${report.environment.v19PackageVersion}\` and
\`@git-stunts/git-cas@${report.environment.v19GitCas}\`.

Each runtime contributed ${String(report.measuredRuns)} cold and ${
  String(report.measuredRuns)
} warm samples after ${String(report.warmupRuns)} warmup pair(s). The worker
reads \`medium:document:015.ordinal\` and must return the semantic value
\`15\`; v19 must also leave a completed Receipt.
${failures}`;
}

function renderRow(
  scenario: MigratedReadScenario,
  v18: MigratedReadScenarioSummary,
  v19: MigratedReadScenarioSummary,
): string {
  return `| ${scenario} | ${v18.wallMs.median.toFixed(1)} ms | `
    + `${v19.wallMs.median.toFixed(1)} ms | `
    + `${formatImprovement(v18.wallMs.median, v19.wallMs.median)} | `
    + `${v18.gitCommandCount.median.toFixed(0)} | `
    + `${v19.gitCommandCount.median.toFixed(0)} | `
    + `${formatImprovement(
      v18.gitCommandCount.median,
      v19.gitCommandCount.median,
    )} | ${formatMebibytes(v19.peakHeapUsedBytes.median)} |`;
}

function formatImprovement(v18: number, v19: number): string {
  return `${((1 - (v19 / v18)) * 100).toFixed(1)}%`;
}

function formatMebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
