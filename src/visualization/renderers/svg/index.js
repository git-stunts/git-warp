/**
 * SVG renderer: generates an SVG string from a PositionedGraph.
 *
 * No jsdom or D3 dependency — pure string templating.
 */

const PADDING = 40;

const PALETTE = {
  bg: '#1e1e2e',
  nodeFill: '#313244',
  nodeStroke: '#89b4fa',
  nodeText: '#cdd6f4',
  edgeStroke: '#a6adc8',
  edgeLabel: '#bac2de',
  arrowFill: '#a6adc8',
};

/**
 * Escapes special XML characters for safe embedding in SVG markup.
 *
 * @param {string} str @returns {string}
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders the SVG defs block containing the arrowhead marker.
 *
 * @returns {string} SVG defs markup
 */
function renderDefs() {
  return [
    '<defs>',
    '  <marker id="arrowhead" markerWidth="10" markerHeight="7"',
    `    refX="10" refY="3.5" orient="auto" fill="${PALETTE.arrowFill}">`,
    '    <polygon points="0 0, 10 3.5, 0 7"/>',
    '  </marker>',
    '</defs>',
  ].join('\n');
}

/**
 * Renders the SVG style block with node and edge styling.
 *
 * @returns {string} SVG style markup
 */
function renderStyle() {
  return [
    '<style>',
    `  .node rect { fill: ${PALETTE.nodeFill}; stroke: ${PALETTE.nodeStroke}; stroke-width: 2; rx: 6; }`,
    `  .node text { fill: ${PALETTE.nodeText}; font-family: monospace; font-size: 13px; dominant-baseline: central; text-anchor: middle; }`,
    `  .edge polyline { fill: none; stroke: ${PALETTE.edgeStroke}; stroke-width: 1.5; marker-end: url(#arrowhead); }`,
    `  .edge-label { fill: ${PALETTE.edgeLabel}; font-family: monospace; font-size: 11px; text-anchor: middle; }`,
    '</style>',
  ].join('\n');
}

/**
 * Renders a single graph node as an SVG group with a rect and centered label.
 *
 * @param {{ id: string, x: number, y: number, width: number, height: number, label?: string }} node @returns {string}
 */
function renderNode(node) {
  const { x, y, width, height } = node;
  const label = escapeXml(node.label ?? node.id);
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    `<g class="node">`,
    `  <rect x="${x}" y="${y}" width="${width}" height="${height}"/>`,
    `  <text x="${cx}" y="${cy}">${label}</text>`,
    '</g>',
  ].join('\n');
}

/**
 * Extracts ordered coordinate points from an ELK edge section.
 *
 * @param {{ startPoint?: { x: number, y: number }, bendPoints?: Array<{ x: number, y: number }>, endPoint?: { x: number, y: number } }} section @returns {Array<{ x: number, y: number }>}
 */
function sectionToPoints(section) {
  const pts = [];
  if (section.startPoint) {
    pts.push(section.startPoint);
  }
  if (section.bendPoints) {
    pts.push(...section.bendPoints);
  }
  if (section.endPoint) {
    pts.push(section.endPoint);
  }
  return pts;
}

/**
 * Collects all coordinate points from an edge's sections into a flat array.
 *
 * @param {Array<{ startPoint?: { x: number, y: number }, bendPoints?: Array<{ x: number, y: number }>, endPoint?: { x: number, y: number } }>} sections
 * @returns {Array<{ x: number, y: number }>}
 */
function collectEdgePoints(sections) {
  const allPoints = [];
  for (const s of sections) {
    allPoints.push(...sectionToPoints(s));
  }
  return allPoints;
}

/**
 * Renders an optional label positioned at the midpoint of an edge path.
 *
 * @param {string|undefined} label
 * @param {Array<{ x: number, y: number }>} allPoints
 * @returns {string} SVG text element or empty string
 */
function renderEdgeLabel(label, allPoints) {
  if (typeof label !== 'string' || label.length === 0) {
    return '';
  }
  const midIdx = Math.floor((allPoints.length - 1) / 2);
  const a = allPoints[midIdx];
  const b = allPoints[Math.min(midIdx + 1, allPoints.length - 1)];
  if (a === undefined || b === undefined) { return ''; }
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return `  <text class="edge-label" x="${midX}" y="${midY - 6}">${escapeXml(label)}</text>`;
}

/**
 * Renders an edge as an SVG polyline with an optional label.
 *
 * @param {{ sections?: Array<{ startPoint?: { x: number, y: number }, bendPoints?: Array<{ x: number, y: number }>, endPoint?: { x: number, y: number } }>, label?: string }} edge @returns {string}
 */
function renderEdge(edge) {
  const { sections } = edge;
  if (!Array.isArray(sections) || sections.length === 0) {
    return '';
  }

  const allPoints = collectEdgePoints(sections);
  if (allPoints.length < 2) {
    return '';
  }

  const pointsStr = allPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const labelMarkup = renderEdgeLabel(edge.label, allPoints);
  const parts = ['<g class="edge">', `  <polyline points="${pointsStr}"/>`];
  if (labelMarkup.length > 0) {
    parts.push(labelMarkup);
  }
  parts.push('</g>');
  return parts.join('\n');
}

/**
 * Renders all edges, filtering out empty results.
 *
 * @param {Array<{ sections?: Array<{ startPoint?: { x: number, y: number }, endPoint?: { x: number, y: number }, bendPoints?: Array<{ x: number, y: number }> }>, label?: string }>} edges
 * @returns {string[]} Array of SVG edge markup strings
 */
function renderAllEdges(edges) {
  const result = [];
  for (const edge of edges) {
    const rendered = renderEdge(edge);
    if (rendered.length > 0) {
      result.push(rendered);
    }
  }
  return result;
}

/**
 * Renders the inner content of the SVG (background, defs, styled nodes/edges).
 *
 * @param {Array<{ id: string, x: number, y: number, width: number, height: number, label?: string }>} nodes
 * @param {Array<{ sections?: Array<{ startPoint?: { x: number, y: number }, endPoint?: { x: number, y: number }, bendPoints?: Array<{ x: number, y: number }> }>, label?: string }>} edges
 * @param {{ title?: string }} options
 * @returns {string[]} Array of SVG markup lines
 */
function renderSvgBody(nodes, edges, options) {
  const parts = [];
  if (typeof options.title === 'string' && options.title.length > 0) {
    parts.push(`<title>${escapeXml(options.title)}</title>`);
  }
  parts.push(`<rect width="100%" height="100%" fill="${PALETTE.bg}"/>`);
  parts.push(renderDefs());
  parts.push(renderStyle());
  parts.push(`<g transform="translate(${PADDING},${PADDING})">`);
  parts.push(...renderAllEdges(edges));
  parts.push(...nodes.map(renderNode));
  parts.push('</g>');
  return parts;
}

/**
 * Renders a PositionedGraph as an SVG string.
 *
 * @param {{ nodes?: Array<{ id: string, x: number, y: number, width: number, height: number, label?: string }>, edges?: Array<{ sections?: Array<{ startPoint?: { x: number, y: number }, endPoint?: { x: number, y: number }, bendPoints?: Array<{ x: number, y: number }> }>, label?: string }>, width?: number, height?: number }} positionedGraph - PositionedGraph from runLayout()
 * @param {{ title?: string }} [options]
 * @returns {string} Complete SVG markup
 */
export function renderSvg(positionedGraph, options = {}) {
  const nodes = positionedGraph.nodes ?? [];
  const edges = positionedGraph.edges ?? [];
  const dims = computeSvgDimensions(positionedGraph);
  const header = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}">`;
  return [header, ...renderSvgBody(nodes, edges, options), '</svg>'].join('\n');
}

/** @type {number} */
const DEFAULT_WIDTH = 400;
/** @type {number} */
const DEFAULT_HEIGHT = 300;

/**
 * Computes the total SVG canvas dimensions including padding.
 *
 * @param {{ width?: number, height?: number }} graph
 * @returns {{ w: number, h: number }}
 */
function computeSvgDimensions(graph) {
  return {
    w: (graph.width ?? DEFAULT_WIDTH) + PADDING * 2,
    h: (graph.height ?? DEFAULT_HEIGHT) + PADDING * 2,
  };
}
