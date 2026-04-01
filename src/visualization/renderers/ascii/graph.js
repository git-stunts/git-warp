/**
 * ASCII graph renderer: maps ELK-positioned nodes and edges onto a character grid.
 *
 * Pixel-to-character scaling:
 *   cellW = 10, cellH = 10
 *   ELK uses NODE_HEIGHT=40, nodeNode=40, betweenLayers=60.
 *   At cellH=10: 40px → 4 rows, compact 3-row nodes fit with natural gaps.
 */

import { createBox } from './box.js';
import { colors } from './colors.js';
import { ARROW } from './symbols.js';

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ startPoint?: Point, endPoint?: Point, bendPoints?: Point[] }} Section
 * @typedef {{ id: string, x: number, y: number, width: number, height: number, label?: string }} PositionedNode
 * @typedef {{ id: string, source: string, target: string, label?: string, sections?: Section[] }} PositionedEdge
 * @typedef {{ nodes: PositionedNode[], edges: PositionedEdge[], width: number, height: number }} PositionedGraph
 */

// ── Scaling constants ────────────────────────────────────────────────────────

const CELL_W = 10;
const CELL_H = 10;
const MARGIN = 2;

// ── Box-drawing characters (short keys for tight grid-stamping loops) ───────

const BOX = {
  tl: '\u250C', // ┌
  tr: '\u2510', // ┐
  bl: '\u2514', // └
  br: '\u2518', // ┘
  h: '\u2500',  // ─
  v: '\u2502',  // │
};

// ── Grid helpers ─────────────────────────────────────────────────────────────

/** Convert a horizontal pixel coordinate to a grid column index.
 * @param {number} px */
function toCol(px) {
  return Math.round(px / CELL_W) + MARGIN;
}

/** Convert a vertical pixel coordinate to a grid row index.
 * @param {number} px */
function toRow(px) {
  return Math.round(px / CELL_H) + MARGIN;
}

/** Scale a horizontal pixel distance to character columns.
 * @param {number} px */
function scaleW(px) {
  return Math.round(px / CELL_W);
}

/** Scale a vertical pixel distance to character rows.
 * @param {number} px */
function scaleH(px) {
  return Math.round(px / CELL_H);
}

/** Allocate a blank character grid filled with spaces.
 * @param {number} rows
 * @param {number} cols
 * @returns {string[][]}
 */
function createGrid(rows, cols) {
  /** @type {string[][]} */
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(' '));
  }
  return grid;
}

/** Write a single character to a grid cell if the coordinates are in bounds.
 * @param {string[][]} grid
 * @param {number} r
 * @param {number} c
 * @param {string} ch
 */
function writeChar(grid, r, c, ch) {
  if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
    grid[r][c] = ch;
  }
}

/** Read a single character from a grid cell, returning a space if out of bounds.
 * @param {string[][]} grid
 * @param {number} r
 * @param {number} c
 * @returns {string}
 */
function readChar(grid, r, c) {
  if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
    return grid[r][c];
  }
  return ' ';
}

/** Write a string horizontally starting at the given grid position.
 * @param {string[][]} grid
 * @param {number} r
 * @param {number} c
 * @param {string} str
 */
function writeString(grid, r, c, str) {
  for (let i = 0; i < str.length; i++) {
    writeChar(grid, r, c + i, str[i]);
  }
}

// ── Node stamping ────────────────────────────────────────────────────────────

/** Stamp a box-drawn node with its label onto the character grid.
 * @param {string[][]} grid
 * @param {PositionedNode} node
 */
function stampNode(grid, node) {
  const r = toRow(node.y);
  const c = toCol(node.x);
  const w = Math.max(toCol(node.width), 4);
  const h = 3; // Always: border + label + border

  // Top border
  writeChar(grid, r, c, BOX.tl);
  for (let i = 1; i < w - 1; i++) {
    writeChar(grid, r, c + i, BOX.h);
  }
  writeChar(grid, r, c + w - 1, BOX.tr);

  // Side borders
  writeChar(grid, r + 1, c, BOX.v);
  writeChar(grid, r + 1, c + w - 1, BOX.v);

  // Bottom border
  writeChar(grid, r + h - 1, c, BOX.bl);
  for (let i = 1; i < w - 1; i++) {
    writeChar(grid, r + h - 1, c + i, BOX.h);
  }
  writeChar(grid, r + h - 1, c + w - 1, BOX.br);

  // Label (always on row 1)
  const label = node.label ?? node.id;
  const maxLabel = w - 4;
  const truncated = label.length > maxLabel
    ? `${label.slice(0, Math.max(maxLabel - 1, 1))}\u2026`
    : label;
  const labelRow = r + 1;
  const labelCol = c + Math.max(1, Math.floor((w - truncated.length) / 2));
  writeString(grid, labelRow, labelCol, truncated);
}

// ── Edge tracing ─────────────────────────────────────────────────────────────

/** Trace an edge path across the grid, drawing line segments and an arrowhead.
 * @param {string[][]} grid
 * @param {PositionedEdge} edge
 * @param {Set<string>} nodeSet
 */
function traceEdge(grid, edge, nodeSet) {
  const { sections } = edge;
  if (!sections || sections.length === 0) {
    return;
  }

  for (const section of sections) {
    const points = buildPointList(section);
    drawSegments(grid, points, nodeSet);
  }

  // Arrowhead at the end of the last section
  const lastSection = sections[sections.length - 1];
  const ep = lastSection.endPoint;
  if (ep) {
    drawArrowhead(grid, lastSection, nodeSet);
  }

  // Edge label at midpoint of the longest section segment
  if (edge.label !== undefined && edge.label.length > 0) {
    placeEdgeLabel(grid, sections, edge.label, nodeSet);
  }
}

/** Collect start, bend, and end points of a section into an ordered array.
 * @param {Section} section @returns {Point[]} */
function buildPointList(section) {
  const points = [];
  if (section.startPoint) {
    points.push(section.startPoint);
  }
  if (section.bendPoints) {
    points.push(...section.bendPoints);
  }
  if (section.endPoint) {
    points.push(section.endPoint);
  }
  return points;
}

/** Draw consecutive line segments between adjacent points in the list.
 * @param {string[][]} grid
 * @param {Point[]} points
 * @param {Set<string>} nodeSet
 */
function drawSegments(grid, points, nodeSet) {
  for (let i = 0; i < points.length - 1; i++) {
    const r1 = toRow(points[i].y);
    const c1 = toCol(points[i].x);
    const r2 = toRow(points[i + 1].y);
    const c2 = toCol(points[i + 1].x);
    drawLine(grid, r1, c1, r2, c2, nodeSet);
  }
}

/** Draw a straight or L-shaped line between two grid positions.
 * @param {string[][]} grid
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @param {Set<string>} nodeSet
 */
function drawLine(grid, r1, c1, r2, c2, nodeSet) {
  if (r1 === r2) {
    drawHorizontal(grid, r1, c1, c2, nodeSet);
  } else if (c1 === c2) {
    drawVertical(grid, c1, r1, r2, nodeSet);
  } else {
    // Diagonal: draw L-shaped bend (horizontal first, then vertical)
    drawHorizontal(grid, r1, c1, c2, nodeSet);
    drawVertical(grid, c2, r1, r2, nodeSet);
  }
}

/** Draw a horizontal line between two columns, inserting crossings at intersections.
 * @param {string[][]} grid
 * @param {number} row
 * @param {number} c1
 * @param {number} c2
 * @param {Set<string>} nodeSet
 */
function drawHorizontal(grid, row, c1, c2, nodeSet) {
  const start = Math.min(c1, c2);
  const end = Math.max(c1, c2);
  for (let c = start; c <= end; c++) {
    if (!isNodeCell(nodeSet, row, c)) {
      const existing = readChar(grid, row, c);
      if (existing === BOX.v || existing === '|') {
        writeChar(grid, row, c, '+');
      } else {
        writeChar(grid, row, c, BOX.h);
      }
    }
  }
}

/** Draw a vertical line between two rows, inserting crossings at intersections.
 * @param {string[][]} grid
 * @param {number} col
 * @param {number} r1
 * @param {number} r2
 * @param {Set<string>} nodeSet
 */
function drawVertical(grid, col, r1, r2, nodeSet) {
  const start = Math.min(r1, r2);
  const end = Math.max(r1, r2);
  for (let r = start; r <= end; r++) {
    if (!isNodeCell(nodeSet, r, col)) {
      const existing = readChar(grid, r, col);
      if (existing === BOX.h || existing === '-') {
        writeChar(grid, r, col, '+');
      } else {
        writeChar(grid, r, col, BOX.v);
      }
    }
  }
}

/** Draw a directional arrowhead at the endpoint of an edge section.
 * @param {string[][]} grid
 * @param {Section} section
 * @param {Set<string>} nodeSet
 */
function drawArrowhead(grid, section, nodeSet) {
  const ep = section.endPoint;
  if (!ep) {
    return;
  }
  const er = toRow(ep.y);
  const ec = toCol(ep.x);

  // Determine direction from last segment
  const bends = section.bendPoints ?? [];
  const prev = bends.length > 0 ? bends[bends.length - 1] : section.startPoint;
  if (!prev) {
    return;
  }
  const pr = toRow(prev.y);
  const pc = toCol(prev.x);

  let arrow;
  let ar = er;
  let ac = ec;
  if (er > pr) {
    arrow = ARROW.down;
  } else if (er < pr) {
    arrow = ARROW.up;
  } else if (ec > pc) {
    arrow = ARROW.right;
  } else {
    arrow = ARROW.left;
  }

  // If the endpoint is inside a node box, step back one cell into free space
  if (isNodeCell(nodeSet, ar, ac)) {
    if (er > pr) {
      ar = er - 1;
    } else if (er < pr) {
      ar = er + 1;
    } else if (ec > pc) {
      ac = ec - 1;
    } else {
      ac = ec + 1;
    }
  }

  if (!isNodeCell(nodeSet, ar, ac)) {
    writeChar(grid, ar, ac, arrow);
  }
}

/** Place an edge label at the midpoint of its longest segment.
 * @param {string[][]} grid
 * @param {Section[]} sections
 * @param {string} label
 * @param {Set<string>} nodeSet
 */
function placeEdgeLabel(grid, sections, label, nodeSet) {
  // Find midpoint of the full path
  const allPoints = [];
  for (const s of sections) {
    allPoints.push(...buildPointList(s));
  }
  if (allPoints.length < 2) {
    return;
  }

  // Pick midpoint of the longest segment
  let bestLen = 0;
  let midR = 0;
  let midC = 0;
  for (let i = 0; i < allPoints.length - 1; i++) {
    const r1 = toRow(allPoints[i].y);
    const c1 = toCol(allPoints[i].x);
    const r2 = toRow(allPoints[i + 1].y);
    const c2 = toCol(allPoints[i + 1].x);
    const len = Math.abs(r2 - r1) + Math.abs(c2 - c1);
    if (len > bestLen) {
      bestLen = len;
      midR = Math.floor((r1 + r2) / 2);
      midC = Math.floor((c1 + c2) / 2);
    }
  }

  const trunc = label.length > 10
    ? `${label.slice(0, 9)}\u2026`
    : label;
  const startC = midC - Math.floor(trunc.length / 2);

  for (let i = 0; i < trunc.length; i++) {
    const tc = startC + i;
    if (!isNodeCell(nodeSet, midR, tc)) {
      writeChar(grid, midR, tc, trunc[i]);
    }
  }
}

// ── Node occupancy set ───────────────────────────────────────────────────────

/** Build a set of occupied grid coordinates from all positioned nodes.
 * @param {PositionedNode[]} nodes @returns {Set<string>} */
function buildNodeSet(nodes) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const node of nodes) {
    const r = toRow(node.y);
    const c = toCol(node.x);
    const w = Math.max(toCol(node.width), 4);
    const h = 3; // Match compact node height
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        set.add(`${r + dr},${c + dc}`);
      }
    }
  }
  return set;
}

/** Check whether a grid cell is occupied by a node box.
 * @param {Set<string>} nodeSet
 * @param {number} r
 * @param {number} c
 * @returns {boolean}
 */
function isNodeCell(nodeSet, r, c) {
  return nodeSet.has(`${r},${c}`);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Renders a PositionedGraph (from ELK) as an ASCII box-drawing string.
 *
 * @param {PositionedGraph} positionedGraph - PositionedGraph from runLayout()
 * @param {{ title?: string }} [options]
 * @returns {string} Rendered ASCII art wrapped in a box
 */
export function renderGraphView(positionedGraph, options = {}) {
  const { nodes = [], edges = [] } = positionedGraph;

  if (nodes.length === 0) {
    return createBox(colors.muted('  (empty graph)'), {
      title: options.title ?? 'GRAPH',
      titleAlignment: 'center',
      borderColor: 'cyan',
    });
  }

  const totalCols = scaleW(positionedGraph.width) + MARGIN * 2;
  const totalRows = scaleH(positionedGraph.height) + MARGIN * 2;

  const grid = createGrid(totalRows, totalCols);
  const nodeSet = buildNodeSet(nodes);

  // Edges first (nodes overwrite on overlap)
  for (const edge of edges) {
    traceEdge(grid, edge, nodeSet);
  }
  for (const node of nodes) {
    stampNode(grid, node);
  }

  // Colorize and join
  const raw = grid
    .map((row) => row.join('').replace(/\s+$/, ''))
    .join('\n');

  return createBox(raw, {
    title: options.title ?? 'GRAPH',
    titleAlignment: 'center',
    borderColor: 'cyan',
  });
}
