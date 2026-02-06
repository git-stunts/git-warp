/**
 * ASCII renderer for the `info --view` command.
 * Displays a beautiful box with graph summaries and writer timelines.
 */

import boxen from 'boxen';
import stringWidth from 'string-width';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { timeAgo } from '../../utils/time.js';

// Box drawing characters
const BOX = {
  topLeft: '\u250C',     // ┌
  topRight: '\u2510',    // ┐
  bottomLeft: '\u2514',  // └
  bottomRight: '\u2518', // ┘
  horizontal: '\u2500',  // ─
  vertical: '\u2502',    // │
};

// Timeline characters
const TIMELINE = {
  line: '\u2500',        // ─
  dot: '\u25CF',         // ●
};

// Maximum timeline width for patches
const MAX_TIMELINE_WIDTH = 40;

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

  let timeline = '';
  for (let i = 0; i < dotCount; i++) {
    if (i > 0) {
      timeline += colors.muted(TIMELINE.line.repeat(segmentWidth));
    }
    timeline += colors.primary(TIMELINE.dot);
  }

  // Add trailing line
  const remaining = scaledWidth - (dotCount * segmentWidth);
  if (remaining > 0) {
    timeline += colors.muted(TIMELINE.line.repeat(remaining));
  }

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
 * Renders the header lines for a graph card.
 * @param {Object} graph - Graph info object
 * @param {number} contentWidth - Available content width
 * @returns {string[]} Header lines
 */
function renderCardHeader(graph, contentWidth) {
  const lines = [];
  const graphIcon = '\uD83D\uDCCA'; // 📊
  const graphName = `${graphIcon} ${colors.bold(graph.name)}`;
  lines.push(`${BOX.topLeft}${BOX.horizontal.repeat(contentWidth + 2)}${BOX.topRight}`);
  lines.push(`${BOX.vertical} ${padRight(graphName, contentWidth)} ${BOX.vertical}`);

  // Writers summary
  const writerCount = graph.writers?.count ?? 0;
  const writerIds = graph.writers?.ids ?? [];
  const writerNames = formatWriterNames(writerIds);
  const writerLine = writerNames
    ? `Writers: ${writerCount} (${writerNames})`
    : `Writers: ${writerCount}`;
  lines.push(`${BOX.vertical} ${padRight(writerLine, contentWidth)} ${BOX.vertical}`);

  return lines;
}

/**
 * Renders writer timeline lines for a graph card.
 * @param {Object} writerPatches - Map of writerId to patch count
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
 * Renders checkpoint and coverage lines for a graph card.
 * @param {Object} graph - Graph info object
 * @param {number} contentWidth - Available content width
 * @returns {string[]} Status lines
 */
function renderCardStatus(graph, contentWidth) {
  const lines = [];

  // Checkpoint info
  if (graph.checkpoint) {
    const { sha, date } = graph.checkpoint;
    if (sha) {
      const shortSha = sha.slice(0, 7);
      const timeStr = date ? timeAgo(date) : '';
      const checkIcon = colors.success('\u2713'); // ✓
      const timePart = timeStr ? ` (${timeStr})` : '';
      const checkpointLine = `Checkpoint: ${shortSha}${timePart} ${checkIcon}`;
      lines.push(`${BOX.vertical} ${padRight(checkpointLine, contentWidth)} ${BOX.vertical}`);
    } else {
      const warnIcon = colors.warning('\u26A0'); // ⚠
      const noCheckpointLine = `Checkpoint: none ${warnIcon}`;
      lines.push(`${BOX.vertical} ${padRight(noCheckpointLine, contentWidth)} ${BOX.vertical}`);
    }
  }

  // Coverage info (if present)
  if (graph.coverage?.sha) {
    const shortSha = graph.coverage.sha.slice(0, 7);
    const coverageLine = `Coverage: ${shortSha}`;
    lines.push(`${BOX.vertical} ${padRight(colors.muted(coverageLine), contentWidth)} ${BOX.vertical}`);
  }

  return lines;
}

/**
 * Renders a single graph card.
 * @param {Object} graph - Graph info object
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
 * Renders the info view with ASCII box art.
 * @param {Object} data - Info payload from handleInfo
 * @param {string} data.repo - Repository path
 * @param {Object[]} data.graphs - Array of graph info objects
 * @returns {string} Formatted ASCII output
 */
export function renderInfoView(data) {
  if (!data || !data.graphs) {
    return `${colors.error('No data available')}\n`;
  }

  const { graphs } = data;

  if (graphs.length === 0) {
    const content = colors.muted('No WARP graphs found in this repository.');
    const box = boxen(content, {
      title: 'WARP GRAPHS',
      titleAlignment: 'center',
      padding: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
    });
    return `${box}\n`;
  }

  // Calculate inner width (for consistent card sizing)
  const innerWidth = 60;

  // Build content
  const contentLines = [];

  for (let i = 0; i < graphs.length; i++) {
    const graph = graphs[i];
    const cardLines = renderGraphCard(graph, innerWidth);

    // Add spacing between cards
    if (i > 0) {
      contentLines.push('');
    }

    contentLines.push(...cardLines);
  }

  const content = contentLines.join('\n');

  // Wrap in outer box
  const output = boxen(content, {
    title: 'WARP GRAPHS IN REPOSITORY',
    titleAlignment: 'center',
    padding: 1,
    borderStyle: 'double',
    borderColor: 'cyan',
  });

  return `${output}\n`;
}

export default { renderInfoView };
