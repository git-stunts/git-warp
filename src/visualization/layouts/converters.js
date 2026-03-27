/**
 * Data converters: transform WarpRuntime payloads into a normalized graph-data
 * intermediate format consumed by the ELK adapter.
 *
 * Intermediate format:
 *   { nodes: [{ id, label, props? }], edges: [{ from, to, label? }] }
 */

/**
 * @typedef {{ id: string, label: string, props?: Record<string, unknown> }} GraphDataNode
 * @typedef {{ from: string, to: string, label?: string }} GraphDataEdge
 * @typedef {{ nodes: GraphDataNode[], edges: GraphDataEdge[] }} GraphData
 */

/**
 * Converts a query result payload + edge array into graph data.
 * Edges are filtered to only those connecting matched nodes.
 *
 * @param {{ nodes?: Array<{ id: string, props?: Record<string, unknown> }> } | null} payload - Query result
 * @param {Array<{ from: string, to: string, label?: string }>}  edges   - Edge array from graph.getEdges()
 * @returns {GraphData}
 */
export function queryResultToGraphData(payload, edges) {
  const nodes = (payload?.nodes ?? []).map((n) => ({
    id: n.id,
    label: n.id,
    props: n.props,
  }));

  const nodeSet = new Set(nodes.map((n) => n.id));

  const filtered = (edges ?? [])
    .filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, label: e.label }));

  return { nodes, edges: filtered };
}

/**
 * Converts a path result payload into graph data.
 * Builds a linear chain of nodes with labelled edges.
 *
 * @param {{ path?: string[], edges?: string[] } | null} payload - Path result
 * @returns {GraphData}
 */
export function pathResultToGraphData(payload) {
  const pathArr = payload?.path ?? [];
  const edgeLabels = payload?.edges ?? [];

  const nodes = pathArr.map((id) => ({ id, label: id }));

  /** @type {GraphDataEdge[]} */
  const edges = [];
  for (let i = 0; i < pathArr.length - 1; i++) {
    edges.push({
      from: pathArr[i],
      to: pathArr[i + 1],
      label: edgeLabels[i],
    });
  }

  return { nodes, edges };
}

/**
 * Converts raw getNodes() + getEdges() output into graph data.
 *
 * @param {string[]} nodeIds - Array of node IDs
 * @param {Array<{ from: string, to: string, label?: string }>}    edges   - Edge array from graph.getEdges()
 * @returns {GraphData}
 */
export function rawGraphToGraphData(nodeIds, edges) {
  const nodes = (nodeIds ?? []).map((id) => ({ id, label: id }));

  const mapped = (edges ?? []).map((e) => ({
    from: e.from,
    to: e.to,
    label: e.label,
  }));

  return { nodes, edges: mapped };
}
