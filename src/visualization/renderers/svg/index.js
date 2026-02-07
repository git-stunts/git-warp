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

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function renderEdge(edge) {
  const { sections } = edge;
  if (!sections || sections.length === 0) {
    return '';
  }

  const allPoints = [];
  for (const s of sections) {
    allPoints.push(...sectionToPoints(s));
  }

  if (allPoints.length < 2) {
    return '';
  }

  const pointsStr = allPoints
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  const lines = [
    '<g class="edge">',
    `  <polyline points="${pointsStr}"/>`,
  ];

  if (edge.label) {
    const mid = allPoints[Math.floor(allPoints.length / 2)];
    lines.push(
      `  <text class="edge-label" x="${mid.x}" y="${mid.y - 6}">${escapeXml(edge.label)}</text>`,
    );
  }

  lines.push('</g>');
  return lines.join('\n');
}

/**
 * Renders a PositionedGraph as an SVG string.
 *
 * @param {Object} positionedGraph - PositionedGraph from runLayout()
 * @param {{ title?: string }} [options]
 * @returns {string} Complete SVG markup
 */
export function renderSvg(positionedGraph, options = {}) {
  const { nodes = [], edges = [] } = positionedGraph;
  const w = (positionedGraph.width ?? 400) + PADDING * 2;
  const h = (positionedGraph.height ?? 300) + PADDING * 2;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
  ];

  if (options.title) {
    parts.push(`<title>${escapeXml(options.title)}</title>`);
  }

  parts.push(`<rect width="100%" height="100%" fill="${PALETTE.bg}"/>`);
  parts.push(renderDefs());
  parts.push(renderStyle());

  // Translate content to account for padding
  parts.push(`<g transform="translate(${PADDING},${PADDING})">`);

  // Edges first (behind nodes)
  for (const edge of edges) {
    const rendered = renderEdge(edge);
    if (rendered) {
      parts.push(rendered);
    }
  }

  // Nodes on top
  for (const node of nodes) {
    parts.push(renderNode(node));
  }

  parts.push('</g>');
  parts.push('</svg>');

  return parts.join('\n');
}
