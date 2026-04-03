/**
 * NeighborProvider backed by bitmap indexes.
 *
 * Two modes:
 * 1. **Commit DAG** (`indexReader`): Wraps BitmapIndexReader for parent/child
 *    relationships. Edges use label = '' (empty string sentinel).
 * 2. **Logical graph** (`logicalIndex`): Wraps CBOR-based logical bitmap index
 *    with labeled edges, per-label bitmap filtering, and alive bitmap checks.
 *
 * @module domain/services/index/BitmapNeighborProvider
 */

import NeighborProviderPort from '../../../ports/NeighborProviderPort.js';

/** @typedef {import('./BitmapIndexReader.js').default} BitmapIndexReader */

/**
 * @typedef {Object} LogicalIndex
 * @property {(nodeId: string) => number|undefined} getGlobalId
 * @property {(nodeId: string) => boolean} isAlive
 * @property {(globalId: number) => string|undefined} getNodeId
 * @property {(nodeId: string, direction: string, labelIds?: number[]) => Array<{neighborId: string, label: string}>} getEdges
 * @property {() => Map<string, number>} getLabelRegistry
 */

/**
 * Sorts edges by (neighborId, label) using strict codepoint comparison.
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @returns {Array<{neighborId: string, label: string}>}
 */
function sortEdges(edges) {
  return edges.sort((a, b) => {
    if (a.neighborId < b.neighborId) { return -1; }
    if (a.neighborId > b.neighborId) { return 1; }
    if (a.label < b.label) { return -1; }
    if (a.label > b.label) { return 1; }
    return 0;
  });
}

/**
 * Deduplicates a sorted edge list by (neighborId, label).
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @returns {Array<{neighborId: string, label: string}>}
 */
function dedupSorted(edges) {
  if (edges.length <= 1) { return edges; }
  const first = edges[0];
  if (first === undefined || first === null) { return edges; }
  const result = [first];
  for (let i = 1; i < edges.length; i++) {
    const prev = result[result.length - 1];
    const curr = edges[i];
    if (prev !== undefined && prev !== null && curr !== undefined && curr !== null && (curr.neighborId !== prev.neighborId || curr.label !== prev.label)) {
      result.push(curr);
    }
  }
  return result;
}

export default class BitmapNeighborProvider extends NeighborProviderPort {
  /**
   * Creates a BitmapNeighborProvider with optional DAG or logical index.
   *
   * @param {{ indexReader?: BitmapIndexReader, logicalIndex?: LogicalIndex }} [params]
   */
  constructor(params = undefined) {
    const { indexReader, logicalIndex } = params || {};
    super();
    this._reader = indexReader ?? null;
    this._logical = logicalIndex ?? null;
  }

  /**
   * Validates that at least one index backend is configured.
   *
   * @throws {Error} If neither indexReader nor logicalIndex is configured.
   */
  _assertReady() {
    if (!this._reader && !this._logical) {
      throw new Error('BitmapNeighborProvider requires either indexReader or logicalIndex');
    }
  }

  /**
   * Returns neighbor edges for the given node, delegating to the active index.
   *
   * @param {string} nodeId
   * @param {import('../../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   */
  async getNeighbors(nodeId, direction, options) {
    this._assertReady();
    if (this._logical) {
      return this._getLogicalNeighbors(nodeId, direction, options);
    }
    return await this._getDagNeighbors(nodeId, direction, options);
  }

  /**
   * Checks whether a node exists in the index.
   *
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  async hasNode(nodeId) {
    this._assertReady();
    if (this._logical) {
      return this._logical.isAlive(nodeId);
    }
    if (this._reader) {
      const id = await this._reader.lookupId(nodeId);
      return id !== undefined;
    }
    return false;
  }

  /**
   * Returns the latency class for this provider.
   *
   * @returns {'async-local'}
   */
  get latencyClass() {
    return 'async-local';
  }

  // ── Commit DAG mode ─────────────────────────────────────────────────

  /**
   * Fetches neighbors from the commit DAG index for a single direction.
   *
   * @param {BitmapIndexReader} reader - The DAG index reader
   * @param {string} nodeId - The node to query
   * @param {'out' | 'in'} dir - Direction to query
   * @returns {Promise<import('../../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   * @private
   */
  async _getDagSingleDirection(reader, nodeId, dir) {
    const shas = dir === 'out'
      ? await reader.getChildren(nodeId)
      : await reader.getParents(nodeId);
    return sortEdges(shas.map((id) => ({ neighborId: id, label: '' })));
  }

  /**
   * Checks whether DAG label filtering excludes all results.
   *
   * @param {import('../../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {boolean} True if the empty-string label is filtered out
   * @private
   */
  _dagLabelsExcluded(options) {
    return options?.labels !== undefined && options?.labels !== null && !options.labels.has('');
  }

  /**
   * Returns neighbors via the commit DAG bitmap index.
   *
   * @param {string} nodeId
   * @param {import('../../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   * @private
   */
  async _getDagNeighbors(nodeId, direction, options) {
    if (!this._reader) { return []; }
    if (this._dagLabelsExcluded(options)) { return []; }

    if (direction === 'out' || direction === 'in') {
      return await this._getDagSingleDirection(this._reader, nodeId, direction);
    }

    return await this._getDagBothDirections(this._reader, nodeId);
  }

  /**
   * Fetches neighbors in both directions from the DAG and merges them.
   *
   * @param {BitmapIndexReader} reader - The DAG index reader
   * @param {string} nodeId - The node to query
   * @returns {Promise<import('../../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   * @private
   */
  async _getDagBothDirections(reader, nodeId) {
    const [children, parents] = await Promise.all([
      reader.getChildren(nodeId),
      reader.getParents(nodeId),
    ]);
    const all = children.map((id) => ({ neighborId: id, label: '' }))
      .concat(parents.map((id) => ({ neighborId: id, label: '' })));
    return dedupSorted(sortEdges(all));
  }

  // ── Logical graph mode ──────────────────────────────────────────────

  /**
   * Resolves label names to numeric label IDs from the logical index registry.
   *
   * @param {LogicalIndex} logical - The logical index
   * @param {Set<string>} labels - Label names to resolve
   * @returns {number[] | undefined} Array of label IDs, or undefined if no filter
   * @private
   */
  _resolveLabelIds(logical, labels) {
    const registry = logical.getLabelRegistry();
    /** @type {number[]} */
    const ids = [];
    for (const label of labels) {
      const id = registry.get(label);
      if (id !== undefined) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Returns neighbors via the CBOR-based logical bitmap index.
   *
   * @param {string} nodeId
   * @param {import('../../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {import('../../../ports/NeighborProviderPort.js').NeighborEdge[]}
   * @private
   */
  _getLogicalNeighbors(nodeId, direction, options) {
    const logical = /** @type {LogicalIndex} */ (this._logical);

    /** @type {number[]|undefined} */
    let labelIds;
    if (options?.labels) {
      labelIds = this._resolveLabelIds(logical, options.labels);
      if (labelIds === undefined || labelIds.length === 0) { return []; }
    }

    if (direction === 'both') {
      const outEdges = logical.getEdges(nodeId, 'out', labelIds);
      const inEdges = logical.getEdges(nodeId, 'in', labelIds);
      return dedupSorted(sortEdges([...outEdges, ...inEdges]));
    }

    return sortEdges(logical.getEdges(nodeId, direction, labelIds));
  }
}
