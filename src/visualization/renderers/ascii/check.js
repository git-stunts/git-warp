/**
 * Check command ASCII visualization renderer.
 *
 * Renders a visual health dashboard with progress bars, status indicators,
 * and color-coded health status.
 */

import chalk from 'chalk';
import { createBox } from './box.js';
import { progressBar } from './progress.js';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { formatAge } from './formatters.js';

/**
 * @typedef {{ cachedState?: string, tombstoneRatio?: number, patchesSinceCheckpoint?: number }} CheckStatus
 * @typedef {{ writerId?: string, sha?: string }} WriterHead
 * @typedef {{ sha?: string, ageSeconds?: number | null }} CheckpointInfo
 * @typedef {{ installed?: boolean, foreign?: boolean, current?: boolean, version?: string }} HookInfo
 * @typedef {{ sha?: string, missingWriters?: string[] }} CoverageInfo
 * @typedef {{ status?: string }} HealthInfo
 * @typedef {{ tombstoneRatio?: number }} GCInfo
 * @typedef {{ heads?: WriterHead[] }} WritersInfo
 * @typedef {{ graph: string, health: HealthInfo, status: CheckStatus, writers: WritersInfo, checkpoint: CheckpointInfo, coverage: CoverageInfo, gc: GCInfo, hook: HookInfo | null }} CheckPayload
 */

// Health thresholds
const TOMBSTONE_HEALTHY_MAX = 0.15;     // < 15% tombstones = healthy
const TOMBSTONE_WARNING_MAX = 0.30;     // < 30% tombstones = warning
const CACHE_STALE_PENALTY = 20;         // Reduce "freshness" score for stale cache

/** @type {Record<string, { percent: number, label: string }>} */
const CACHE_STATE_MAP = {
  fresh: { percent: 100, label: 'fresh' },
  stale: { percent: 100 - CACHE_STALE_PENALTY, label: 'stale' },
};

/** @type {{ percent: number, label: string }} */
const CACHE_STATE_NONE = { percent: 0, label: 'none' };

/**
 * Get cache freshness percentage and state.
 * @param {CheckStatus | null} status - The status object from check payload
 * @returns {{ percent: number, label: string }}
 */
function getCacheFreshness(status) {
  if (status === null || status === undefined) {
    return CACHE_STATE_NONE;
  }
  const key = status.cachedState;
  return (typeof key === 'string' ? CACHE_STATE_MAP[key] : undefined) ?? CACHE_STATE_NONE;
}

/**
 * Get tombstone health status and color.
 * @param {number} ratio - Tombstone ratio (0-1)
 * @returns {{ status: string, color: (s: string) => string }}
 */
function getTombstoneHealth(ratio) {
  if (ratio < TOMBSTONE_HEALTHY_MAX) {
    return { status: 'healthy', color: colors.success };
  }
  if (ratio < TOMBSTONE_WARNING_MAX) {
    return { status: 'warning', color: colors.warning };
  }
  return { status: 'critical', color: colors.error };
}

/**
 * Create a custom progress bar with inverted colors for tombstones.
 * Lower is better for tombstones.
 * @param {number} percent - Percentage (0-100)
 * @param {number} width - Bar width
 * @returns {string}
 */
function tombstoneBar(percent, width = 20) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clampedPercent / 100) * width);
  const emptyCount = width - filledCount;
  const bar = '\u2588'.repeat(filledCount) + '\u2591'.repeat(emptyCount);

  // Invert: lower tombstone ratio is better (green), higher is bad (red)
  if (percent <= TOMBSTONE_HEALTHY_MAX * 100) {
    return chalk.green(bar);
  }
  if (percent <= TOMBSTONE_WARNING_MAX * 100) {
    return chalk.yellow(bar);
  }
  return chalk.red(bar);
}

/**
 * Format writer information for display.
 * @param {WriterHead[] | undefined} heads - Writer heads array
 * @returns {string}
 */
function formatWriters(heads) {
  if (!heads || heads.length === 0) {
    return colors.muted('none');
  }

  // For now, just list writer IDs with their SHA prefixes
  return heads
    .map((h) => `${colors.primary(h.writerId ?? 'unknown')} (${colors.muted((h.sha ?? '').slice(0, 7) || '?')})`)
    .join(' | ');
}

/**
 * Returns a colored checkmark based on age in seconds.
 * @param {number|null} ageSeconds - Age in seconds or null
 * @returns {string} Colored checkmark character
 */
function checkpointAgeSymbol(ageSeconds) {
  if (ageSeconds !== null && ageSeconds < 300) {
    return colors.success('\u2713');
  }
  if (ageSeconds !== null && ageSeconds < 3600) {
    return colors.warning('\u2713');
  }
  return colors.muted('\u2713');
}

/**
 * Tests whether a checkpoint has a valid SHA string.
 * @param {CheckpointInfo | null | undefined} checkpoint
 * @returns {checkpoint is CheckpointInfo & { sha: string }}
 */
function hasCheckpointSha(checkpoint) {
  return checkpoint !== null && checkpoint !== undefined &&
    typeof checkpoint.sha === 'string' && checkpoint.sha.length > 0;
}

/**
 * Format checkpoint status line.
 * @param {CheckpointInfo | null} checkpoint - Checkpoint info
 * @returns {string}
 */
function formatCheckpoint(checkpoint) {
  if (!hasCheckpointSha(checkpoint)) {
    return `${colors.warning('none')}`;
  }

  const sha = colors.muted(checkpoint.sha.slice(0, 7));
  const ageSeconds = checkpoint.ageSeconds ?? null;
  const age = formatAge(ageSeconds);
  const status = checkpointAgeSymbol(ageSeconds);

  return `${sha} (${age} ago) ${status}`;
}

/**
 * Formats a hook that is not installed (distinguishes foreign vs missing).
 * @param {HookInfo} hook - Hook status with installed === false
 * @returns {string}
 */
function formatUninstalledHook(hook) {
  if (hook.foreign === true) {
    return `${colors.warning('\u26A0')} foreign hook present`;
  }
  return `${colors.error('\u2717')} not installed`;
}

/**
 * Format hook status line.
 * @param {HookInfo|null} hook - Hook status
 * @returns {string}
 */
function formatHook(hook) {
  if (hook === null || hook === undefined) {
    return colors.muted('unknown');
  }

  if (hook.installed !== true) {
    return formatUninstalledHook(hook);
  }

  if (hook.current === true) {
    return `${colors.success('\u2713')} installed (v${hook.version})`;
  }

  return `${colors.warning('\u2713')} installed (v${hook.version}) \u2014 upgrade available`;
}

/**
 * Tests whether a coverage object has a valid SHA string.
 * @param {CoverageInfo | null | undefined} coverage
 * @returns {coverage is CoverageInfo & { sha: string }}
 */
function hasCoverageSha(coverage) {
  return coverage !== null && coverage !== undefined &&
    typeof coverage.sha === 'string' && coverage.sha.length > 0;
}

/**
 * Format coverage status line.
 * @param {CoverageInfo | null} coverage - Coverage info
 * @returns {string}
 */
function formatCoverage(coverage) {
  if (!hasCoverageSha(coverage)) {
    return colors.muted('none');
  }

  const missing = coverage.missingWriters ?? [];
  if (missing.length === 0) {
    return `${colors.success('\u2713')} all writers merged`;
  }

  const missingList = missing.map((w) => colors.warning(w)).join(', ');
  return `${colors.warning('\u26A0')} missing: ${missingList}`;
}

/** @type {Record<string, { text: string, symbol: string, color: (s: string) => string }>} */
const HEALTH_STATUS_MAP = {
  healthy: { text: 'HEALTHY', symbol: '\u2713', color: colors.success },
  degraded: { text: 'DEGRADED', symbol: '\u26A0', color: colors.warning },
  unhealthy: { text: 'UNHEALTHY', symbol: '\u2717', color: colors.error },
};

/** @type {{ text: string, symbol: string, color: (s: string) => string }} */
const UNKNOWN_HEALTH = { text: 'UNKNOWN', symbol: '?', color: colors.muted };

/**
 * Looks up health status from the known status map, returning a fallback for unknown values.
 * @param {string | undefined} status - Status string from health info
 * @returns {{ text: string, symbol: string, color: (s: string) => string }}
 */
function resolveHealthStatus(status) {
  if (typeof status !== 'string') {
    return UNKNOWN_HEALTH;
  }
  const mapped = HEALTH_STATUS_MAP[status];
  if (mapped !== undefined) {
    return mapped;
  }
  const label = status.length > 0 ? status.toUpperCase() : 'UNKNOWN';
  return { text: label, symbol: '?', color: colors.muted };
}

/**
 * Get overall health status with color and symbol.
 * @param {HealthInfo | null} health - Health object
 * @returns {{ text: string, symbol: string, color: (s: string) => string }}
 */
function getOverallHealth(health) {
  if (health === null || health === undefined) {
    return UNKNOWN_HEALTH;
  }
  return resolveHealthStatus(health.status);
}

/**
 * Formats the tombstone health line including bar and status label.
 * @param {number} tombstoneRatio - Tombstone ratio (0-1)
 * @returns {string} Formatted tombstone line
 */
function formatTombstoneLine(tombstoneRatio) {
  const tombstonePercent = Math.round(tombstoneRatio * 100);
  const tombstoneHealth = getTombstoneHealth(tombstoneRatio);
  const tBar = tombstoneBar(tombstonePercent, 20);
  return `  ${padRight('Tombstones:', 12)} ${tBar} ${tombstonePercent}% (${tombstoneHealth.color(tombstoneHealth.status)})`;
}

/**
 * Formats the cache freshness line including progress bar and label.
 * @param {CheckStatus | null} status - Status object
 * @returns {string} Formatted cache line
 */
function formatCacheLine(status) {
  const cache = getCacheFreshness(status);
  const cacheBar = progressBar(cache.percent, 20, { showPercent: false });
  return `  ${padRight('Cache:', 12)} ${cacheBar} ${cache.percent}% ${cache.label}`;
}

/**
 * Resolves the tombstone ratio from status or GC metrics.
 * @param {CheckStatus | null} status - Status object
 * @param {GCInfo | null} gc - GC metrics
 * @returns {number}
 */
function resolveTombstoneRatio(status, gc) {
  return status?.tombstoneRatio ?? gc?.tombstoneRatio ?? 0;
}

/**
 * Build the state section lines (cache, tombstones, patches).
 * @param {CheckStatus | null} status - Status object
 * @param {GCInfo | null} gc - GC metrics
 * @returns {string[]}
 */
function buildStateLines(status, gc) {
  const lines = [
    formatCacheLine(status),
    formatTombstoneLine(resolveTombstoneRatio(status, gc)),
  ];

  if (status?.patchesSinceCheckpoint !== undefined) {
    lines.push(`  ${padRight('Patches:', 12)} ${status.patchesSinceCheckpoint} since checkpoint`);
  }
  return lines;
}

/**
 * Build the metadata section lines (writers, checkpoint, coverage, hooks).
 * @param {{ writers: WritersInfo, checkpoint: CheckpointInfo, coverage: CoverageInfo, hook: HookInfo | null }} opts - Metadata options
 * @returns {string[]}
 */
function buildMetadataLines({ writers, checkpoint, coverage, hook }) {
  return [
    `  ${padRight('Writers:', 12)} ${formatWriters(writers?.heads)}`,
    `  ${padRight('Checkpoint:', 12)} ${formatCheckpoint(checkpoint)}`,
    `  ${padRight('Coverage:', 12)} ${formatCoverage(coverage)}`,
    `  ${padRight('Hooks:', 12)} ${formatHook(hook)}`,
  ];
}

/**
 * Determine border color based on health status.
 * @param {{ text: string, symbol: string, color: (s: string) => string }} overall - Overall health info
 * @returns {string}
 */
function getBorderColor(overall) {
  if (overall.color === colors.success) {return 'green';}
  if (overall.color === colors.warning) {return 'yellow';}
  return 'red';
}

/**
 * Render the check view dashboard.
 * @param {CheckPayload} payload - The check command payload
 * @returns {string} Formatted dashboard string
 */
export function renderCheckView(payload) {
  const { graph, health, status, writers, checkpoint, coverage, gc, hook } = payload;
  const overall = getOverallHealth(health);

  const lines = [
    colors.bold(`  GRAPH HEALTH: ${graph}`),
    '',
    ...buildStateLines(status, gc),
    '',
    ...buildMetadataLines({ writers, checkpoint, coverage, hook }),
    '',
    `  Overall: ${overall.color(overall.symbol)} ${overall.color(overall.text)}`,
  ];

  const box = createBox(lines.join('\n'), {
    title: 'HEALTH',
    titleAlignment: 'center',
    borderColor: getBorderColor(overall),
  });
  return `${box}\n`;
}

export default { renderCheckView };
