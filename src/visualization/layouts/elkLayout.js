/**
 * ELK layout runner: lazy-loads elkjs and executes layout.
 *
 * The ELK engine (~2.5 MB) is loaded via dynamic import() only when
 * a layout is actually requested, keeping normal CLI startup fast.
 */

let elkInstance = null;

/**
 * Returns (or creates) a singleton ELK instance.
 * @returns {Promise<Object>} ELK instance
 */
async function getElk() {
  if (!elkInstance) {
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
    elkInstance = new ELK();
  }
  return elkInstance;
}

/**
 * Runs ELK layout on a graph and returns a PositionedGraph.
 *
 * @param {Object} elkGraph - ELK-format graph from toElkGraph()
 * @returns {Promise<Object>} PositionedGraph
 */
export async function runLayout(elkGraph) {
  try {
    const elk = await getElk();
    const result = await elk.layout(elkGraph);
    return toPositionedGraph(result);
  } catch {
    return fallbackLayout(elkGraph);
  }
}

/**
 * Converts ELK output to a PositionedGraph.
 */
function toPositionedGraph(result) {
  const nodes = (result.children ?? []).map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? 80,
    height: c.height ?? 40,
    label: c.labels?.[0]?.text ?? c.id,
  }));

  const edges = (result.edges ?? []).map((e) => ({
    id: e.id,
    source: e.sources?.[0] ?? '',
    target: e.targets?.[0] ?? '',
    label: e.labels?.[0]?.text,
    sections: e.sections ?? [],
  }));

  return {
    nodes,
    edges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}

/**
 * Fallback: line nodes up horizontally when ELK fails.
 */
function fallbackLayout(elkGraph) {
  let x = 20;
  const nodes = (elkGraph.children ?? []).map((c) => {
    const node = {
      id: c.id,
      x,
      y: 20,
      width: c.width ?? 80,
      height: c.height ?? 40,
      label: c.labels?.[0]?.text ?? c.id,
    };
    x += (c.width ?? 80) + 40;
    return node;
  });

  const edges = (elkGraph.edges ?? []).map((e) => ({
    id: e.id,
    source: e.sources?.[0] ?? '',
    target: e.targets?.[0] ?? '',
    label: e.labels?.[0]?.text,
    sections: [],
  }));

  const totalWidth = x;
  return { nodes, edges, width: totalWidth, height: 80 };
}
