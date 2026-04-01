/**
 * ELK adapter: converts normalised graph data into ELK JSON input.
 */

/**
 * @typedef {{ id: string, label: string, props?: Record<string, unknown> }} GraphDataNode
 * @typedef {{ from: string, to: string, label?: string }} GraphDataEdge
 * @typedef {{ nodes: GraphDataNode[], edges: GraphDataEdge[] }} GraphData
 * @typedef {{ text: string }} ElkLabel
 * @typedef {{ id: string, sources: string[], targets: string[], labels?: ElkLabel[] }} ElkEdge
 * @typedef {{ id: string, width: number, height: number, labels: ElkLabel[] }} ElkChild
 * @typedef {{ id: string, layoutOptions: Record<string, string>, children: ElkChild[], edges: ElkEdge[] }} ElkGraph
 */

const LAYOUT_PRESETS = {
  query: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '30',
    'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  },
  path: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '30',
    'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  },
  slice: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '30',
    'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  },
};

const DEFAULT_PRESET = LAYOUT_PRESETS.query;

/**
 * Returns ELK layout options for a given visualisation type.
 *
 * @param {'query'|'path'|'slice'} type
 * @returns {Record<string, string>} ELK layout options
 */
export function getDefaultLayoutOptions(type) {
  return LAYOUT_PRESETS[type] ?? DEFAULT_PRESET;
}

/**
 * Estimates pixel width for a node label.
 * Approximates monospace glyph width at ~9px with 24px padding.
 * @param {string | undefined} label
 * @returns {number}
 */
function estimateNodeWidth(label) {
  const charWidth = 9;
  const padding = 24;
  const minWidth = 80;
  return Math.max((label?.length ?? 0) * charWidth + padding, minWidth);
}

const NODE_HEIGHT = 30;

/**
 * Builds a single ELK edge from a graph data edge.
 *
 * @param {GraphDataEdge} e - Source edge
 * @param {number} i - Edge index (used for ID generation)
 * @returns {ElkEdge} ELK-format edge
 */
function buildElkEdge(e, i) {
  /** @type {ElkEdge} */
  const edge = {
    id: `e${i}`,
    sources: [e.from],
    targets: [e.to],
  };
  if (e.label !== undefined && e.label !== '') {
    edge.labels = [{ text: e.label }];
  }
  return edge;
}

/**
 * Converts a graph data node into an ELK child node.
 *
 * @param {GraphDataNode} n - Source node
 * @returns {ElkChild} ELK-format child node
 */
function buildElkChild(n) {
  return {
    id: n.id,
    width: estimateNodeWidth(n.label),
    height: NODE_HEIGHT,
    labels: [{ text: n.label ?? n.id }],
  };
}

/**
 * Converts normalised graph data to an ELK graph JSON object.
 *
 * @param {GraphData} graphData
 * @param {{ type?: 'query'|'path'|'slice', layoutOptions?: Record<string, string> }} [options]
 * @returns {ElkGraph} ELK-format graph
 */
export function toElkGraph(graphData, options = {}) {
  const { type = 'query', layoutOptions } = options;
  const nodes = graphData.nodes ?? [];
  const rawEdges = graphData.edges ?? [];

  return {
    id: 'root',
    layoutOptions: resolveLayoutOptions(layoutOptions, type),
    children: nodes.map(buildElkChild),
    edges: rawEdges.map((e, i) => buildElkEdge(e, i)),
  };
}

/**
 * Resolves layout options, falling back to the preset for the given type.
 *
 * @param {Record<string, string>|undefined} explicit - Caller-provided options
 * @param {'query'|'path'|'slice'} type - Visualization type
 * @returns {Record<string, string>} Resolved layout options
 */
function resolveLayoutOptions(explicit, type) {
  if (explicit !== undefined) {
    return explicit;
  }
  return getDefaultLayoutOptions(type);
}
