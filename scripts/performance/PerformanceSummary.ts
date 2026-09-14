import {
  PERFORMANCE_SCENARIOS,
  type PerformanceResult,
  type PerformanceScenarioName,
  type ScenarioResult,
} from './PerformanceModel.ts';
import type { StreamingPerformanceReport }
  from './StreamingPerformanceReport.ts';

export function renderPerformanceSummary(
  head: PerformanceResult,
  base: PerformanceResult | null,
  failures: readonly string[],
  streamingHead?: StreamingPerformanceReport,
  streamingBase?: StreamingPerformanceReport,
  executionOrder?: readonly string[],
): string {
  const lines = [
    '# git-warp v19 performance gate',
    '',
    `Result: **${failures.length === 0 ? 'PASS' : 'FAIL'}**`,
    '',
    '## Materialization',
    '',
    '| Scenario | Head CPU | Base CPU | CPU delta | Head Git cmds | Base Git cmds '
      + '| Head wall | Head RSS | CPU MAD |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const scenario of PERFORMANCE_SCENARIOS) {
    lines.push(materializationRow(
      scenario,
      head.scenarios[scenario],
      base?.scenarios[scenario],
    ));
  }
  lines.push(
    '',
    'CPU is blocking. Wall time remains diagnostic. Peak RSS and heap are '
      + 'blocking absolute envelopes. Git command counts are structural: they do '
      + 'not vary with machine speed, so they gate both absolutely and relatively.',
    '',
    base === null
      ? 'Comparison mode: reviewed absolute bootstrap policy.'
      : 'Comparison mode: same-runner base/head CPU and Git-command gates '
        + 'plus absolute policy.',
  );
  if (streamingHead !== undefined) {
    lines.push(
      '',
      '## Oversized Observer streaming',
      '',
      '| Metric | Head | Base | Delta |',
      '|---|---:|---:|---:|',
      streamingRow(
        'Throughput',
        streamingHead.streaming.metrics.throughputPerSecond,
        streamingBase?.streaming.metrics.throughputPerSecond,
        ' readings/s',
      ),
      streamingRow(
        'Time to first reading',
        streamingHead.streaming.metrics.timeToFirstReadingMs,
        streamingBase?.streaming.metrics.timeToFirstReadingMs,
        ' ms',
      ),
      streamingByteRow(
        'Peak heap',
        streamingHead.streaming.metrics.peakHeapUsedBytes,
        streamingBase?.streaming.metrics.peakHeapUsedBytes,
      ),
      streamingByteRow(
        'Peak RSS',
        streamingHead.streaming.metrics.maxRssBytes,
        streamingBase?.streaming.metrics.maxRssBytes,
      ),
      '',
      `Head streamed ${String(streamingHead.fixture.logicalPropertyBytes)} logical `
        + `bytes under ${String(streamingHead.streaming.config.maxOldSpaceBytes)} `
        + 'old-space bytes with hostile-control OOM evidence.',
    );
  }
  if (executionOrder !== undefined) {
    lines.push('', `Execution order: \`${executionOrder.join(' → ')}\`.`);
  }
  if (failures.length > 0) {
    lines.push('', '## Failures', '', ...failures.map((failure) => `- ${failure}`));
  }
  return `${lines.join('\n')}\n`;
}

function materializationRow(
  scenario: PerformanceScenarioName,
  head: ScenarioResult,
  base: ScenarioResult | undefined,
): string {
  return `| ${scenario} | ${head.cpuTotalMs.median.toFixed(1)} ms | `
    + `${formatMetric(base?.cpuTotalMs.median, 'ms')} | `
    + `${formatDelta(head.cpuTotalMs.median, base?.cpuTotalMs.median)} | `
    + `${formatCount(head.gitCommandCount.median)} | `
    + `${formatCount(base?.gitCommandCount.median)} | `
    + `${head.wallMs.median.toFixed(1)} ms | `
    + `${formatMebibytes(head.maxRssBytes.maximum)} | `
    + `${head.cpuTotalMs.mad.toFixed(1)} ms |`;
}

function streamingRow(
  name: string,
  head: number,
  base: number | undefined,
  unit: string,
): string {
  return `| ${name} | ${head.toFixed(1)}${unit} | `
    + `${formatMetric(base, unit.trim())} | ${formatDelta(head, base)} |`;
}

function streamingByteRow(
  name: string,
  head: number,
  base: number | undefined,
): string {
  return `| ${name} | ${formatMebibytes(head)} | `
    + `${base === undefined ? 'n/a' : formatMebibytes(base)} | `
    + `${formatDelta(head, base)} |`;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? 'n/a' : String(value);
}

function formatMetric(value: number | undefined, unit: string): string {
  return value === undefined ? 'n/a' : `${value.toFixed(1)} ${unit}`;
}

function formatMebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatDelta(head: number, base: number | undefined): string {
  if (base === undefined || base === 0) {
    return 'n/a';
  }
  const percent = ((head - base) / base) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}
