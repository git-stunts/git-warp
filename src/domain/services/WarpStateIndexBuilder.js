/**
 * WarpStateIndexBuilder - Builds bitmap index from materialized WARP state.
 *
 * This builder creates adjacency indexes from WarpStateV5.edgeAlive OR-Set,
 * NOT from Git commit DAG topology. This is the correct WARP architecture
 * as specified in TECH-SPEC-V7.md Task 6.
 *
 * The index supports O(1) neighbor lookups by node ID.
 *
 * @module domain/services/WarpStateIndexBuilder
 */

import BitmapIndexBuilder from './BitmapIndexBuilder.js';
import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey } from './JoinReducer.js';

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
   */
  constructor() {
    /** @type {BitmapIndexBuilder} */
    this._builder = new BitmapIndexBuilder();
  }

  /**
   * Builds an index from materialized WARP state.
   *
   * Iterates over edgeAlive OR-Set and creates forward/reverse adjacency
   * bitmaps for each node. Only includes edges where both endpoints are
   * visible (exist in nodeAlive).
   *
   * @param {import('./JoinReducer.js').WarpStateV5} state - The materialized state
   * @returns {{builder: BitmapIndexBuilder, stats: {nodes: number, edges: number}}} The populated builder and stats
   *
   * @example
   * const state = await graph.materialize();
   * const { builder, stats } = new WarpStateIndexBuilder().buildFromState(state);
   * console.log(`Indexed ${stats.nodes} nodes, ${stats.edges} edges`);
   * const indexTree = builder.serialize();
   */
  buildFromState(state) {
    if (!state || !state.nodeAlive || !state.edgeAlive) {
      throw new Error('Invalid state: must be a valid WarpStateV5 object');
    }

    let nodeCount = 0;
    let edgeCount = 0;

    // Register all visible nodes
    for (const nodeId of orsetElements(state.nodeAlive)) {
      this._builder.registerNode(nodeId);
      nodeCount++;
    }

    // Add edges where both endpoints are visible
    for (const edgeKey of orsetElements(state.edgeAlive)) {
      const { from, to } = decodeEdgeKey(edgeKey);

      // Only index edges where both endpoints exist in nodeAlive
      if (orsetContains(state.nodeAlive, from) && orsetContains(state.nodeAlive, to)) {
        this._builder.addEdge(from, to);
        edgeCount++;
      }
    }

    return {
      builder: this._builder,
      stats: { nodes: nodeCount, edges: edgeCount },
    };
  }

  /**
   * Serializes the index to a tree structure of buffers.
   *
   * @returns {Record<string, Buffer>} Map of path → serialized content
   */
  serialize() {
    return this._builder.serialize();
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
 * @param {import('./JoinReducer.js').WarpStateV5} state - The materialized state
 * @returns {{tree: Record<string, Buffer>, stats: {nodes: number, edges: number}}} Serialized index and stats
 *
 * @example
 * import { buildWarpStateIndex } from './WarpStateIndexBuilder.js';
 *
 * const state = await graph.materialize();
 * const { tree, stats } = buildWarpStateIndex(state);
 */
export function buildWarpStateIndex(state) {
  const indexBuilder = new WarpStateIndexBuilder();
  const { stats } = indexBuilder.buildFromState(state);
  const tree = indexBuilder.serialize();
  return { tree, stats };
}
