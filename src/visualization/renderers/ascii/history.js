/**
 * ASCII renderer for the `history --view` command.
 * Displays a visual timeline of patches for one or more writers.
 */

import { colors } from './colors.js';
import { createBox } from './box.js';
import { padRight, padLeft } from '../../utils/unicode.js';
import { TIMELINE } from './symbols.js';
import { OP_DISPLAY, EMPTY_OP_SUMMARY, summarizeOps, formatOpSummary } from './opSummary.js';

/**
 * @typedef {{ sha?: string, lamport?: number, writerId?: string, opSummary?: Record<string, number>, ops?: Array<{ type: string }> }} PatchEntry
 */

// Default pagination settings
const DEFAULT_PAGE_SIZE = 20;

/**
 * Ensures entry has an opSummary, computing one if needed.
 * @param {PatchEntry} entry - Patch entry
 * @returns {Record<string, number>} Operation summary
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
 * @param {PatchEntry[]} entries - All entries
 * @param {number} pageSize - Page size
 * @param {boolean} showAll - Whether to show all
 * @returns {{displayEntries: PatchEntry[], truncated: boolean, hiddenCount: number}}
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
 * Returns the short SHA prefix from an entry.
 * @param {PatchEntry} entry - Patch entry
 * @returns {string} 7-char SHA prefix or empty string
 */
function shortShaOf(entry) {
  const sha = entry.sha ?? '';
  return sha.length > 0 ? sha.slice(0, 7) : '';
}

/**
 * Checks if a writer string is present and non-empty.
 * @param {string|undefined} writerStr - Writer string to check
 * @returns {boolean} True if present and non-empty
 */
function hasWriter(writerStr) {
  return writerStr !== null && writerStr !== undefined && writerStr.length > 0;
}

/**
 * Formats a single-writer entry line (no writer column).
 * @param {{ connector: string, lamportStr: string, shortSha: string, opSummaryStr: string }} parts
 * @returns {string} Formatted line
 */
function formatSingleWriterLine({ connector, lamportStr, shortSha, opSummaryStr }) {
  return `  ${connector}${TIMELINE.dot} ${colors.muted(`L${lamportStr}`)} ${colors.primary(shortSha)}  ${opSummaryStr}`;
}

/**
 * Formats a multi-writer entry line (with writer column).
 * @param {{ connector: string, lamportStr: string, shortSha: string, opSummaryStr: string, writerStr: string, maxWriterIdLen: number }} parts
 * @returns {string} Formatted line
 */
function formatMultiWriterLine({ connector, lamportStr, shortSha, opSummaryStr, writerStr, maxWriterIdLen }) {
  const paddedWriter = padRight(writerStr, maxWriterIdLen);
  return `  ${connector}${TIMELINE.dot} ${colors.muted(`L${lamportStr}`)} ${colors.primary(paddedWriter)}:${colors.muted(shortSha)} ${opSummaryStr}`;
}

/**
 * Selects the timeline connector symbol.
 * @param {boolean} isLast - Whether this is the last entry
 * @returns {string} Connector symbol
 */
function connectorFor(isLast) {
  return isLast ? TIMELINE.end : TIMELINE.connector;
}

/**
 * Selects the column width based on writer presence.
 * @param {string|undefined} writerStr - Writer string
 * @returns {number} Column width
 */
function opColumnWidth(writerStr) {
  return hasWriter(writerStr) ? 30 : 40;
}

/**
 * Renders a single patch entry line.
 * @param {{ entry: PatchEntry, isLast: boolean, lamportWidth: number, writerStr?: string, maxWriterIdLen?: number }} params - Entry parameters
 * @returns {string} Formatted entry line
 */
function renderEntryLine(/** @type {{ entry: PatchEntry, isLast: boolean, lamportWidth: number, writerStr?: string, maxWriterIdLen?: number }} */ params) {
  const { entry, isLast, lamportWidth, writerStr, maxWriterIdLen } = params;

  const connector = connectorFor(isLast);
  const shortSha = shortShaOf(entry);
  const lamportStr = padLeft(String(entry.lamport ?? 0), lamportWidth);
  const opSummaryStr = formatOpSummary(ensureOpSummary(entry), opColumnWidth(writerStr));

  if (hasWriter(writerStr)) {
    return formatMultiWriterLine({ connector, lamportStr, shortSha, opSummaryStr, writerStr: /** @type {string} */ (writerStr), maxWriterIdLen: maxWriterIdLen ?? 6 });
  }
  return formatSingleWriterLine({ connector, lamportStr, shortSha, opSummaryStr });
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
 * Renders timeline entry lines for a set of display entries.
 * @param {PatchEntry[]} displayEntries - Entries to render
 * @param {number} lamportWidth - Width for lamport padding
 * @param {{ useWriterId?: boolean, maxWriterIdLen?: number }} [extra] - Optional writer info
 * @returns {string[]} Rendered lines
 */
function renderEntryLines(displayEntries, lamportWidth, extra = {}) {
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < displayEntries.length; i++) {
    const entry = /** @type {PatchEntry} */ (displayEntries[i]);
    const isLast = i === displayEntries.length - 1;
    /** @type {{ entry: PatchEntry, isLast: boolean, lamportWidth: number, writerStr?: string, maxWriterIdLen?: number }} */
    const lineArgs = { entry, isLast, lamportWidth };
    if (extra.useWriterId === true) {
      lineArgs.writerStr = entry.writerId;
    }
    if (extra.maxWriterIdLen !== undefined) {
      lineArgs.maxWriterIdLen = extra.maxWriterIdLen;
    }
    lines.push(renderEntryLine(lineArgs));
  }
  return lines;
}

/**
 * Computes lamport display width from entries.
 * @param {PatchEntry[]} displayEntries - Entries to measure
 * @returns {number} Width for lamport padding
 */
function computeLamportWidth(displayEntries) {
  const maxLamport = Math.max(...displayEntries.map((e) => e.lamport ?? 0));
  return String(maxLamport).length;
}

/**
 * Renders single-writer timeline view.
 * @param {{ entries: PatchEntry[], writer: string }} payload - History payload
 * @param {{ pageSize?: number, showAll?: boolean }} options - Rendering options
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

  lines.push(...renderTruncationIndicator(truncated, hiddenCount));
  lines.push(...renderEntryLines(displayEntries, computeLamportWidth(displayEntries)));
  lines.push(...renderSingleWriterFooter(entries.length));
  return lines;
}

/**
 * Compares two patch entries by lamport then writerId.
 * @param {PatchEntry} a - First entry
 * @param {PatchEntry} b - Second entry
 * @returns {number} Sort order
 */
/**
 * Gets a lamport value with default of zero.
 * @param {PatchEntry} entry - Patch entry
 * @returns {number} Lamport value
 */
function lamportOf(entry) {
  return entry.lamport ?? 0;
}

/**
 * Gets a writerId with default of empty string.
 * @param {PatchEntry} entry - Patch entry
 * @returns {string} Writer ID
 */
function writerIdOf(entry) {
  return entry.writerId ?? '';
}

/**
 * Compares two patch entries by lamport then writerId.
 * @param {PatchEntry} a - First entry
 * @param {PatchEntry} b - Second entry
 * @returns {number} Sort order
 */
function comparePatchEntries(a, b) {
  const lamportDiff = lamportOf(a) - lamportOf(b);
  return lamportDiff !== 0 ? lamportDiff : writerIdOf(a).localeCompare(writerIdOf(b));
}

/**
 * Merges and sorts entries from all writers by lamport timestamp.
 * @param {Record<string, PatchEntry[]>} writers - Map of writerId to entries
 * @returns {PatchEntry[]} Sorted entries with writerId attached
 */
function mergeWriterEntries(writers) {
  const allEntries = [];
  for (const [writerId, writerEntries] of Object.entries(writers)) {
    for (const entry of writerEntries) {
      allEntries.push({ ...entry, writerId });
    }
  }
  allEntries.sort(comparePatchEntries);
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
 * Renders the body of the multi-writer timeline after pagination.
 * @param {{ displayEntries: PatchEntry[], truncated: boolean, hiddenCount: number }} paginated
 * @param {string[]} writerIds - All writer IDs
 * @param {number} totalCount - Total entries before pagination
 * @returns {string[]} Rendered lines
 */
function renderMultiWriterBody(paginated, writerIds, totalCount) {
  const { displayEntries, truncated, hiddenCount } = paginated;
  const lamportWidth = computeLamportWidth(displayEntries);
  const maxWriterIdLen = Math.max(...writerIds.map((id) => id.length), 6);

  /** @type {string[]} */
  const lines = [];
  lines.push(...renderTruncationIndicator(truncated, hiddenCount));
  lines.push(...renderEntryLines(displayEntries, lamportWidth, { useWriterId: true, maxWriterIdLen }));
  lines.push(...renderMultiWriterFooter(totalCount, writerIds.length));
  return lines;
}

/**
 * Returns the muted placeholder for empty multi-writer timelines, or null.
 * @param {string[]} writerIds - Writer IDs
 * @param {PatchEntry[]} allEntries - Merged entries
 * @returns {string|null} Placeholder line or null if entries exist
 */
function multiWriterEmptyMessage(writerIds, allEntries) {
  if (writerIds.length === 0) {
    return colors.muted('  (no writers)');
  }
  if (allEntries.length === 0) {
    return colors.muted('  (no patches)');
  }
  return null;
}

/**
 * Renders multi-writer timeline view with parallel columns.
 * @param {{ writers: Record<string, PatchEntry[]>, graph: string }} payload - History payload with allWriters data
 * @param {{ pageSize?: number, showAll?: boolean }} options - Rendering options
 * @returns {string[]} Lines for the timeline
 */
function renderMultiWriterTimeline(payload, options) {
  /** @type {{ writers: Record<string, PatchEntry[]>, graph: string }} */
  const { writers, graph } = payload;
  /** @type {number} */
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  /** @type {boolean} */
  const showAll = options.showAll ?? false;
  const writerIds = Object.keys(writers);
  const lines = renderMultiWriterHeader(graph, writerIds.length);
  const allEntries = mergeWriterEntries(writers);

  const emptyMsg = multiWriterEmptyMessage(writerIds, allEntries);
  if (emptyMsg !== null) {
    lines.push(emptyMsg);
    return lines;
  }

  const paginated = paginateEntries(allEntries, pageSize, showAll);
  if (paginated.displayEntries.length === 0) {
    lines.push(colors.muted('  (no patches)'));
    return lines;
  }

  lines.push(...renderMultiWriterBody(paginated, writerIds, allEntries.length));
  return lines;
}

/**
 * Determines if the payload represents multi-writer history.
 * @param {{ writers?: Record<string, PatchEntry[]> }} payload
 * @returns {boolean} True if multi-writer
 */
function isMultiWriterPayload(payload) {
  return payload.writers !== null && payload.writers !== undefined && typeof payload.writers === 'object';
}

/**
 * Wraps content lines in a PATCH HISTORY box.
 * @param {string[]} contentLines - Content lines to box
 * @returns {string} Boxed output
 */
function wrapInHistoryBox(contentLines) {
  const content = contentLines.join('\n');
  const box = createBox(content, {
    title: 'PATCH HISTORY',
    titleAlignment: 'center',
    borderColor: 'cyan',
  });
  return `${box}\n`;
}

/**
 * Inserts a node filter indicator line if applicable.
 * @param {string[]} contentLines - Lines to modify in-place
 * @param {string | null | undefined} nodeFilter - Filter value
 * @returns {void}
 */
function insertNodeFilterLine(contentLines, nodeFilter) {
  const filter = nodeFilter ?? '';
  if (filter.length > 0) {
    contentLines.splice(1, 0, colors.muted(`  Filter: node=${filter}`));
  }
}

/**
 * Renders the history view with ASCII timeline.
 * @param {{ graph: string, writer?: string, nodeFilter?: string | null, entries?: PatchEntry[], writers?: Record<string, PatchEntry[]> } | null | undefined} payload - History payload from handleHistory
 * @param {{ pageSize?: number, showAll?: boolean }} [options] - Rendering options
 * @returns {string} Formatted ASCII output
 */
export function renderHistoryView(payload, options = {}) {
  if (payload === null || payload === undefined) {
    return `${colors.error('No data available')}\n`;
  }

  /** @type {{ graph: string, writer?: string, nodeFilter?: string | null, entries?: PatchEntry[], writers?: Record<string, PatchEntry[]> }} */
  const data = payload;
  const contentLines = isMultiWriterPayload(data)
    ? renderMultiWriterTimeline(/** @type {{ writers: Record<string, PatchEntry[]>, graph: string }} */ (data), options)
    : renderSingleWriterTimeline(/** @type {{ entries: PatchEntry[], writer: string }} */ (data), options);

  insertNodeFilterLine(contentLines, data.nodeFilter);
  return wrapInHistoryBox(contentLines);
}

export { summarizeOps, formatOpSummary, OP_DISPLAY, EMPTY_OP_SUMMARY };

export default { renderHistoryView, summarizeOps };
