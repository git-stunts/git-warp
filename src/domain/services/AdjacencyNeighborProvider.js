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
  /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
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
 * @typedef {Object} MergeState
 * @property {Array<{neighborId: string, label: string}>} result - Output array
 * @property {Array<{neighborId: string, label: string}>} a - First sorted list
 * @property {Array<{neighborId: string, label: string}>} b - Second sorted list
 * @property {number} i - Current index in list a
 * @property {number} j - Current index in list b
 */

/**
 * Appends a merge comparison result to the output and advances cursors.
 *
 * @param {MergeState} state - Mutable merge state
 */
function mergeStep(state) {
  const cmp = edgeCmp(state.a[state.i], state.b[state.j]);
  if (cmp < 0) {
    state.result.push(state.a[state.i++]);
  } else if (cmp > 0) {
    state.result.push(state.b[state.j++]);
  } else {
    state.result.push(state.a[state.i++]);
    state.j++;
  }
}

/**
 * Merges two pre-sorted edge lists, deduplicating by (neighborId, label).
 *
 * @param {Array<{neighborId: string, label: string}>} a
 * @param {Array<{neighborId: string, label: string}>} b
 * @returns {Array<{neighborId: string, label: string}>}
 */
function mergeSorted(a, b) {
  /** @type {MergeState} */
  const state = { result: [], a, b, i: 0, j: 0 };
  while (state.i < a.length && state.j < b.length) {
    mergeStep(state);
  }
  while (state.i < a.length) { state.result.push(a[state.i++]); }
  while (state.j < b.length) { state.result.push(b[state.j++]); }
  return state.result;
}

export default class AdjacencyNeighborProvider extends NeighborProviderPort {
  /**
   * Creates an AdjacencyNeighborProvider from pre-built adjacency maps.
   *
   * @param {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>, aliveNodes: Set<string> }} params
   */
  constructor({ outgoing, incoming, aliveNodes }) {
    super();
    if (aliveNodes === null || aliveNodes === undefined) {
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
   * Fetches edges for a single direction with optional label filtering.
   *
   * @param {string} nodeId - The node to query
   * @param {'out' | 'in'} dir - Direction
   * @param {Set<string>|undefined} labels - Optional label filter
   * @returns {Array<{neighborId: string, label: string}>} Filtered edges
   * @private
   */
  _edgesForDirection(nodeId, dir, labels) {
    const map = dir === 'out' ? this._outgoing : this._incoming;
    return filterByLabels(map.get(nodeId) || [], labels);
  }

  /**
   * Returns neighbor edges for the given node, filtered by direction and labels.
   *
   * @param {string} nodeId
   * @param {import('../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   */
  getNeighbors(nodeId, direction, options) {
    const labels = options?.labels;
    if (direction === 'out' || direction === 'in') {
      return Promise.resolve(this._edgesForDirection(nodeId, direction, labels));
    }
    return Promise.resolve(mergeSorted(
      this._edgesForDirection(nodeId, 'out', labels),
      this._edgesForDirection(nodeId, 'in', labels),
    ));
  }

  /**
   * Checks whether a node is in the alive set.
   *
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  hasNode(nodeId) {
    return Promise.resolve(this._aliveNodes.has(nodeId));
  }

  /**
   * Returns the latency class for this synchronous provider.
   *
   * @returns {'sync'}
   */
  get latencyClass() {
    return 'sync';
  }
}
