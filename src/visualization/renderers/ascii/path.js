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
  if (label !== undefined && label !== null && label !== '' && typeof label === 'string') {
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
 * @param {{ nodeId: string, index: number, pathLength: number, edges?: string[] }} opts - Segment options
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
 * @param {string[] | undefined} edges - Optional array of edge labels (one fewer than nodes)
 * @param {number} maxWidth - Maximum line width
 * @returns {string[]} Array of line strings
 */
/**
 * @typedef {Object} LineAccumulator
 * @property {string[]} lines - Completed lines
 * @property {string} currentLine - Line being built
 * @property {number} currentWidth - Width of line being built
 * @property {number} maxWidth - Maximum line width
 */

/**
 * Appends a segment to the current line or starts a new line if it overflows.
 *
 * @param {LineAccumulator} state - Mutable accumulator
 * @param {{ segment: string, width: number }} seg - Segment text and visual width
 */
function appendSegment(state, seg) {
  if (!segmentFits(state.currentWidth, seg.width, state.maxWidth)) {
    state.lines.push(state.currentLine);
    state.currentLine = `  ${seg.segment}`;
    state.currentWidth = 2 + seg.width;
  } else {
    state.currentLine += seg.segment;
    state.currentWidth += seg.width;
  }
}

/**
 * Checks whether a path array is empty or missing.
 *
 * @param {string[] | null | undefined} path - The path to check
 * @returns {boolean} True if the path has no nodes
 */
function isEmptyPath(path) {
  return path === null || path === undefined || path.length === 0;
}

/**
 * Accumulates path segments into wrapped lines.
 *
 * @param {string[]} path - Array of node IDs (length >= 2)
 * @param {string[] | undefined} edges - Optional edge labels
 * @param {number} maxWidth - Maximum line width
 * @returns {string[]} Array of line strings
 */
function accumulatePathLines(path, edges, maxWidth) {
  /** @type {LineAccumulator} */
  const state = { lines: [], currentLine: '', currentWidth: 0, maxWidth };

  for (let i = 0; i < path.length; i++) {
    appendSegment(state, createPathSegment({
      nodeId: path[i],
      index: i,
      pathLength: path.length,
      edges,
    }));
  }

  if (state.currentLine !== '') {
    state.lines.push(state.currentLine);
  }

  return state.lines;
}

/**
 * Builds path segments that fit within the terminal width.
 * Wraps long paths to multiple lines.
 *
 * @param {string[]} path - Array of node IDs
 * @param {string[] | undefined} edges - Optional array of edge labels (one fewer than nodes)
 * @param {number} maxWidth - Maximum line width
 * @returns {string[]} Array of line strings
 */
function buildPathLines(path, edges, maxWidth) {
  if (isEmptyPath(path)) {
    return [];
  }

  if (path.length === 1) {
    return [colors.primary(formatNode(path[0]))];
  }

  return accumulatePathLines(path, edges, maxWidth);
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
 * Builds the title for a found-path box from start and end nodes.
 *
 * @param {string[]} path - Array of node IDs
 * @returns {string} Box title string
 */
function buildFoundPathTitle(path) {
  const startLabel = (path.length > 0 && path[0] !== '') ? path[0] : '?';
  const endLabel = (path.length > 0 && path[path.length - 1] !== '') ? path[path.length - 1] : '?';
  return `PATH: ${startLabel} ${ARROW.right} ${endLabel}`;
}

/**
 * Returns a display label for a graph name, defaulting to 'unknown'.
 *
 * @param {string} graph - The graph name
 * @returns {string} The graph name or 'unknown' if empty/nullish
 */
function graphDisplayLabel(graph) {
  return (graph !== null && graph !== undefined && graph !== '') ? graph : 'unknown';
}

/**
 * Builds the content lines for a found-path box.
 *
 * @param {{ graph: string, path: string[], length: number, edges?: string[] }} params - Path data
 * @param {number} maxWidth - Maximum line width for path wrapping
 * @returns {string[]} Content lines
 */
function buildFoundPathContent({ graph, path, length, edges }, maxWidth) {
  const hopLabel = length === 1 ? 'hop' : 'hops';
  const pathLines = buildPathLines(path, edges, maxWidth);

  const lines = [
    `  Graph:  ${colors.muted(graphDisplayLabel(graph))}`,
    `  Length: ${colors.success(String(length))} ${hopLabel}`,
    '',
  ];

  for (const line of pathLines) {
    lines.push(`  ${line}`);
  }

  return lines;
}

/**
 * Renders a found path.
 *
 * @param {{ graph: string, from: string, to: string, path: string[], length: number, edges?: string[] }} payload - Path payload
 * @param {number} [terminalWidth] - Terminal width for wrapping
 * @returns {string} Formatted ASCII output
 */
function renderFoundPath(payload, terminalWidth = DEFAULT_TERMINAL_WIDTH) {
  const maxWidth = Math.max(40, terminalWidth - BOX_PADDING - 4);
  const lines = buildFoundPathContent(payload, maxWidth);

  return createBox(lines.join('\n'), {
    title: buildFoundPathTitle(payload.path),
    titleAlignment: 'center',
    borderColor: 'green',
  });
}

/**
 * Renders the path view.
 * @param {{ graph: string, from: string, to: string, found: boolean, path: string[], length: number, edges?: string[] }} payload - The path command payload
 * @param {{ terminalWidth?: number }} [options] - Rendering options
 * @returns {string} Formatted ASCII output
 */
/**
 * Determines the terminal width from options, falling back to the default.
 *
 * @param {{ terminalWidth?: number }} options - Rendering options
 * @returns {number} Resolved terminal width
 */
function resolveTerminalWidth(options) {
  const w = options.terminalWidth;
  return (w !== undefined && w !== null && w !== 0 && !Number.isNaN(w)) ? w : DEFAULT_TERMINAL_WIDTH;
}

/**
 * Checks whether the payload represents a same-node (zero-length) path.
 *
 * @param {string[]} path - The path array
 * @param {number} length - The hop length
 * @returns {boolean} True if this is the "already at destination" case
 */
function isSameNodePath(path, length) {
  return length === 0 && path !== null && path !== undefined && path.length === 1;
}

/**
 * Checks whether a payload is missing or nullish.
 *
 * @param {unknown} payload - The payload to check
 * @returns {boolean} True if payload is null or undefined
 */
function isNullishPayload(payload) {
  return payload === null || payload === undefined;
}

/**
 * Renders the path view.
 *
 * @param {{ graph: string, from: string, to: string, found: boolean, path: string[], length: number, edges?: string[] }} payload - The path command payload
 * @param {{ terminalWidth?: number }} [options] - Rendering options
 * @returns {string} Formatted ASCII output
 */
export function renderPathView(payload, options = {}) {
  if (isNullishPayload(payload)) {
    return `${colors.error('No data available')}\n`;
  }

  if (!payload.found) {
    return `${renderNoPath(payload.from, payload.to)}\n`;
  }

  if (isSameNodePath(payload.path, payload.length)) {
    return `${renderSameNode(payload.path[0])}\n`;
  }

  return `${renderFoundPath(payload, resolveTerminalWidth(options))}\n`;
}

export default { renderPathView };
