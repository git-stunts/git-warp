/**
 * ASCII renderer for the `history --view` command.
 * Displays a visual timeline of patches for one or more writers.
 */

import { colors } from './colors.js';
import { createBox } from './box.js';
import { padRight, padLeft } from '../../utils/unicode.js';
import { truncate } from '../../utils/truncate.js';

// Default pagination settings
const DEFAULT_PAGE_SIZE = 20;

// Timeline characters
const TIMELINE = {
  vertical: '\u2502',     // │
  dot: '\u25CF',          // ●
  connector: '\u251C',    // ├
  end: '\u2514',          // └
  top: '\u250C',          // ┌
};

// Operation type to display info mapping
const OP_DISPLAY = {
  NodeAdd: { symbol: '+', label: 'node', color: colors.success },
  NodeTombstone: { symbol: '-', label: 'node', color: colors.error },
  EdgeAdd: { symbol: '+', label: 'edge', color: colors.success },
  EdgeTombstone: { symbol: '-', label: 'edge', color: colors.error },
  PropSet: { symbol: '~', label: 'prop', color: colors.warning },
  BlobValue: { symbol: '+', label: 'blob', color: colors.primary },
};

// Default empty operation summary
const EMPTY_OP_SUMMARY = Object.freeze({
  NodeAdd: 0,
  EdgeAdd: 0,
  PropSet: 0,
  NodeTombstone: 0,
  EdgeTombstone: 0,
  BlobValue: 0,
});

/**
 * Summarizes operations in a patch.
 * @param {Object[]} ops - Array of patch operations
 * @returns {Object} Summary with counts by operation type
 */
function summarizeOps(ops) {
  const summary = { ...EMPTY_OP_SUMMARY };
  for (const op of ops) {
    if (op.type && summary[op.type] !== undefined) {
      summary[op.type]++;
    }
  }
  return summary;
}

/**
 * Formats operation summary as a colored string.
 * @param {Object} summary - Operation counts by type
 * @param {number} maxWidth - Maximum width for the summary string
 * @returns {string} Formatted summary string
 */
function formatOpSummary(summary, maxWidth = 40) {
  const order = ['NodeAdd', 'EdgeAdd', 'PropSet', 'NodeTombstone', 'EdgeTombstone', 'BlobValue'];
  const parts = order
    .filter((opType) => summary[opType] > 0)
    .map((opType) => {
      const display = OP_DISPLAY[opType];
      return { text: `${display.symbol}${summary[opType]}${display.label}`, color: display.color };
    });

  if (parts.length === 0) {
    return colors.muted('(empty)');
  }

  // Truncate plain text first to avoid breaking ANSI escape sequences
  const plain = parts.map((p) => p.text).join(' ');
  const truncated = truncate(plain, maxWidth);
  if (truncated === plain) {
    return parts.map((p) => p.color(p.text)).join(' ');
  }
  return colors.muted(truncated);
}

/**
 * Ensures entry has an opSummary, computing one if needed.
 * @param {Object} entry - Patch entry
 * @returns {Object} Operation summary
 */
function ensureOpSummary(entry) {
  if (entry.opSummary) {
    return entry.opSummary;
  }
  if (entry.ops) {
    return summarizeOps(entry.ops);
  }
  return { ...EMPTY_OP_SUMMARY };
}

/**
 * Paginates entries, returning display entries and truncation info.
 * @param {Object[]} entries - All entries
 * @param {number} pageSize - Page size
 * @param {boolean} showAll - Whether to show all
 * @returns {{displayEntries: Object[], truncated: boolean, hiddenCount: number}}
 */
function paginateEntries(entries, pageSize, showAll) {
  if (showAll || entries.length <= pageSize) {
    return { displayEntries: entries, truncated: false, hiddenCount: 0 };
  }
  return {
    displayEntries: entries.slice(-pageSize),
    truncated: true,
    hiddenCount: entries.length - pageSize,
  };
}

/**
 * Renders the truncation indicator at the top of the timeline.
 * @param {boolean} truncated - Whether entries are truncated
 * @param {number} hiddenCount - Number of hidden entries
 * @returns {string[]} Lines to prepend
 */
function renderTruncationIndicator(truncated, hiddenCount) {
  if (truncated) {
    return [
      colors.muted(`  ${TIMELINE.top}${TIMELINE.vertical} ... ${hiddenCount} older patches hidden`),
      `  ${TIMELINE.vertical}`,
    ];
  }
  return [`  ${TIMELINE.top}`];
}

/**
 * Renders a single patch entry line.
 * @param {Object} params - Entry parameters
 * @returns {string} Formatted entry line
 */
function renderEntryLine({ entry, isLast, lamportWidth, writerStr, maxWriterIdLen }) {
  const connector = isLast ? TIMELINE.end : TIMELINE.connector;
  const shortSha = (entry.sha || '').slice(0, 7);
  const lamportStr = padLeft(String(entry.lamport), lamportWidth);
  const opSummary = ensureOpSummary(entry);
  const opSummaryStr = formatOpSummary(opSummary, writerStr ? 30 : 40);

  if (writerStr) {
    const paddedWriter = padRight(writerStr, maxWriterIdLen);
    return `  ${connector}${TIMELINE.dot} ${colors.muted(`L${lamportStr}`)} ${colors.primary(paddedWriter)}:${colors.muted(shortSha)} ${opSummaryStr}`;
  }
  return `  ${connector}${TIMELINE.dot} ${colors.muted(`L${lamportStr}`)} ${colors.primary(shortSha)}  ${opSummaryStr}`;
}

/**
 * Renders single-writer timeline header.
 * @param {string} writer - Writer ID
 * @returns {string[]} Header lines
 */
function renderSingleWriterHeader(writer) {
  return [colors.bold(`  WRITER: ${writer}`), ''];
}

/**
 * Renders single-writer timeline footer.
 * @param {number} totalCount - Total entry count
 * @returns {string[]} Footer lines
 */
function renderSingleWriterFooter(totalCount) {
  const label = totalCount === 1 ? 'patch' : 'patches';
  return ['', colors.muted(`  Total: ${totalCount} ${label}`)];
}

/**
 * Renders single-writer timeline view.
 * @param {Object} payload - History payload
 * @param {Object} options - Rendering options
 * @returns {string[]} Lines for the timeline
 */
function renderSingleWriterTimeline(payload, options) {
  const { entries, writer } = payload;
  const { pageSize = DEFAULT_PAGE_SIZE, showAll = false } = options;

  const lines = renderSingleWriterHeader(writer);

  if (entries.length === 0) {
    lines.push(colors.muted('  (no patches)'));
    return lines;
  }

  const { displayEntries, truncated, hiddenCount } = paginateEntries(entries, pageSize, showAll);
  if (displayEntries.length === 0) {
    lines.push(colors.muted('  (no patches)'));
    return lines;
  }
  const maxLamport = Math.max(...displayEntries.map((e) => e.lamport));
  const lamportWidth = String(maxLamport).length;

  lines.push(...renderTruncationIndicator(truncated, hiddenCount));

  for (let i = 0; i < displayEntries.length; i++) {
    const isLast = i === displayEntries.length - 1;
    lines.push(renderEntryLine({ entry: displayEntries[i], isLast, lamportWidth }));
  }

  lines.push(...renderSingleWriterFooter(entries.length));
  return lines;
}

/**
 * Merges and sorts entries from all writers by lamport timestamp.
 * @param {Object} writers - Map of writerId to entries
 * @returns {Object[]} Sorted entries with writerId attached
 */
function mergeWriterEntries(writers) {
  const allEntries = [];
  for (const [writerId, writerEntries] of Object.entries(writers)) {
    for (const entry of writerEntries) {
      allEntries.push({ ...entry, writerId });
    }
  }
  allEntries.sort((a, b) => a.lamport - b.lamport || a.writerId.localeCompare(b.writerId));
  return allEntries;
}

/**
 * Renders multi-writer timeline header.
 * @param {string} graph - Graph name
 * @param {number} writerCount - Number of writers
 * @returns {string[]} Header lines
 */
function renderMultiWriterHeader(graph, writerCount) {
  return [
    colors.bold(`  GRAPH: ${graph}`),
    colors.muted(`  Writers: ${writerCount}`),
    '',
  ];
}

/**
 * Renders multi-writer timeline footer.
 * @param {number} totalCount - Total entry count
 * @param {number} writerCount - Number of writers
 * @returns {string[]} Footer lines
 */
function renderMultiWriterFooter(totalCount, writerCount) {
  const label = totalCount === 1 ? 'patch' : 'patches';
  return ['', colors.muted(`  Total: ${totalCount} ${label} across ${writerCount} writers`)];
}

/**
 * Renders multi-writer timeline view with parallel columns.
 * @param {Object} payload - History payload with allWriters data
 * @param {Object} options - Rendering options
 * @returns {string[]} Lines for the timeline
 */
function renderMultiWriterTimeline(payload, options) {
  const { writers, graph } = payload;
  const { pageSize = DEFAULT_PAGE_SIZE, showAll = false } = options;
  const writerIds = Object.keys(writers);

  const lines = renderMultiWriterHeader(graph, writerIds.length);

  if (writerIds.length === 0) {
    lines.push(colors.muted('  (no writers)'));
    return lines;
  }

  const allEntries = mergeWriterEntries(writers);

  if (allEntries.length === 0) {
    lines.push(colors.muted('  (no patches)'));
    return lines;
  }

  const { displayEntries, truncated, hiddenCount } = paginateEntries(allEntries, pageSize, showAll);
  if (displayEntries.length === 0) {
    lines.push(colors.muted('  (no patches)'));
    return lines;
  }
  const maxLamport = Math.max(...displayEntries.map((e) => e.lamport));
  const lamportWidth = String(maxLamport).length;
  const maxWriterIdLen = Math.max(...writerIds.map((id) => id.length), 6);

  lines.push(...renderTruncationIndicator(truncated, hiddenCount));

  for (let i = 0; i < displayEntries.length; i++) {
    const entry = displayEntries[i];
    const isLast = i === displayEntries.length - 1;
    lines.push(renderEntryLine({
      entry,
      isLast,
      lamportWidth,
      writerStr: entry.writerId,
      maxWriterIdLen,
    }));
  }

  lines.push(...renderMultiWriterFooter(allEntries.length, writerIds.length));
  return lines;
}

/**
 * Renders the history view with ASCII timeline.
 * @param {Object} payload - History payload from handleHistory
 * @param {string} payload.graph - Graph name
 * @param {string} [payload.writer] - Writer ID (single writer mode)
 * @param {string|null} [payload.nodeFilter] - Node filter if applied
 * @param {Object[]} [payload.entries] - Array of patch entries (single writer mode)
 * @param {Object} [payload.writers] - Map of writerId to entries (multi-writer mode)
 * @param {Object} [options] - Rendering options
 * @param {number} [options.pageSize=20] - Number of patches to show per page
 * @param {boolean} [options.showAll=false] - Show all patches (no pagination)
 * @returns {string} Formatted ASCII output
 */
export function renderHistoryView(payload, options = {}) {
  if (!payload) {
    return `${colors.error('No data available')}\n`;
  }

  const isMultiWriter = payload.writers && typeof payload.writers === 'object';
  const contentLines = isMultiWriter
    ? renderMultiWriterTimeline(payload, options)
    : renderSingleWriterTimeline(payload, options);

  // Add node filter indicator if present
  if (payload.nodeFilter) {
    contentLines.splice(1, 0, colors.muted(`  Filter: node=${payload.nodeFilter}`));
  }

  const content = contentLines.join('\n');

  const box = createBox(content, {
    title: 'PATCH HISTORY',
    titleAlignment: 'center',
    borderColor: 'cyan',
  });

  return `${box}\n`;
}

export { summarizeOps };

export default { renderHistoryView, summarizeOps };
