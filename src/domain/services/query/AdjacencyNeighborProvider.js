/**
 * NeighborProvider backed by in-memory adjacency maps.
 *
 * Wraps the { outgoing, incoming } Maps produced by _buildAdjacency().
 * Adjacency lists are pre-sorted at construction by (neighborId, label)
 * using strict codepoint comparison. Label filtering via Set.has() in-memory.
 *
 * @module domain/services/query/AdjacencyNeighborProvider
 */

import NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';

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
  if (labels === undefined) {
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
  /** @type {Array<{neighborId: string, label: string}>} */
  const result = [];
  const state = { i: 0, j: 0 };
  /** @type {MergeContext} */
  const ctx = { result, a, b, state };
  while (state.i < a.length && state.j < b.length) {
    mergeNextPair(ctx);
  }
  for (let k = state.i; k < a.length; k++) { result.push(/** @type {{neighborId: string, label: string}} */ (a[k])); }
  for (let k = state.j; k < b.length; k++) { result.push(/** @type {{neighborId: string, label: string}} */ (b[k])); }
  return result;
}

/**
 * @typedef {{result: Array<{neighborId: string, label: string}>, a: Array<{neighborId: string, label: string}>, b: Array<{neighborId: string, label: string}>, state: {i: number, j: number}}} MergeContext
 */

/**
 * Compares the current elements from both lists and pushes the winner,
 * advancing the appropriate cursor(s).
 * @param {MergeContext} ctx - Merge context with result, inputs, and cursors
 */
function mergeNextPair(ctx) {
  const ai = /** @type {{neighborId: string, label: string}} */ (ctx.a[ctx.state.i]);
  const bj = /** @type {{neighborId: string, label: string}} */ (ctx.b[ctx.state.j]);
  const cmp = edgeCmp(ai, bj);
  ctx.result.push(cmp <= 0 ? ai : bj);
  if (cmp <= 0) { ctx.state.i++; }
  if (cmp >= 0) { ctx.state.j++; }
}

export default class AdjacencyNeighborProvider extends NeighborProviderPort {
  /**
   * Creates an adjacency-backed neighbor provider from pre-built maps.
   * @param {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>, aliveNodes: Set<string> }} params
   */
  constructor({ outgoing, incoming, aliveNodes }) {
    super();
    if (aliveNodes === undefined || aliveNodes === null) {
      throw new QueryError(
        'AdjacencyNeighborProvider: aliveNodes is required',
        { code: 'E_ADJACENCY_NO_ALIVE_NODES' },
      );
    }
    /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
    this._outgoing = sortAdjacencyMap(outgoing);
    /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
    this._incoming = sortAdjacencyMap(incoming);
    /** @type {Set<string>} */
    this._aliveNodes = aliveNodes;
  }

  /**
   * Returns neighbor edges for a node in the given direction, optionally filtered by label.
   * @param {string} nodeId
   * @param {import('../../../ports/NeighborProviderPort.ts').Direction} direction
   * @param {import('../../../ports/NeighborProviderPort.ts').NeighborOptions} [options]
   * @returns {Promise<import('../../../ports/NeighborProviderPort.ts').NeighborEdge[]>}
   */
  getNeighbors(nodeId, direction, options) {
    const labels = options?.labels;
    return Promise.resolve(this._resolveEdges(nodeId, direction, labels));
  }

  /**
   * Fetches and filters edges from a single adjacency map.
   * @param {Map<string, Array<{neighborId: string, label: string}>>} adjMap - The adjacency map
   * @param {string} nodeId - Node to look up
   * @param {Set<string>|undefined} labels - Optional label filter
   * @returns {Array<{neighborId: string, label: string}>}
   * @private
   */
  _filteredEdges(adjMap, nodeId, labels) {
    return filterByLabels(adjMap.get(nodeId) ?? [], labels);
  }

  /**
   * Synchronously resolves neighbor edges for a node.
   * @param {string} nodeId - Node to look up
   * @param {import('../../../ports/NeighborProviderPort.ts').Direction} direction - Edge direction
   * @param {Set<string>|undefined} labels - Optional label filter
   * @returns {Array<{neighborId: string, label: string}>}
   * @private
   */
  _resolveEdges(nodeId, direction, labels) {
    if (direction === 'out') {
      return this._filteredEdges(this._outgoing, nodeId, labels);
    }
    if (direction === 'in') {
      return this._filteredEdges(this._incoming, nodeId, labels);
    }
    return mergeSorted(
      this._filteredEdges(this._outgoing, nodeId, labels),
      this._filteredEdges(this._incoming, nodeId, labels),
    );
  }

  /**
   * Checks whether a node exists in the alive set.
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  hasNode(nodeId) {
    return Promise.resolve(this._aliveNodes.has(nodeId));
  }

  /** Indicates synchronous in-memory access. @returns {'sync'} */
  get latencyClass() {
    return 'sync';
  }
}
