/**
 * ASCII renderer for the `seek --view` command.
 *
 * Displays a swimlane dashboard: one horizontal track per writer, with
 * relative-offset column headers that map directly to `--tick=+N/-N` CLI
 * syntax.  Included patches (at or before the cursor) render as filled
 * dots on a solid line; excluded (future) patches render as open circles
 * on a dotted line.
 */

import boxen from 'boxen';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { formatSha, formatWriterName } from './formatters.js';
import { TIMELINE } from './symbols.js';
import { formatOpSummary } from './opSummary.js';

/**
 * @typedef {{ ticks: number[], tipSha?: string, tickShas?: Record<number, string> }} WriterInfo
 */

/**
 * @typedef {Object} SeekPayload
 * @property {string} graph
 * @property {number} tick
 * @property {number} maxTick
 * @property {number[]} ticks
 * @property {number} nodes
 * @property {number} edges
 * @property {number} patchCount
 * @property {Map<string, WriterInfo> | Record<string, WriterInfo>} perWriter
 * @property {{ nodes?: number, edges?: number }} [diff]
 * @property {Record<string, unknown>} [tickReceipt]
 * @property {import('../../../domain/services/StateDiff.js').StateDiffResult | null} [structuralDiff]
 * @property {string} [diffBaseline]
 * @property {number | null} [baselineTick]
 * @property {boolean} [truncated]
 * @property {number} [totalChanges]
 * @property {number} [shownChanges]
 */

/** Maximum number of tick columns shown in the windowed view. */
const MAX_COLS = 9;

/** Character width of each tick column (marker + connector gap). */
const COL_W = 6;

/** Character width reserved for the writer name column. */
const NAME_W = 10;

/** Middle-dot used for excluded-zone connectors. */
const DOT_MID = '\u00B7'; // ·

/** Open circle used for excluded-zone patch markers. */
const CIRCLE_OPEN = '\u25CB'; // ○

/**
 * Formats a numeric delta as a signed string (e.g. ` (+3)` or ` (-1)`).
 *
 * @param {number} n - Delta value
 * @returns {string} Formatted delta or empty string for zero/invalid
 */
function formatDelta(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) {
    return '';
  }
  const sign = n > 0 ? '+' : '';
  return ` (${sign}${n})`;
}

/**
 * Returns the singular or plural form based on count.
 *
 * @param {number} n - Count to check
 * @param {string} singular - Singular form
 * @param {string} plural - Plural form
 * @returns {string} Appropriate form for the count
 */
function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

/**
 * Builds formatted receipt lines for each writer entry in a tick receipt.
 *
 * @param {Record<string, unknown> | undefined} tickReceipt - Per-writer receipt data
 * @returns {string[]} Formatted receipt lines
 */
function buildReceiptLines(tickReceipt) {
  if (tickReceipt === null || tickReceipt === undefined || typeof tickReceipt !== 'object') {
    return [];
  }

  const entries = Object.entries(tickReceipt)
    .filter(([writerId, entry]) => writerId.length > 0 && entry !== null && entry !== undefined && typeof entry === 'object')
    .sort(([a], [b]) => a.localeCompare(b));

  return entries.map((pair) => formatReceiptEntry(pair));
}

/**
 * @typedef {{ opSummary?: Record<string, number>, sha?: string, [key: string]: unknown }} ReceiptEntry
 */

/**
 * Extracts the op summary record from a receipt entry.
 *
 * @param {ReceiptEntry} rec - Receipt record
 * @returns {Record<string, number>} Op summary map
 */
function extractOpSummary(rec) {
  if (rec.opSummary !== null && rec.opSummary !== undefined && typeof rec.opSummary === 'object') {
    return rec.opSummary;
  }
  return /** @type {Record<string, number>} */ (rec);
}

/**
 * Formats a single receipt entry as a display line.
 *
 * @param {[string, unknown]} pair - Writer ID and receipt entry
 * @returns {string} Formatted receipt line
 */
function formatReceiptEntry(pair) {
  const [writerId, entry] = pair;
  const rec = /** @type {ReceiptEntry} */ (entry);
  const sha = typeof rec.sha === 'string' ? rec.sha : null;
  const opSummary = extractOpSummary(rec);
  const name = padRight(formatWriterName(writerId, NAME_W), NAME_W);
  const shaStr = typeof sha === 'string' && sha.length > 0 ? `  ${formatSha(sha)}` : '';
  return `    ${name}${shaStr}  ${formatOpSummary(opSummary, 40)}`;
}

// ============================================================================
// Window
// ============================================================================

/**
 * Computes a sliding window of tick positions centered on the current tick.
 *
 * When all points fit within {@link MAX_COLS}, the full array is returned.
 * Otherwise a window of MAX_COLS entries is centered on `currentIdx`, with
 * clamping at both ends.
 *
 * @param {number[]} allPoints - All tick positions (including virtual tick 0)
 * @param {number} currentIdx - Index of the current tick in `allPoints`
 * @returns {{ points: number[], currentCol: number, moreLeft: boolean, moreRight: boolean }}
 */
function computeWindow(allPoints, currentIdx) {
  if (allPoints.length <= MAX_COLS) {
    return {
      points: allPoints,
      currentCol: currentIdx,
      moreLeft: false,
      moreRight: false,
    };
  }

  const half = Math.floor(MAX_COLS / 2);
  let start = currentIdx - half;
  if (start < 0) {
    start = 0;
  }
  let end = start + MAX_COLS;
  if (end > allPoints.length) {
    end = allPoints.length;
    start = end - MAX_COLS;
  }

  return {
    points: allPoints.slice(start, end),
    currentCol: currentIdx - start,
    moreLeft: start > 0,
    moreRight: end < allPoints.length,
  };
}

// ============================================================================
// Header row
// ============================================================================

/**
 * Builds the column header row showing relative step offsets.
 *
 * The current tick is rendered as `[N]` (absolute tick number); all other
 * columns show their signed step distance (`-2`, `-1`, `+1`, `+2`, etc.)
 * matching the `--tick=+N/-N` CLI syntax.
 *
 * @param {{ points: number[], currentCol: number }} win - Computed window
 * @returns {string} Formatted, indented header line
 */
function buildHeaderRow(win) {
  const { points, currentCol } = win;
  let header = '';

  for (let i = 0; i < points.length; i++) {
    const rel = i - currentCol;
    let label;
    if (rel === 0) {
      label = `[${points[i]}]`;
    } else if (rel > 0) {
      label = `+${rel}`;
    } else {
      label = String(rel);
    }
    header += label.padEnd(COL_W);
  }

  const margin = ' '.repeat(NAME_W + 2);
  return `  ${margin}${header.trimEnd()}`;
}

// ============================================================================
// Writer swimlane
// ============================================================================

/**
 * Renders a single cell (marker) in the swimlane grid.
 *
 * @param {boolean} hasPatch - Whether this writer has a patch at this tick
 * @param {boolean} incl - Whether this tick is in the included zone
 * @returns {string} A single styled character
 */
function renderCell(hasPatch, incl) {
  if (hasPatch) {
    return incl ? colors.success(TIMELINE.dot) : colors.muted(CIRCLE_OPEN);
  }
  return incl ? TIMELINE.line : colors.muted(DOT_MID);
}

/**
 * Builds the swimlane track string for a writer across the window columns.
 *
 * @param {Set<number>} patchSet - Set of ticks where this writer has patches
 * @param {number[]} points - Window tick positions
 * @param {number} currentTick - Active seek cursor tick
 * @returns {string} Styled swimlane track
 */
function buildLane(patchSet, points, currentTick) {
  let lane = '';
  for (let i = 0; i < points.length; i++) {
    const t = points[i];
    if (t === undefined) { continue; }
    const incl = t <= currentTick;

    if (i > 0) {
      const n = COL_W - 1;
      lane += incl
        ? TIMELINE.line.repeat(n)
        : colors.muted(DOT_MID.repeat(n));
    }

    lane += renderCell(patchSet.has(t), incl);
  }
  return lane;
}

/**
 * Finds the highest included tick for a writer up to currentTick.
 *
 * @param {number[]} ticks - Writer's tick array
 * @param {number} currentTick - Current seek cursor tick
 * @returns {number|null} Highest included tick or null if none
 */
function findMaxIncludedTick(ticks, currentTick) {
  const included = ticks.filter((t) => t <= currentTick);
  return included.length > 0 ? (included[included.length - 1] ?? null) : null;
}

/**
 * Resolves the SHA to display for a writer at the current tick position.
 *
 * @param {WriterInfo} writerInfo - Writer tick/SHA info
 * @param {number} currentTick - Current seek cursor tick
 * @returns {string|undefined} SHA string or undefined if none available
 */
function resolveWriterSha(writerInfo, currentTick) {
  const { tickShas, tipSha } = writerInfo;
  const maxIncl = findMaxIncludedTick(writerInfo.ticks, currentTick);
  if (maxIncl !== null && tickShas !== null && tickShas !== undefined) {
    return /** @type {string|undefined} */ (/** @type {unknown} */ (tickShas[maxIncl])) ?? tipSha;
  }
  return tipSha;
}

/**
 * Builds one writer's horizontal swimlane row.
 *
 * Each tick position in the window gets a marker character:
 * - `●` (green)  — writer has a patch here AND tick ≤ currentTick (included)
 * - `○` (muted)  — writer has a patch here AND tick > currentTick (excluded)
 * - `─` (solid)  — no patch, included zone
 * - `·` (muted)  — no patch, excluded zone
 *
 * Between consecutive columns, connector characters of the appropriate style
 * fill the gap (COL_W − 1 chars).
 *
 * @param {{ writerId: string, writerInfo: WriterInfo, win: { points: number[] }, currentTick: number }} opts
 * @returns {string} Formatted, indented swimlane line
 */
function buildWriterSwimRow({ writerId, writerInfo, win, currentTick }) {
  const patchSet = new Set(writerInfo.ticks);
  const lane = buildLane(patchSet, win.points, currentTick);
  const sha = resolveWriterSha(writerInfo, currentTick);

  const name = padRight(formatWriterName(writerId, NAME_W), NAME_W);
  const shaStr = typeof sha === 'string' && sha.length > 0 ? `  ${formatSha(sha)}` : '';

  return `    ${name}  ${lane}${shaStr}`;
}

// ============================================================================
// Body assembly
// ============================================================================

/**
 * Builds the tick-position array and index of the current tick.
 *
 * Ensures the current tick is always present: if `tick` is absent from
 * `ticks` (e.g. saved cursor after writer refs changed), it is inserted
 * at the correct sorted position so the window always centres on it.
 *
 * @param {number[]} ticks - Discovered Lamport ticks
 * @param {number} tick - Current cursor tick
 * @returns {{ allPoints: number[], currentIdx: number }}
 */
function buildTickPoints(ticks, tick) {
  const allPoints = (ticks[0] === 0) ? [...ticks] : [0, ...ticks];
  let currentIdx = allPoints.indexOf(tick);
  if (currentIdx === -1) {
    let ins = allPoints.findIndex((t) => t > tick);
    if (ins === -1) {
      ins = allPoints.length;
    }
    allPoints.splice(ins, 0, tick);
    currentIdx = ins;
  }
  return { allPoints, currentIdx };
}

// ============================================================================
// Structural Diff
// ============================================================================

/** Maximum structural diff lines shown in ASCII view. */
const MAX_DIFF_LINES = 20;

/**
 * Builds the state summary line showing node/edge/patch counts with deltas.
 *
 * @param {SeekPayload} payload - Seek payload
 * @returns {string} Formatted state summary line
 */
function buildStateSummaryLine(payload) {
  const { nodes, edges, patchCount, diff } = payload;
  const nodesStr = `${nodes} ${pluralize(nodes, 'node', 'nodes')}${formatDelta(diff?.nodes ?? 0)}`;
  const edgesStr = `${edges} ${pluralize(edges, 'edge', 'edges')}${formatDelta(diff?.edges ?? 0)}`;
  return `  ${colors.bold('State:')} ${nodesStr}, ${edgesStr}, ${patchCount} ${pluralize(patchCount, 'patch', 'patches')}`;
}

/**
 * Builds the state summary, receipt, and structural diff footer lines.
 *
 * @param {SeekPayload} payload - Seek payload containing state, receipt, and diff info
 * @returns {string[]} Formatted footer lines
 */
function buildFooterLines(payload) {
  const { tick, tickReceipt } = payload;
  const lines = [];
  lines.push('');
  lines.push(buildStateSummaryLine(payload));

  const receiptLines = buildReceiptLines(tickReceipt);
  if (receiptLines.length > 0) {
    lines.push('');
    lines.push(`  ${colors.bold(`Tick ${tick}:`)}`);
    lines.push(...receiptLines);
  }

  const sdLines = buildStructuralDiffLines(payload, MAX_DIFF_LINES);
  if (sdLines.length > 0) {
    lines.push('');
    lines.push(...sdLines);
  }
  lines.push('');
  return lines;
}

/**
 * Assembles the full seek body: graph info header, swimlane grid, and footer.
 *
 * @param {SeekPayload} payload - Seek payload from CLI handler
 * @returns {string[]} Lines for the seek body (before boxen wrap)
 */
function buildSeekBodyLines(payload) {
  const { graph, tick, maxTick, ticks, perWriter } = payload;
  const lines = [];

  lines.push('');
  lines.push(`  ${colors.bold('GRAPH:')} ${graph}`);
  lines.push(`  ${colors.bold('POSITION:')} tick ${tick} of ${maxTick}`);
  lines.push('');

  if (ticks.length === 0) {
    lines.push(`  ${colors.muted('(no ticks)')}`);
  } else {
    const { allPoints, currentIdx } = buildTickPoints(ticks, tick);
    const win = computeWindow(allPoints, currentIdx);
    lines.push(buildHeaderRow(win));

    /** @type {Array<[string, WriterInfo]>} */
    const writerEntries = perWriter instanceof Map
      ? [...perWriter.entries()]
      : Object.entries(perWriter).map(([k, v]) => [k, v]);

    for (const [writerId, writerInfo] of writerEntries) {
      lines.push(buildWriterSwimRow({ writerId, writerInfo, win, currentTick: tick }));
    }
  }

  lines.push(...buildFooterLines(payload));
  return lines;
}

/**
 * Builds a hint for view-truncated + data-truncated case.
 *
 * @param {number} shown - Number of entries shown
 * @param {number} totalChanges - Total changes available
 * @returns {string} Hint message
 */
function buildViewAndDataTruncHint(shown, totalChanges) {
  const remaining = Math.max(0, totalChanges - shown);
  return `... and ${remaining} more changes (${totalChanges} total, use --diff-limit to increase)`;
}

/**
 * Builds a hint for data-only truncation (all entries fit the view).
 *
 * @param {number} totalChanges - Total changes available
 * @param {number} shownChanges - Changes shown from data source
 * @returns {string} Hint message
 */
function buildDataOnlyTruncHint(totalChanges, shownChanges) {
  return `... and ${Math.max(0, totalChanges - shownChanges)} more changes (use --diff-limit to increase)`;
}

/**
 * Builds a hint for view-only truncation (data is complete but too many entries).
 *
 * @param {number} totalEntries - Total entries
 * @param {number} maxLines - Display limit
 * @returns {string} Hint message
 */
function buildViewOnlyTruncHint(totalEntries, maxLines) {
  return `... and ${Math.max(0, totalEntries - maxLines)} more changes`;
}

/**
 * Safely resolves an optional number to a default of zero.
 *
 * @param {number|undefined} n - Optional number
 * @returns {number} The number or zero
 */
function numOrZero(n) {
  return n ?? 0;
}

/**
 * Builds a truncation hint line when entries exceed the display or data limit.
 *
 * @param {{totalEntries: number, shown: number, maxLines: number, truncated?: boolean | undefined, totalChanges?: number | undefined, shownChanges?: number | undefined}} opts - Truncation context
 * @returns {string|null} Hint string or null if no truncation occurred
 */
function buildTruncationHint(opts) {
  const viewTruncated = opts.totalEntries > opts.maxLines;
  const dataTruncated = opts.truncated === true;
  if (viewTruncated && dataTruncated) {
    return buildViewAndDataTruncHint(opts.shown, numOrZero(opts.totalChanges));
  }
  if (viewTruncated) {
    return buildViewOnlyTruncHint(opts.totalEntries, opts.maxLines);
  }
  if (dataTruncated) {
    return buildDataOnlyTruncHint(numOrZero(opts.totalChanges), numOrZero(opts.shownChanges));
  }
  return null;
}

/**
 * Builds the baseline label string for a structural diff header.
 *
 * @param {string|undefined} diffBaseline - Baseline type ('tick' or other)
 * @param {number|null|undefined} baselineTick - Baseline tick number
 * @returns {string} Human-readable baseline label
 */
function buildBaselineLabel(diffBaseline, baselineTick) {
  return diffBaseline === 'tick'
    ? `baseline: tick ${baselineTick ?? 0}`
    : 'baseline: empty';
}

/**
 * Appends indented diff entry lines and optional truncation hint.
 *
 * @param {{ lines: string[], entries: string[], maxLines: number, payload: SeekPayload }} opts - Diff rendering context
 */
function appendDiffEntries(opts) {
  const { lines, entries, maxLines, payload } = opts;
  const { truncated, totalChanges, shownChanges } = payload;
  const shown = Math.min(entries.length, maxLines);
  for (let i = 0; i < shown; i++) {
    lines.push(`    ${entries[i]}`);
  }
  const hint = buildTruncationHint({ totalEntries: entries.length, shown, maxLines, truncated, totalChanges, shownChanges });
  if (typeof hint === 'string' && hint.length > 0) {
    lines.push(`    ${colors.muted(hint)}`);
  }
}

/**
 * Renders structural diff lines with truncation support.
 *
 * @param {SeekPayload} payload - Seek payload containing structuralDiff
 * @param {number} maxLines - Maximum number of diff entries to display
 * @returns {string[]} Formatted diff lines or empty array if no diff
 */
function buildStructuralDiffLines(payload, maxLines) {
  const { structuralDiff, diffBaseline, baselineTick } = payload;
  if (structuralDiff === null || structuralDiff === undefined) {
    return [];
  }

  const lines = [];
  const baselineLabel = buildBaselineLabel(diffBaseline, baselineTick);
  lines.push(`  ${colors.bold(`Changes (${baselineLabel}):`)}`);

  const entries = collectDiffEntries(structuralDiff);
  appendDiffEntries({ lines, entries, maxLines, payload });

  return lines;
}

/**
 * Collects formatted node and edge add/remove entries from a structural diff.
 *
 * @param {import('../../../domain/services/StateDiff.js').StateDiffResult} diff - Structural diff
 * @returns {string[]} Formatted entries with +/- prefixes
 */
function collectNodeEdgeEntries(diff) {
  const entries = [];
  for (const nodeId of diff.nodes.added) {
    entries.push(colors.success(`+ node ${nodeId}`));
  }
  for (const nodeId of diff.nodes.removed) {
    entries.push(colors.error(`- node ${nodeId}`));
  }
  for (const edge of diff.edges.added) {
    entries.push(colors.success(`+ edge ${edge.from} -[${edge.label}]-> ${edge.to}`));
  }
  for (const edge of diff.edges.removed) {
    entries.push(colors.error(`- edge ${edge.from} -[${edge.label}]-> ${edge.to}`));
  }
  return entries;
}

/**
 * Collects formatted property change entries from a structural diff.
 *
 * @param {import('../../../domain/services/StateDiff.js').StateDiffResult} diff - Structural diff
 * @returns {string[]} Formatted entries with ~/- prefixes
 */
function collectPropEntries(diff) {
  const entries = [];
  for (const prop of diff.props.set) {
    const old = prop.oldValue !== undefined ? formatPropValue(prop.oldValue) : null;
    const arrow = old !== null ? `${old} -> ${formatPropValue(prop.newValue)}` : formatPropValue(prop.newValue);
    entries.push(colors.warning(`~ ${prop.nodeId}.${prop.propKey}: ${arrow}`));
  }
  for (const prop of diff.props.removed) {
    entries.push(colors.error(`- ${prop.nodeId}.${prop.propKey}: ${formatPropValue(prop.oldValue)}`));
  }
  return entries;
}

/**
 * Collects formatted diff entries from a structural diff result.
 *
 * @param {import('../../../domain/services/StateDiff.js').StateDiffResult} diff - Structural diff
 * @returns {string[]} Formatted entries with +/-/~ prefixes
 */
function collectDiffEntries(diff) {
  return [...collectNodeEdgeEntries(diff), ...collectPropEntries(diff)];
}

/**
 * Truncates a string to 40 characters with ellipsis if needed.
 *
 * @param {string} s - String to truncate
 * @returns {string} Truncated string
 */
function truncateDisplay(s) {
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}

/**
 * Converts a non-string value to a display string.
 *
 * @param {unknown} value - Value to stringify
 * @returns {string} String representation
 */
function stringifyNonString(value) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

/**
 * Formats a property value for display (truncated if too long).
 *
 * @param {unknown} value - Property value to format
 * @returns {string} Human-readable, possibly truncated representation
 */
function formatPropValue(value) {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return truncateDisplay(`"${value}"`);
  }
  return truncateDisplay(stringifyNonString(value));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Formats a structural diff as a plain-text string (no boxen).
 *
 * Used by the non-view renderSeek() path in the CLI.
 *
 * @param {SeekPayload} payload - Seek payload containing structuralDiff
 * @returns {string} Formatted diff section, or empty string if no diff
 */
export function formatStructuralDiff(payload) {
  const lines = buildStructuralDiffLines(payload, MAX_DIFF_LINES);
  if (lines.length === 0) {
    return '';
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Renders the seek view dashboard inside a double-bordered box.
 *
 * @param {SeekPayload} payload - Seek payload from the CLI handler
 * @returns {string} Boxen-wrapped ASCII dashboard with trailing newline
 */
export function renderSeekView(payload) {
  const lines = buildSeekBodyLines(payload);
  const body = lines.join('\n');

  return `${boxen(body, {
    title: ' SEEK ',
    titleAlignment: 'center',
    padding: 0,
    borderStyle: 'double',
    borderColor: 'cyan',
  })}\n`;
}
