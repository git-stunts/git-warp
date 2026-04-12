/**
 * WarpStateIndexBuilder - Builds bitmap index from materialized WARP state.
 *
 * This builder creates adjacency indexes from WarpState.edgeAlive OR-Set,
 * NOT from Git commit DAG topology. This is the correct WARP architecture
 * as specified in TECH-SPEC-V7.md Task 6.
 *
 * The index supports O(1) neighbor lookups by node ID.
 *
 * @module domain/services/index/WarpStateIndexBuilder
 */

import BitmapIndexBuilder from './BitmapIndexBuilder.ts';
import { decodeEdgeKey } from '../KeyCodec.ts';
import IndexError from '../../errors/IndexError.ts';
import type WarpState from '../state/WarpState.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';

function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function validateWarpState(state: unknown): asserts state is WarpState {
  if (isNullish(state)) {
    throw new IndexError(
      'Invalid state: must be a valid WarpState object',
      { code: 'E_INDEX_INVALID_STATE' },
    );
  }
  const s = state as Record<string, unknown>;
  if (isNullish(s['nodeAlive']) || isNullish(s['edgeAlive'])) {
    throw new IndexError(
      'Invalid state: must be a valid WarpState object',
      { code: 'E_INDEX_INVALID_STATE' },
    );
  }
}

/**
 * Builds a bitmap index from materialized WARP state.
 *
 * This is the V7-compliant index builder that operates on logical graph edges
 * from the edgeAlive OR-Set, not Git commit parents.
 *
 * @example
 * const state = await graph.materialize();
 * const builder = new WarpStateIndexBuilder();
 * const indexData = builder.buildFromState(state);
 */
export default class WarpStateIndexBuilder {
  private readonly _builder: BitmapIndexBuilder;

  constructor(_options?: { crypto?: CryptoPort }) {
    this._builder = new BitmapIndexBuilder();
  }

  /**
   * Builds an index from materialized WARP state.
   *
   * Iterates over edgeAlive OR-Set and creates forward/reverse adjacency
   * bitmaps for each node. Only includes edges where both endpoints are
   * visible (exist in nodeAlive).
   *
   * @returns The populated builder and stats
   * @throws {IndexError} If state is null or missing nodeAlive/edgeAlive fields
   */
  buildFromState(state: unknown): { builder: BitmapIndexBuilder; stats: { nodes: number; edges: number } } {
    validateWarpState(state);

    const nodeCount = this._registerNodes(state);
    const edgeCount = this._indexEdges(state);

    return {
      builder: this._builder,
      stats: { nodes: nodeCount, edges: edgeCount },
    };
  }

  private _registerNodes(state: WarpState): number {
    let count = 0;
    for (const nodeId of state.nodeAlive.elements()) {
      this._builder.registerNode(nodeId);
      count++;
    }
    return count;
  }

  private _indexEdges(state: WarpState): number {
    let count = 0;
    for (const edgeKey of state.edgeAlive.elements()) {
      const { from, to } = decodeEdgeKey(edgeKey) as { from: string; to: string };
      if (state.nodeAlive.contains(from) && state.nodeAlive.contains(to)) {
        this._builder.addEdge(from, to);
        count++;
      }
    }
    return count;
  }

  /**
   * Serializes the index to a tree structure of buffers.
   */
  serialize(): Record<string, Uint8Array> {
    return this._builder.serialize();
  }

  /**
   * Gets the underlying BitmapIndexBuilder.
   */
  get builder(): BitmapIndexBuilder {
    return this._builder;
  }
}

/**
 * Convenience function to build and serialize a WARP state index.
 */
export function buildWarpStateIndex(
  state: unknown,
  options?: { crypto?: CryptoPort },
): { tree: Record<string, Uint8Array>; stats: { nodes: number; edges: number } } {
  const indexBuilder = new WarpStateIndexBuilder(options !== undefined ? options : {});
  const { stats } = indexBuilder.buildFromState(state);
  const tree = indexBuilder.serialize();
  return { tree, stats };
}
