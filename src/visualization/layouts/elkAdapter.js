/**
 * ELK adapter: converts normalised graph data into ELK JSON input.
 */

const LAYOUT_PRESETS = {
  query: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  },
  path: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  },
  slice: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  },
};

const DEFAULT_PRESET = LAYOUT_PRESETS.query;

/**
 * Returns ELK layout options for a given visualisation type.
 *
 * @param {'query'|'path'|'slice'} type
 * @returns {Object} ELK layout options
 */
export function getDefaultLayoutOptions(type) {
  return LAYOUT_PRESETS[type] ?? DEFAULT_PRESET;
}

/**
 * Estimates pixel width for a node label.
 * Approximates monospace glyph width at ~9px with 24px padding.
 */
function estimateNodeWidth(label) {
  const charWidth = 9;
  const padding = 24;
  const minWidth = 80;
  return Math.max((label?.length ?? 0) * charWidth + padding, minWidth);
}

const NODE_HEIGHT = 40;

/**
 * Converts normalised graph data to an ELK graph JSON object.
 *
 * @param {{ nodes: Array, edges: Array }} graphData
 * @param {{ type?: string, layoutOptions?: Object }} [options]
 * @returns {Object} ELK-format graph
 */
export function toElkGraph(graphData, options = {}) {
  const { type = 'query', layoutOptions } = options;

  const children = (graphData.nodes ?? []).map((n) => ({
    id: n.id,
    width: estimateNodeWidth(n.label),
    height: NODE_HEIGHT,
    labels: [{ text: n.label ?? n.id }],
  }));

  const edges = (graphData.edges ?? []).map((e, i) => {
    const edge = {
      id: `e${i}`,
      sources: [e.from],
      targets: [e.to],
    };
    if (e.label) {
      edge.labels = [{ text: e.label }];
    }
    return edge;
  });

  return {
    id: 'root',
    layoutOptions: layoutOptions ?? getDefaultLayoutOptions(type),
    children,
    edges,
  };
}
