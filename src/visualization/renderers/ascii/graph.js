/**
 * ASCII graph renderer: maps ELK-positioned nodes and edges onto a character grid.
 *
 * Pixel-to-character scaling:
 *   cellW = 8 px/char, cellH = 4 px/char (approximate monospace aspect ratio)
 */

import { createBox } from './box.js';
import { colors } from './colors.js';

// ── Scaling constants ────────────────────────────────────────────────────────

const CELL_W = 8;
const CELL_H = 4;
const MARGIN = 2;

// ── Box-drawing characters ───────────────────────────────────────────────────

const BOX = {
  tl: '\u250C', // ┌
  tr: '\u2510', // ┐
  bl: '\u2514', // └
  br: '\u2518', // ┘
  h: '\u2500',  // ─
  v: '\u2502',  // │
};

const ARROW = {
  right: '\u25B6', // ▶
  down: '\u25BC',  // ▼
  left: '\u25C0',  // ◀
  up: '\u25B2',    // ▲
};

// ── Grid helpers ─────────────────────────────────────────────────────────────

function toCol(px) {
  return Math.round(px / CELL_W) + MARGIN;
}

function toRow(px) {
  return Math.round(px / CELL_H) + MARGIN;
}

function scaleW(px) {
  return Math.round(px / CELL_W);
}

function scaleH(px) {
  return Math.round(px / CELL_H);
}

function createGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(' '));
  }
  return grid;
}

function writeChar(grid, r, c, ch) {
  if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
    grid[r][c] = ch;
  }
}

function readChar(grid, r, c) {
  if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
    return grid[r][c];
  }
  return ' ';
}

function writeString(grid, r, c, str) {
  for (let i = 0; i < str.length; i++) {
    writeChar(grid, r, c + i, str[i]);
  }
}

// ── Node stamping ────────────────────────────────────────────────────────────

function stampNode(grid, node) {
  const r = toRow(node.y);
  const c = toCol(node.x);
  const w = Math.max(scaleW(node.width), 4);
  const h = Math.max(scaleH(node.height), 3);

  // Top border
  writeChar(grid, r, c, BOX.tl);
  for (let i = 1; i < w - 1; i++) {
    writeChar(grid, r, c + i, BOX.h);
  }
  writeChar(grid, r, c + w - 1, BOX.tr);

  // Side borders
  for (let j = 1; j < h - 1; j++) {
    writeChar(grid, r + j, c, BOX.v);
    writeChar(grid, r + j, c + w - 1, BOX.v);
  }

  // Bottom border
  writeChar(grid, r + h - 1, c, BOX.bl);
  for (let i = 1; i < w - 1; i++) {
    writeChar(grid, r + h - 1, c + i, BOX.h);
  }
  writeChar(grid, r + h - 1, c + w - 1, BOX.br);

  // Label (centered)
  const label = node.label ?? node.id;
  const maxLabel = w - 4;
  const truncated = label.length > maxLabel
    ? `${label.slice(0, Math.max(maxLabel - 1, 1))}\u2026`
    : label;
  const labelRow = r + Math.floor(h / 2);
  const labelCol = c + Math.max(1, Math.floor((w - truncated.length) / 2));
  writeString(grid, labelRow, labelCol, truncated);
}

// ── Edge tracing ─────────────────────────────────────────────────────────────

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
  if (edge.label) {
    placeEdgeLabel(grid, sections, edge.label, nodeSet);
  }
}

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

function drawSegments(grid, points, nodeSet) {
  for (let i = 0; i < points.length - 1; i++) {
    const r1 = toRow(points[i].y);
    const c1 = toCol(points[i].x);
    const r2 = toRow(points[i + 1].y);
    const c2 = toCol(points[i + 1].x);
    drawLine(grid, r1, c1, r2, c2, nodeSet);
  }
}

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
  if (er > pr) {
    arrow = ARROW.down;
  } else if (er < pr) {
    arrow = ARROW.up;
  } else if (ec > pc) {
    arrow = ARROW.right;
  } else {
    arrow = ARROW.left;
  }

  if (!isNodeCell(nodeSet, er, ec)) {
    writeChar(grid, er, ec, arrow);
  }
}

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

function buildNodeSet(nodes) {
  const set = new Set();
  for (const node of nodes) {
    const r = toRow(node.y);
    const c = toCol(node.x);
    const w = Math.max(scaleW(node.width), 4);
    const h = Math.max(scaleH(node.height), 3);
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        set.add(`${r + dr},${c + dc}`);
      }
    }
  }
  return set;
}

function isNodeCell(nodeSet, r, c) {
  return nodeSet.has(`${r},${c}`);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Renders a PositionedGraph (from ELK) as an ASCII box-drawing string.
 *
 * @param {Object} positionedGraph - PositionedGraph from runLayout()
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
