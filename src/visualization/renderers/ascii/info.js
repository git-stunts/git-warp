/**
 * ASCII renderer for the `info --view` command.
 * Displays a beautiful box with graph summaries and writer timelines.
 */

import boxen from 'boxen';
import stringWidth from 'string-width';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { timeAgo } from '../../utils/time.js';
import { TIMELINE } from './symbols.js';

/**
 * @typedef {{ name: string, writers?: { count?: number, ids?: string[] }, checkpoint?: { sha?: string, date?: string | Date }, coverage?: { sha?: string }, writerPatches?: Record<string, number> }} GraphInfo
 */

// Box drawing characters (info.js uses verbose key names for card rendering)
const BOX = {
  topLeft: '\u250C',     // ┌
  topRight: '\u2510',    // ┐
  bottomLeft: '\u2514',  // └
  bottomRight: '\u2518', // ┘
  horizontal: '\u2500',  // ─
  vertical: '\u2502',    // │
};

// Maximum timeline width for patches
const MAX_TIMELINE_WIDTH = 40;

/**
 * Builds the dot-and-line segment of a timeline string.
 * @param {number} dotCount - Number of dots to render
 * @param {number} segmentWidth - Character width between dots
 * @param {number} scaledWidth - Total scaled width
 * @returns {string} Raw timeline segment with ANSI coloring
 */
function buildTimelineSegment(dotCount, segmentWidth, scaledWidth) {
  let timeline = '';
  for (let i = 0; i < dotCount; i++) {
    if (i > 0) {
      timeline += colors.muted(TIMELINE.line.repeat(segmentWidth));
    }
    timeline += colors.primary(TIMELINE.dot);
  }

  const remaining = scaledWidth - (dotCount * segmentWidth);
  if (remaining > 0) {
    timeline += colors.muted(TIMELINE.line.repeat(remaining));
  }
  return timeline;
}

/**
 * Builds a timeline string for a writer based on patch count.
 * @param {number} patchCount - Number of patches
 * @param {number} maxPatches - Maximum patches across all writers (for scaling)
 * @returns {string} Timeline string like "────●────●────●────● (12 patches)"
 */
function buildTimeline(patchCount, maxPatches) {
  if (patchCount === 0) {
    return colors.muted('(no patches)');
  }

  // Scale timeline width based on patch count relative to max
  const scaledWidth = Math.max(
    4,
    Math.floor((patchCount / Math.max(maxPatches, 1)) * MAX_TIMELINE_WIDTH)
  );

  // Determine number of dots (max 8 dots for visual clarity)
  const dotCount = Math.min(patchCount, 8);
  const segmentWidth = Math.floor(scaledWidth / dotCount);
  const timeline = buildTimelineSegment(dotCount, segmentWidth, scaledWidth);

  const patchLabel = patchCount === 1 ? 'patch' : 'patches';
  return `${timeline} ${colors.muted(`(${patchCount} ${patchLabel})`)}`;
}

/**
 * Builds the writer names display string.
 * @param {string[]} writerIds - Array of writer IDs
 * @returns {string} Formatted writer names
 */
function formatWriterNames(writerIds) {
  if (writerIds.length === 0) {
    return '';
  }
  const displayed = writerIds.slice(0, 5).join(', ');
  return writerIds.length > 5 ? `${displayed}...` : displayed;
}

/**
 * Builds the writer summary line for a card header.
 * @param {GraphInfo} graph - Graph info object
 * @returns {string} Writer summary like "Writers: 3 (alice, bob, carol)"
 */
function buildWriterSummaryLine(graph) {
  const writers = graph.writers ?? { count: 0, ids: [] };
  const writerCount = writers.count ?? 0;
  const writerIds = writers.ids ?? [];
  const writerNames = formatWriterNames(writerIds);
  const suffix = writerNames.length > 0 ? ` (${writerNames})` : '';
  return `Writers: ${writerCount}${suffix}`;
}

/**
 * Renders the header lines for a graph card.
 * @param {GraphInfo} graph - Graph info object
 * @param {number} contentWidth - Available content width
 * @returns {string[]} Header lines
 */
function renderCardHeader(graph, contentWidth) {
  const lines = [];
  const graphIcon = '\uD83D\uDCCA'; // 📊
  const graphName = `${graphIcon} ${colors.bold(graph.name)}`;
  lines.push(`${BOX.topLeft}${BOX.horizontal.repeat(contentWidth + 2)}${BOX.topRight}`);
  lines.push(`${BOX.vertical} ${padRight(graphName, contentWidth)} ${BOX.vertical}`);

  const writerLine = buildWriterSummaryLine(graph);
  lines.push(`${BOX.vertical} ${padRight(writerLine, contentWidth)} ${BOX.vertical}`);

  return lines;
}

/**
 * Renders writer timeline lines for a graph card.
 * @param {Record<string, number> | undefined} writerPatches - Map of writerId to patch count
 * @param {number} contentWidth - Available content width
 * @returns {string[]} Timeline lines
 */
function renderWriterTimelines(writerPatches, contentWidth) {
  if (!writerPatches || Object.keys(writerPatches).length === 0) {
    return [];
  }

  const lines = [];
  const patchCounts = Object.values(writerPatches);
  const maxPatches = Math.max(...patchCounts, 1);

  // Find the longest writer ID for alignment
  const maxWriterIdLen = Math.max(
    ...Object.keys(writerPatches).map((id) => stringWidth(id)),
    6
  );

  for (const [writerId, patchCount] of Object.entries(writerPatches)) {
    const paddedId = padRight(writerId, maxWriterIdLen);
    const timeline = buildTimeline(patchCount, maxPatches);
    const writerTimeline = `  ${colors.muted(paddedId)} ${timeline}`;
    lines.push(`${BOX.vertical} ${padRight(writerTimeline, contentWidth)} ${BOX.vertical}`);
  }

  return lines;
}

/**
 * Formats a checkpoint SHA and date into a display string.
 * @param {string} sha - Full checkpoint SHA
 * @param {string|Date|undefined} date - Checkpoint date
 * @returns {string} Formatted checkpoint text with check icon
 */
function formatCheckpointPresent(sha, date) {
  const shortSha = sha.slice(0, 7);
  const timeStr = date !== null && date !== undefined ? timeAgo(date) : '';
  const checkIcon = colors.success('\u2713'); // ✓
  const timePart = typeof timeStr === 'string' && timeStr.length > 0 ? ` (${timeStr})` : '';
  return `Checkpoint: ${shortSha}${timePart} ${checkIcon}`;
}

/**
 * Renders the checkpoint line for a graph card.
 * @param {GraphInfo} graph - Graph info object
 * @param {number} contentWidth - Available content width
 * @returns {string|null} A formatted checkpoint line or null if no checkpoint exists
 */
function renderCheckpointLine(graph, contentWidth) {
  if (!graph.checkpoint) {
    return null;
  }
  const { sha, date } = graph.checkpoint;
  if (typeof sha === 'string' && sha.length > 0) {
    const text = formatCheckpointPresent(sha, date);
    return `${BOX.vertical} ${padRight(text, contentWidth)} ${BOX.vertical}`;
  }
  const warnIcon = colors.warning('\u26A0'); // ⚠
  const noCheckpointLine = `Checkpoint: none ${warnIcon}`;
  return `${BOX.vertical} ${padRight(noCheckpointLine, contentWidth)} ${BOX.vertical}`;
}

/**
 * Renders checkpoint and coverage lines for a graph card.
 * @param {GraphInfo} graph - Graph info object
 * @param {number} contentWidth - Available content width
 * @returns {string[]} Status lines
 */
function renderCardStatus(graph, contentWidth) {
  const lines = [];

  const checkpointLine = renderCheckpointLine(graph, contentWidth);
  if (checkpointLine !== null) {
    lines.push(checkpointLine);
  }

  // Coverage info (if present)
  if (typeof graph.coverage?.sha === 'string' && graph.coverage.sha.length > 0) {
    const shortSha = graph.coverage.sha.slice(0, 7);
    const coverageLine = `Coverage: ${shortSha}`;
    lines.push(`${BOX.vertical} ${padRight(colors.muted(coverageLine), contentWidth)} ${BOX.vertical}`);
  }

  return lines;
}

/**
 * Renders a single graph card.
 * @param {GraphInfo} graph - Graph info object
 * @param {number} innerWidth - Available width inside the card
 * @returns {string[]} Array of lines for this graph card
 */
function renderGraphCard(graph, innerWidth) {
  const contentWidth = innerWidth - 4; // Account for │ padding on each side

  const headerLines = renderCardHeader(graph, contentWidth);
  const timelineLines = renderWriterTimelines(graph.writerPatches, contentWidth);
  const statusLines = renderCardStatus(graph, contentWidth);
  const bottomBorder = `${BOX.bottomLeft}${BOX.horizontal.repeat(contentWidth + 2)}${BOX.bottomRight}`;

  return [...headerLines, ...timelineLines, ...statusLines, bottomBorder];
}

/**
 * Wraps content in a boxen container with the standard WARP GRAPHS styling.
 * @param {string} content - Content to wrap
 * @param {string} title - Box title
 * @returns {string} Boxen-wrapped output with trailing newline
 */
function wrapInBox(content, title) {
  const box = boxen(content, {
    title,
    titleAlignment: 'center',
    padding: 1,
    borderStyle: 'double',
    borderColor: 'cyan',
  });
  return `${box}\n`;
}

/**
 * Builds the card content lines for all graphs.
 * @param {GraphInfo[]} graphs - Non-empty array of graph info objects
 * @returns {string} Joined content lines
 */
function buildGraphCards(graphs) {
  const innerWidth = 60;
  const contentLines = [];

  for (let i = 0; i < graphs.length; i++) {
    if (i > 0) {
      contentLines.push('');
    }
    const gi = graphs[i];
    if (gi) {
      contentLines.push(...renderGraphCard(gi, innerWidth));
    }
  }
  return contentLines.join('\n');
}

/**
 * Renders the info view with ASCII box art.
 * @param {{ repo?: string, graphs: GraphInfo[] }} data - Info payload from handleInfo
 * @returns {string} Formatted ASCII output
 */
export function renderInfoView(data) {
  if (data === null || data === undefined || !Array.isArray(data.graphs)) {
    return `${colors.error('No data available')}\n`;
  }

  const { graphs } = data;

  if (graphs.length === 0) {
    return wrapInBox(colors.muted('No WARP graphs found in this repository.'), 'WARP GRAPHS');
  }

  return wrapInBox(buildGraphCards(graphs), 'WARP GRAPHS IN REPOSITORY');
}

export default { renderInfoView };
