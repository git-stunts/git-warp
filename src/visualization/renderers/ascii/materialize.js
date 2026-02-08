/**
 * Materialize command ASCII visualization renderer.
 *
 * Renders a visual dashboard showing materialization results with
 * progress indicators, statistics bar charts, and checkpoint info.
 */

import { createBox } from './box.js';
import { progressBar } from './progress.js';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { truncate } from '../../utils/truncate.js';
import { formatNumber, formatSha } from './formatters.js';

// Bar chart settings
const BAR_WIDTH = 20;
const STAT_LABEL_WIDTH = 12;

/**
 * Create a scaled bar for statistics display.
 * @param {number} value - The value to display
 * @param {number} maxValue - Maximum value for scaling (0 = no scaling)
 * @param {number} width - Bar width in characters
 * @returns {string} Formatted bar string
 */
function statBar(value, maxValue, width = BAR_WIDTH) {
  if (maxValue === 0 || value === 0) {
    return colors.muted('\u2591'.repeat(width));
  }
  const percent = Math.min(100, (value / maxValue) * 100);
  const filledCount = Math.round((percent / 100) * width);
  const emptyCount = width - filledCount;
  const bar = '\u2588'.repeat(filledCount) + '\u2591'.repeat(emptyCount);
  return colors.primary(bar);
}

/**
 * Render graph header with icon and name.
 * @param {string} graphName - Name of the graph
 * @returns {string[]} Header lines
 */
function renderGraphHeader(graphName) {
  const graphIcon = '\uD83D\uDCCA'; // 📊
  return [`  ${graphIcon} ${colors.bold(graphName)}`, ''];
}

/**
 * Render error state for a graph.
 * @param {string} errorMessage - Error message
 * @returns {string[]} Error lines
 */
function renderErrorState(errorMessage) {
  return [`  ${colors.error('\u2717')} Error: ${errorMessage}`];
}

/**
 * Render no-op state (already materialized).
 * @param {Object} graph - Graph data
 * @returns {string[]} No-op state lines
 */
function renderNoOpState(graph) {
  const lines = [
    `  ${colors.success('\u2713')} Already materialized (no new patches)`,
    '',
    `  ${padRight('Nodes:', STAT_LABEL_WIDTH)} ${formatNumber(graph.nodes)}`,
    `  ${padRight('Edges:', STAT_LABEL_WIDTH)} ${formatNumber(graph.edges)}`,
  ];
  if (typeof graph.properties === 'number') {
    lines.push(`  ${padRight('Properties:', STAT_LABEL_WIDTH)} ${formatNumber(graph.properties)}`);
  }
  return lines;
}

/**
 * Render empty graph state (0 patches).
 * @param {Object} graph - Graph data
 * @returns {string[]} Empty state lines
 */
function renderEmptyState(graph) {
  const lines = [`  ${colors.muted('Empty graph (0 patches)')}`, ''];
  if (graph.checkpoint) {
    lines.push(`  Checkpoint: ${formatSha(graph.checkpoint)} ${colors.success('\u2713')}`);
  }
  return lines;
}

/**
 * Render writer progress section.
 * @param {Object} writers - Writer patch counts
 * @returns {string[]} Writer lines
 */
function renderWriterSection(writers) {
  if (!writers || Object.keys(writers).length === 0) {
    return [];
  }
  const lines = [`  ${colors.dim('Writers:')}`];
  const writerEntries = Object.entries(writers);
  const maxPatches = Math.max(...writerEntries.map(([, p]) => p), 1);
  const maxWriterWidth = Math.min(Math.max(...writerEntries.map(([id]) => id.length), 6), 16);
  for (const [writerId, patchCount] of writerEntries) {
    const bar = progressBar(Math.round((patchCount / maxPatches) * 100), 15, { showPercent: false });
    const displayId = truncate(writerId, maxWriterWidth);
    lines.push(`    ${padRight(displayId, maxWriterWidth)} ${bar} ${patchCount} patches`);
  }
  lines.push('');
  return lines;
}

/**
 * Render statistics section with bar charts.
 * @param {Object} graph - Graph data
 * @param {Object} maxValues - Max values for scaling
 * @returns {string[]} Statistics lines
 */
function renderStatsSection(graph, { maxNodes, maxEdges, maxProps }) {
  const lines = [
    `  ${colors.dim('Statistics:')}`,
    `  ${padRight('Nodes:', STAT_LABEL_WIDTH)} ${statBar(graph.nodes, maxNodes)} ${formatNumber(graph.nodes)}`,
    `  ${padRight('Edges:', STAT_LABEL_WIDTH)} ${statBar(graph.edges, maxEdges)} ${formatNumber(graph.edges)}`,
  ];
  if (typeof graph.properties === 'number') {
    lines.push(`  ${padRight('Properties:', STAT_LABEL_WIDTH)} ${statBar(graph.properties, maxProps)} ${formatNumber(graph.properties)}`);
  }
  lines.push('');
  return lines;
}

/**
 * Render checkpoint info line.
 * @param {string|null} checkpoint - Checkpoint SHA or null
 * @returns {string[]} Checkpoint lines
 */
function renderCheckpointInfo(checkpoint) {
  if (checkpoint) {
    return [`  Checkpoint: ${formatSha(checkpoint)} ${colors.success('\u2713 created')}`];
  }
  return [`  Checkpoint: ${colors.warning('none')}`];
}

/**
 * Render a single graph's materialization result.
 * @param {Object} graph - Graph result from materialize
 * @param {Object} maxValues - Max values for scaling bars
 * @returns {string[]} Array of lines for this graph
 */
function renderGraphResult(graph, maxValues) {
  const lines = [...renderGraphHeader(graph.graph)];

  if (graph.error) {
    return [...lines, ...renderErrorState(graph.error)];
  }
  if (graph.noOp) {
    return [...lines, ...renderNoOpState(graph)];
  }
  if (graph.patchCount === 0) {
    return [...lines, ...renderEmptyState(graph)];
  }

  lines.push(...renderWriterSection(graph.writers));
  lines.push(...renderStatsSection(graph, maxValues));
  lines.push(...renderCheckpointInfo(graph.checkpoint));
  return lines;
}

/**
 * Calculate max values for scaling bar charts.
 * @param {Object[]} graphs - Array of graph results
 * @returns {Object} Max values object
 */
function calculateMaxValues(graphs) {
  const successfulGraphs = graphs.filter((g) => !g.error);
  return {
    maxNodes: Math.max(...successfulGraphs.map((g) => g.nodes || 0), 1),
    maxEdges: Math.max(...successfulGraphs.map((g) => g.edges || 0), 1),
    maxProps: Math.max(...successfulGraphs.map((g) => g.properties || 0), 1),
  };
}

/**
 * Build summary line based on success/failure counts.
 * @param {number} successCount - Number of successful graphs
 * @param {number} errorCount - Number of failed graphs
 * @returns {string} Summary line
 */
function buildSummaryLine(successCount, errorCount) {
  if (errorCount === 0) {
    const plural = successCount !== 1 ? 's' : '';
    return `  ${colors.success('\u2713')} ${successCount} graph${plural} materialized successfully`;
  }
  if (successCount === 0) {
    const plural = errorCount !== 1 ? 's' : '';
    return `  ${colors.error('\u2717')} ${errorCount} graph${plural} failed`;
  }
  return `  ${colors.warning('\u26A0')} ${successCount} succeeded, ${errorCount} failed`;
}

/**
 * Determine border color based on success/failure counts.
 * @param {number} successCount - Number of successful graphs
 * @param {number} errorCount - Number of failed graphs
 * @returns {string} Border color name
 */
function getBorderColor(successCount, errorCount) {
  if (errorCount > 0 && successCount === 0) {
    return 'red';
  }
  if (errorCount > 0) {
    return 'yellow';
  }
  return 'green';
}

/**
 * Render the materialize view dashboard.
 * @param {Object} payload - The materialize command payload
 * @param {Object[]} payload.graphs - Array of graph results
 * @returns {string} Formatted dashboard string
 */
export function renderMaterializeView(payload) {
  if (!payload || !payload.graphs) {
    return `${colors.error('No data available')}\n`;
  }

  const { graphs } = payload;

  if (graphs.length === 0) {
    const content = colors.muted('No WARP graphs found in this repository.');
    return `${createBox(content, { title: 'MATERIALIZE', titleAlignment: 'center', borderColor: 'cyan' })}\n`;
  }

  const maxValues = calculateMaxValues(graphs);
  const lines = [];
  const separator = colors.muted(`  ${'\u2500'.repeat(50)}`);

  for (let i = 0; i < graphs.length; i++) {
    if (i > 0) {
      lines.push('', separator, '');
    }
    lines.push(...renderGraphResult(graphs[i], maxValues));
  }

  const successCount = graphs.filter((g) => !g.error).length;
  const errorCount = graphs.length - successCount;
  lines.push('', buildSummaryLine(successCount, errorCount));

  const box = createBox(lines.join('\n'), {
    title: 'MATERIALIZE',
    titleAlignment: 'center',
    borderColor: getBorderColor(successCount, errorCount),
  });

  return `${box}\n`;
}

export default { renderMaterializeView };
