/**
 * ASCII renderer for the `path --view` command.
 * Displays the shortest path between two nodes as a connected chain.
 */

import stringWidth from 'string-width';
import { createBox } from './box.js';
import { colors } from './colors.js';
import { ARROW } from './symbols.js';

// Default terminal width for wrapping
const DEFAULT_TERMINAL_WIDTH = 80;

// Box content padding (for inner width calculation)
const BOX_PADDING = 4;

/**
 * Formats a node ID for display, truncating if necessary.
 * @param {string} nodeId - The node ID to format
 * @param {number} [maxLen=20] - Maximum length before truncation
 * @returns {string} Formatted node ID with brackets
 */
function formatNode(nodeId, maxLen = 20) {
  if (!nodeId || typeof nodeId !== 'string') {
    return '[?]';
  }
  const truncated = nodeId.length > maxLen
    ? `${nodeId.slice(0, maxLen - 1)}\u2026`
    : nodeId;
  return `[${truncated}]`;
}

/**
 * Creates an arrow string for connecting nodes.
 * @param {string} [label] - Optional edge label to display on the arrow
 * @returns {string} Arrow string like " ---> " or " --label--> "
 */
function createArrow(label) {
  if (label && typeof label === 'string') {
    return ` ${ARROW.line}${ARROW.line}${label}${ARROW.line}${ARROW.line}${ARROW.right} `;
  }
  return ` ${ARROW.line}${ARROW.line}${ARROW.line}${ARROW.right} `;
}

/**
 * Checks if a segment fits on the current line.
 * @param {number} currentWidth - Current line width
 * @param {number} segmentWidth - Width of segment to add
 * @param {number} maxWidth - Maximum line width
 * @returns {boolean} Whether the segment fits
 */
function segmentFits(currentWidth, segmentWidth, maxWidth) {
  return currentWidth === 0 || currentWidth + segmentWidth <= maxWidth;
}

/**
 * Creates a path segment with node and optional arrow.
 * @param {Object} opts - Segment options
 * @param {string} opts.nodeId - Node ID
 * @param {number} opts.index - Position in path
 * @param {number} opts.pathLength - Total path length
 * @param {string[]} [opts.edges] - Optional edge labels
 * @returns {{segment: string, width: number}} Segment string and its width
 */
function createPathSegment({ nodeId, index, pathLength, edges }) {
  const node = formatNode(nodeId);
  const isEndpoint = index === 0 || index === pathLength - 1;
  const coloredNode = isEndpoint ? colors.primary(node) : node;
  const arrow = index < pathLength - 1 ? createArrow(edges?.[index]) : '';
  const segment = coloredNode + arrow;
  return { segment, width: stringWidth(segment) };
}

/**
 * Builds path segments that fit within the terminal width.
 * Wraps long paths to multiple lines.
 * @param {string[]} path - Array of node IDs
 * @param {string[]} [edges] - Optional array of edge labels (one fewer than nodes)
 * @param {number} maxWidth - Maximum line width
 * @returns {string[]} Array of line strings
 */
function buildPathLines(path, edges, maxWidth) {
  if (!path || path.length === 0) {
    return [];
  }

  if (path.length === 1) {
    return [colors.primary(formatNode(path[0]))];
  }

  const lines = [];
  let currentLine = '';
  let currentWidth = 0;

  for (let i = 0; i < path.length; i++) {
    const { segment, width } = createPathSegment({
      nodeId: path[i],
      index: i,
      pathLength: path.length,
      edges,
    });

    if (!segmentFits(currentWidth, width, maxWidth)) {
      lines.push(currentLine);
      currentLine = `  ${segment}`;
      currentWidth = 2 + width;
    } else {
      currentLine += segment;
      currentWidth += width;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Renders the "no path found" case.
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @returns {string} Formatted ASCII output
 */
function renderNoPath(from, to) {
  const lines = [
    `  ${colors.error('No path found')}`,
    '',
    `  From: ${colors.primary(from || '?')}`,
    `  To:   ${colors.primary(to || '?')}`,
    '',
    `  ${colors.muted('The nodes may be disconnected or unreachable')}`,
    `  ${colors.muted('with the given traversal direction.')}`,
  ];

  return createBox(lines.join('\n'), {
    title: 'PATH',
    titleAlignment: 'center',
    borderColor: 'red',
  });
}

/**
 * Renders the "already at destination" case (from === to).
 * @param {string} nodeId - The node ID
 * @returns {string} Formatted ASCII output
 */
function renderSameNode(nodeId) {
  const lines = [
    `  ${colors.success('Already at destination')}`,
    '',
    `  ${colors.primary(formatNode(nodeId))}`,
    '',
    `  ${colors.muted('Start and end are the same node.')}`,
  ];

  return createBox(lines.join('\n'), {
    title: 'PATH',
    titleAlignment: 'center',
    borderColor: 'green',
  });
}

/**
 * Renders a found path.
 * @param {Object} payload - Path payload
 * @param {string} payload.graph - Graph name
 * @param {string} payload.from - Source node ID
 * @param {string} payload.to - Target node ID
 * @param {string[]} payload.path - Array of node IDs in the path
 * @param {number} payload.length - Path length (number of edges)
 * @param {string[]} [payload.edges] - Optional array of edge labels
 * @param {number} [terminalWidth] - Terminal width for wrapping
 * @returns {string} Formatted ASCII output
 */
function renderFoundPath(payload, terminalWidth = DEFAULT_TERMINAL_WIDTH) {
  const { graph, path, length, edges } = payload;

  // Calculate available width for path (account for box borders and padding)
  const maxWidth = Math.max(40, terminalWidth - BOX_PADDING - 4);

  const hopLabel = length === 1 ? 'hop' : 'hops';
  const pathLines = buildPathLines(path, edges, maxWidth);

  const lines = [
    `  Graph:  ${colors.muted(graph || 'unknown')}`,
    `  Length: ${colors.success(String(length))} ${hopLabel}`,
    '',
  ];

  // Add path visualization
  for (const line of pathLines) {
    lines.push(`  ${line}`);
  }

  return createBox(lines.join('\n'), {
    title: `PATH: ${path[0] || '?'} ${ARROW.right} ${path[path.length - 1] || '?'}`,
    titleAlignment: 'center',
    borderColor: 'green',
  });
}

/**
 * Renders the path view.
 * @param {Object} payload - The path command payload
 * @param {string} payload.graph - Graph name
 * @param {string} payload.from - Source node ID
 * @param {string} payload.to - Target node ID
 * @param {boolean} payload.found - Whether a path was found
 * @param {string[]} payload.path - Array of node IDs in the path
 * @param {number} payload.length - Path length (number of edges)
 * @param {string[]} [payload.edges] - Optional array of edge labels
 * @param {Object} [options] - Rendering options
 * @param {number} [options.terminalWidth] - Terminal width for wrapping
 * @returns {string} Formatted ASCII output
 */
export function renderPathView(payload, options = {}) {
  if (!payload) {
    return `${colors.error('No data available')}\n`;
  }

  const { from, to, found, path, length } = payload;
  const terminalWidth = options.terminalWidth || process.stdout.columns || DEFAULT_TERMINAL_WIDTH;

  // Handle "no path found" case
  if (!found) {
    return `${renderNoPath(from, to)}\n`;
  }

  // Handle "already at destination" case (from === to, length === 0)
  if (length === 0 && path && path.length === 1) {
    return `${renderSameNode(path[0])}\n`;
  }

  // Render the found path
  return `${renderFoundPath(payload, terminalWidth)}\n`;
}

export default { renderPathView };
