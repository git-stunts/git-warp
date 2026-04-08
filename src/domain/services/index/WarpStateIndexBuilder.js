/**
 * WarpStateIndexBuilder - Builds bitmap index from materialized WARP state.
 *
 * This builder creates adjacency indexes from WarpStateV5.edgeAlive OR-Set,
 * NOT from Git commit DAG topology. This is the correct WARP architecture
 * as specified in TECH-SPEC-V7.md Task 6.
 *
 * The index supports O(1) neighbor lookups by node ID.
 *
 * @module domain/services/index/WarpStateIndexBuilder
 */

import BitmapIndexBuilder from './BitmapIndexBuilder.js';
import { orsetContains, orsetElements } from '../../crdt/ORSet.js';
import { decodeEdgeKey } from '../KeyCodec.js';

/**
 * Returns true if the value is null or undefined.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNullish(value) {
  return value === null || value === undefined;
}

/**
 * Validates that the given state is a valid WarpStateV5 with nodeAlive and edgeAlive fields.
 *
 * @param {unknown} state
 * @throws {Error} If state is null, undefined, or missing required fields
 */
function validateWarpState(state) {
  if (isNullish(state)) {
    throw new Error('Invalid state: must be a valid WarpStateV5 object');
  }
  const s = /** @type {Record<string, unknown>} */ (state);
  if (isNullish(/** @type {{ nodeAlive?: unknown, edgeAlive?: unknown }} */ (s).nodeAlive) || isNullish(/** @type {{ nodeAlive?: unknown, edgeAlive?: unknown }} */ (s).edgeAlive)) {
    throw new Error('Invalid state: must be a valid WarpStateV5 object');
  }
}

/**
 * Builds a bitmap index from materialized WARP state.
 *
 * This is the V7-compliant index builder that operates on logical graph edges
 * from the edgeAlive OR-Set, not Git commit parents.
 *
 * @example
 * import WarpStateIndexBuilder from './WarpStateIndexBuilder.js';
 *
 * const state = await graph.materialize();
 * const builder = new WarpStateIndexBuilder();
 * const indexData = builder.buildFromState(state);
 */
export default class WarpStateIndexBuilder {
  /**
   * Creates a new WarpStateIndexBuilder.
   * @param {{ crypto?: import('../../../ports/CryptoPort.ts').default }} [options] - Configuration
   */
  constructor(options = undefined) {
    const { crypto } = options || {};
    /** @type {BitmapIndexBuilder} */
    this._builder = new BitmapIndexBuilder(crypto !== undefined ? { crypto } : {});
  }

  /**
   * Builds an index from materialized WARP state.
   *
   * Iterates over edgeAlive OR-Set and creates forward/reverse adjacency
   * bitmaps for each node. Only includes edges where both endpoints are
   * visible (exist in nodeAlive).
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state - The materialized state
   * @returns {{builder: BitmapIndexBuilder, stats: {nodes: number, edges: number}}} The populated builder and stats
   * @throws {Error} If state is null or missing nodeAlive/edgeAlive fields
   *
   * @example
   * const state = await graph.materialize();
   * const { builder, stats } = new WarpStateIndexBuilder().buildFromState(state);
   * console.log(`Indexed ${stats.nodes} nodes, ${stats.edges} edges`);
   * const indexTree = await builder.serialize();
   */
  buildFromState(state) {
    validateWarpState(state);

    const nodeCount = this._registerNodes(state);
    const edgeCount = this._indexEdges(state);

    return {
      builder: this._builder,
      stats: { nodes: nodeCount, edges: edgeCount },
    };
  }

  /**
   * Registers all visible nodes from the state's nodeAlive OR-Set.
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @returns {number} Number of nodes registered
   * @private
   */
  _registerNodes(state) {
    let count = 0;
    for (const nodeId of orsetElements(state.nodeAlive)) {
      this._builder.registerNode(nodeId);
      count++;
    }
    return count;
  }

  /**
   * Indexes edges where both endpoints are visible in nodeAlive.
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @returns {number} Number of edges indexed
   * @private
   */
  _indexEdges(state) {
    let count = 0;
    for (const edgeKey of orsetElements(state.edgeAlive)) {
      const { from, to } = decodeEdgeKey(edgeKey);
      if (orsetContains(state.nodeAlive, from) && orsetContains(state.nodeAlive, to)) {
        this._builder.addEdge(from, to);
        count++;
      }
    }
    return count;
  }

  /**
   * Serializes the index to a tree structure of buffers.
   *
   * @returns {Promise<Record<string, Uint8Array>>} Map of path → serialized content
   */
  async serialize() {
    return await this._builder.serialize();
  }

  /**
   * Gets the underlying BitmapIndexBuilder.
   *
   * @returns {BitmapIndexBuilder}
   */
  get builder() {
    return this._builder;
  }
}

/**
 * Convenience function to build and serialize a WARP state index.
 *
 * @param {import('../JoinReducer.js').WarpStateV5} state - The materialized state
 * @param {{ crypto?: import('../../../ports/CryptoPort.ts').default }} [options] - Configuration
 * @returns {Promise<{tree: Record<string, Uint8Array>, stats: {nodes: number, edges: number}}>} Serialized index and stats
 *
 * @example
 * import { buildWarpStateIndex } from './WarpStateIndexBuilder.js';
 *
 * const state = await graph.materialize();
 * const { tree, stats } = await buildWarpStateIndex(state);
 */
export async function buildWarpStateIndex(state, { crypto } = {}) {
  const indexBuilder = new WarpStateIndexBuilder(crypto !== undefined ? { crypto } : {});
  const { stats } = indexBuilder.buildFromState(state);
  const tree = await indexBuilder.serialize();
  return { tree, stats };
}
