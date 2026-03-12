/**
 * NeighborProvider backed by bitmap indexes.
 *
 * Two modes:
 * 1. **Commit DAG** (`indexReader`): Wraps BitmapIndexReader for parent/child
 *    relationships. Edges use label = '' (empty string sentinel).
 * 2. **Logical graph** (`logicalIndex`): Wraps CBOR-based logical bitmap index
 *    with labeled edges, per-label bitmap filtering, and alive bitmap checks.
 *
 * @module domain/services/BitmapNeighborProvider
 */

import NeighborProviderPort from '../../ports/NeighborProviderPort.js';

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
  const result = [edges[0]];
  for (let i = 1; i < edges.length; i++) {
    const prev = result[result.length - 1];
    if (edges[i].neighborId !== prev.neighborId || edges[i].label !== prev.label) {
      result.push(edges[i]);
    }
  }
  return result;
}

export default class BitmapNeighborProvider extends NeighborProviderPort {
  /**
   * @param {{ indexReader?: BitmapIndexReader, logicalIndex?: LogicalIndex }} [params]
   */
  constructor(params = undefined) {
    const { indexReader, logicalIndex } = params || {};
    super();
    this._reader = indexReader ?? null;
    this._logical = logicalIndex ?? null;
  }

  /** @throws {Error} If neither indexReader nor logicalIndex is configured. */
  _assertReady() {
    if (!this._reader && !this._logical) {
      throw new Error('BitmapNeighborProvider requires either indexReader or logicalIndex');
    }
  }

  /**
   * @param {string} nodeId
   * @param {import('../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   */
  async getNeighbors(nodeId, direction, options) {
    this._assertReady();
    if (this._logical) {
      return this._getLogicalNeighbors(nodeId, direction, options);
    }
    return await this._getDagNeighbors(nodeId, direction, options);
  }

  /**
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

  /** @returns {'async-local'} */
  get latencyClass() {
    return 'async-local';
  }

  // ── Commit DAG mode ─────────────────────────────────────────────────

  /**
   * @param {string} nodeId
   * @param {import('../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   * @private
   */
  async _getDagNeighbors(nodeId, direction, options) {
    if (!this._reader) { return []; }

    if (options?.labels) {
      if (!options.labels.has('')) { return []; }
    }

    if (direction === 'out') {
      const children = await this._reader.getChildren(nodeId);
      return sortEdges(children.map((id) => ({ neighborId: id, label: '' })));
    }

    if (direction === 'in') {
      const parents = await this._reader.getParents(nodeId);
      return sortEdges(parents.map((id) => ({ neighborId: id, label: '' })));
    }

    const [children, parents] = await Promise.all([
      this._reader.getChildren(nodeId),
      this._reader.getParents(nodeId),
    ]);
    const all = children.map((id) => ({ neighborId: id, label: '' }))
      .concat(parents.map((id) => ({ neighborId: id, label: '' })));
    return dedupSorted(sortEdges(all));
  }

  // ── Logical graph mode ──────────────────────────────────────────────

  /**
   * @param {string} nodeId
   * @param {import('../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {import('../../ports/NeighborProviderPort.js').NeighborEdge[]}
   * @private
   */
  _getLogicalNeighbors(nodeId, direction, options) {
    const logical = /** @type {LogicalIndex} */ (this._logical);

    // Resolve label filter to labelIds
    /** @type {number[]|undefined} */
    let labelIds;
    if (options?.labels) {
      const registry = logical.getLabelRegistry();
      labelIds = [];
      for (const label of options.labels) {
        const id = registry.get(label);
        if (id !== undefined) {
          labelIds.push(id);
        }
      }
      if (labelIds.length === 0) { return []; }
    }

    if (direction === 'both') {
      const outEdges = logical.getEdges(nodeId, 'out', labelIds);
      const inEdges = logical.getEdges(nodeId, 'in', labelIds);
      return dedupSorted(sortEdges([...outEdges, ...inEdges]));
    }

    return sortEdges(logical.getEdges(nodeId, direction, labelIds));
  }
}
