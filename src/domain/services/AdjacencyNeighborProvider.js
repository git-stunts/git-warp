/**
 * NeighborProvider backed by in-memory adjacency maps.
 *
 * Wraps the { outgoing, incoming } Maps produced by _buildAdjacency().
 * Adjacency lists are pre-sorted at construction by (neighborId, label)
 * using strict codepoint comparison. Label filtering via Set.has() in-memory.
 *
 * @module domain/services/AdjacencyNeighborProvider
 */

import NeighborProviderPort from '../../ports/NeighborProviderPort.js';

/**
 * Comparator for (neighborId, label) sorting.
 * Strict codepoint comparison — never localeCompare.
 *
 * @param {{ neighborId: string, label: string }} a
 * @param {{ neighborId: string, label: string }} b
 * @returns {number}
 */
function edgeCmp(a, b) {
  if (a.neighborId < b.neighborId) { return -1; }
  if (a.neighborId > b.neighborId) { return 1; }
  if (a.label < b.label) { return -1; }
  if (a.label > b.label) { return 1; }
  return 0;
}

/**
 * Pre-sorts all adjacency lists and freezes the result.
 *
 * @param {Map<string, Array<{neighborId: string, label: string}>>} adjMap
 * @returns {Map<string, Array<{neighborId: string, label: string}>>}
 */
function sortAdjacencyMap(adjMap) {
  const result = new Map();
  for (const [nodeId, edges] of adjMap) {
    const sorted = edges.slice().sort(edgeCmp);
    result.set(nodeId, sorted);
  }
  return result;
}

/**
 * Filters an edge list by a label set. Returns the original array when
 * no filter is provided.
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @param {Set<string>|undefined} labels
 * @returns {Array<{neighborId: string, label: string}>}
 */
function filterByLabels(edges, labels) {
  if (!labels) {
    return edges;
  }
  return edges.filter((e) => labels.has(e.label));
}

/**
 * Merges two pre-sorted edge lists, deduplicating by (neighborId, label).
 *
 * @param {Array<{neighborId: string, label: string}>} a
 * @param {Array<{neighborId: string, label: string}>} b
 * @returns {Array<{neighborId: string, label: string}>}
 */
function mergeSorted(a, b) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ai = a[i];
    const bj = b[j];
    if (ai === undefined || ai === null || bj === undefined || bj === null) { break; }
    const cmp = edgeCmp(ai, bj);
    if (cmp < 0) {
      result.push(ai);
      i++;
    } else if (cmp > 0) {
      result.push(bj);
      j++;
    } else {
      // Duplicate — take one, skip both
      result.push(ai);
      i++;
      j++;
    }
  }
  while (i < a.length) {
    const ai = a[i];
    if (ai !== undefined && ai !== null) { result.push(ai); }
    i++;
  }
  while (j < b.length) {
    const bj = b[j];
    if (bj !== undefined && bj !== null) { result.push(bj); }
    j++;
  }
  return result;
}

export default class AdjacencyNeighborProvider extends NeighborProviderPort {
  /**
   * @param {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>, aliveNodes: Set<string> }} params
   */
  constructor({ outgoing, incoming, aliveNodes }) {
    super();
    if (!aliveNodes) {
      throw new Error('AdjacencyNeighborProvider: aliveNodes is required');
    }
    /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
    this._outgoing = sortAdjacencyMap(outgoing);
    /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
    this._incoming = sortAdjacencyMap(incoming);
    /** @type {Set<string>} */
    this._aliveNodes = aliveNodes;
  }

  /**
   * @param {string} nodeId
   * @param {import('../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   */
  getNeighbors(nodeId, direction, options) {
    const labels = options?.labels;
    const outEdges = filterByLabels(this._outgoing.get(nodeId) || [], labels);
    const inEdges = filterByLabels(this._incoming.get(nodeId) || [], labels);

    if (direction === 'out') {
      return Promise.resolve(outEdges);
    }
    if (direction === 'in') {
      return Promise.resolve(inEdges);
    }
    // 'both': merge two pre-sorted lists, dedup by (neighborId, label)
    return Promise.resolve(mergeSorted(outEdges, inEdges));
  }

  /**
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  hasNode(nodeId) {
    return Promise.resolve(this._aliveNodes.has(nodeId));
  }

  /** @returns {'sync'} */
  get latencyClass() {
    return 'sync';
  }
}
