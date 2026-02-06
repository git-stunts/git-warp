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

// Health thresholds
const TOMBSTONE_HEALTHY_MAX = 0.15;     // < 15% tombstones = healthy
const TOMBSTONE_WARNING_MAX = 0.30;     // < 30% tombstones = warning
const CACHE_STALE_PENALTY = 20;         // Reduce "freshness" score for stale cache

/**
 * Format seconds as human-readable time (e.g., "2m", "1h", "3d").
 * @param {number|null} seconds
 * @returns {string}
 */
function formatAge(seconds) {
  if (seconds === null || seconds === undefined) {
    return 'unknown';
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return 'unknown';
  }
  const secs = Math.floor(seconds);
  if (secs < 60) {
    return `${secs}s`;
  }
  const minutes = Math.floor(secs / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Get cache freshness percentage and state.
 * @param {Object} status - The status object from check payload
 * @returns {{ percent: number, label: string }}
 */
function getCacheFreshness(status) {
  if (!status) {
    return { percent: 0, label: 'none' };
  }

  switch (status.cachedState) {
    case 'fresh':
      return { percent: 100, label: 'fresh' };
    case 'stale':
      return { percent: 100 - CACHE_STALE_PENALTY, label: 'stale' };
    case 'none':
    default:
      return { percent: 0, label: 'none' };
  }
}

/**
 * Get tombstone health status and color.
 * @param {number} ratio - Tombstone ratio (0-1)
 * @returns {{ status: string, color: Function }}
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
 * @param {Object[]} heads - Writer heads array
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
 * Format checkpoint status line.
 * @param {Object} checkpoint - Checkpoint info
 * @returns {string}
 */
function formatCheckpoint(checkpoint) {
  if (!checkpoint?.sha) {
    return `${colors.warning('none')}`;
  }

  const sha = colors.muted(checkpoint.sha.slice(0, 7));
  const age = formatAge(checkpoint.ageSeconds);

  // Add checkmark for recent checkpoints (< 5 min), warning for older
  let status;
  if (checkpoint.ageSeconds !== null && checkpoint.ageSeconds < 300) {
    status = colors.success('\u2713');
  } else if (checkpoint.ageSeconds !== null && checkpoint.ageSeconds < 3600) {
    status = colors.warning('\u2713');
  } else {
    status = colors.muted('\u2713');
  }

  return `${sha} (${age} ago) ${status}`;
}

/**
 * Format hook status line.
 * @param {Object|null} hook - Hook status
 * @returns {string}
 */
function formatHook(hook) {
  if (!hook) {
    return colors.muted('unknown');
  }

  if (!hook.installed && hook.foreign) {
    return `${colors.warning('\u26A0')} foreign hook present`;
  }

  if (!hook.installed) {
    return `${colors.error('\u2717')} not installed`;
  }

  if (hook.current) {
    return `${colors.success('\u2713')} installed (v${hook.version})`;
  }

  return `${colors.warning('\u2713')} installed (v${hook.version}) \u2014 upgrade available`;
}

/**
 * Format coverage status line.
 * @param {Object} coverage - Coverage info
 * @returns {string}
 */
function formatCoverage(coverage) {
  if (!coverage?.sha) {
    return colors.muted('none');
  }

  const missing = coverage.missingWriters || [];
  if (missing.length === 0) {
    return `${colors.success('\u2713')} all writers merged`;
  }

  const missingList = missing.map((w) => colors.warning(w)).join(', ');
  return `${colors.warning('\u26A0')} missing: ${missingList}`;
}

/**
 * Get overall health status with color and symbol.
 * @param {Object} health - Health object
 * @returns {{ text: string, symbol: string, color: Function }}
 */
function getOverallHealth(health) {
  if (!health) {
    return { text: 'UNKNOWN', symbol: '?', color: colors.muted };
  }

  switch (health.status) {
    case 'healthy':
      return { text: 'HEALTHY', symbol: '\u2713', color: colors.success };
    case 'degraded':
      return { text: 'DEGRADED', symbol: '\u26A0', color: colors.warning };
    case 'unhealthy':
      return { text: 'UNHEALTHY', symbol: '\u2717', color: colors.error };
    default: {
      const safeStatus = typeof health.status === 'string' && health.status.length
        ? health.status
        : 'UNKNOWN';
      return { text: safeStatus.toUpperCase(), symbol: '?', color: colors.muted };
    }
  }
}

/**
 * Build the state section lines (cache, tombstones, patches).
 * @param {Object} status - Status object
 * @param {Object} gc - GC metrics
 * @returns {string[]}
 */
function buildStateLines(status, gc) {
  const lines = [];
  const cache = getCacheFreshness(status);
  const cacheBar = progressBar(cache.percent, 20, { showPercent: false });
  lines.push(`  ${padRight('Cache:', 12)} ${cacheBar} ${cache.percent}% ${cache.label}`);

  const tombstoneRatio = status?.tombstoneRatio ?? gc?.tombstoneRatio ?? 0;
  const tombstonePercent = Math.round(tombstoneRatio * 100);
  const tombstoneHealth = getTombstoneHealth(tombstoneRatio);
  const tBar = tombstoneBar(tombstonePercent, 20);
  lines.push(`  ${padRight('Tombstones:', 12)} ${tBar} ${tombstonePercent}% (${tombstoneHealth.color(tombstoneHealth.status)})`);

  if (status?.patchesSinceCheckpoint !== undefined) {
    lines.push(`  ${padRight('Patches:', 12)} ${status.patchesSinceCheckpoint} since checkpoint`);
  }
  return lines;
}

/**
 * Build the metadata section lines (writers, checkpoint, coverage, hooks).
 * @param {Object} opts - Metadata options
 * @param {Object} opts.writers - Writers info
 * @param {Object} opts.checkpoint - Checkpoint info
 * @param {Object} opts.coverage - Coverage info
 * @param {Object} opts.hook - Hook status
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
 * @param {Object} overall - Overall health info
 * @returns {string}
 */
function getBorderColor(overall) {
  if (overall.color === colors.success) {return 'green';}
  if (overall.color === colors.warning) {return 'yellow';}
  return 'red';
}

/**
 * Render the check view dashboard.
 * @param {Object} payload - The check command payload
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
