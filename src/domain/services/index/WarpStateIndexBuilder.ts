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
import WarpState from '../state/WarpState.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import StateSession from '../../orset/session/StateSession.ts';
import {
  collectAliveNodeIdsFromSession,
  collectVisibleEdgesFromSession,
} from '../state/SessionVisibleGraph.ts';

function validateWarpState(state: WarpState | null | undefined): WarpState {
  if (!(state instanceof WarpState)) {
    throw new IndexError(
      'Invalid state: must be a valid WarpState object',
      { code: 'E_INDEX_INVALID_STATE' },
    );
  }
  return state;
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
  buildFromState(state: WarpState | null | undefined): { builder: BitmapIndexBuilder; stats: { nodes: number; edges: number } } {
    const validState = validateWarpState(state);

    const nodeCount = this._registerNodes(validState);
    const edgeCount = this._indexEdges(validState);

    return {
      builder: this._builder,
      stats: { nodes: nodeCount, edges: edgeCount },
    };
  }

  async buildFromSession(
    session: StateSession,
  ): Promise<{ builder: BitmapIndexBuilder; stats: { nodes: number; edges: number } }> {
    const aliveNodes = await collectAliveNodeIdsFromSession(session);
    const visibleEdges = await collectVisibleEdgesFromSession(
      session,
      new Set(aliveNodes),
    );

    const nodeCount = this._registerNodeIds(aliveNodes);
    const edgeCount = this._indexVisibleEdges(visibleEdges);

    return {
      builder: this._builder,
      stats: { nodes: nodeCount, edges: edgeCount },
    };
  }

  private _registerNodes(state: WarpState): number {
    return this._registerNodeIds(state.nodeAlive.elements());
  }

  private _indexEdges(state: WarpState): number {
    const aliveNodes = state.nodeAlive.elements();
    const aliveNodeSet = new Set(aliveNodes);
    const visibleEdges: Array<{ from: string; to: string; label: string }> = [];
    for (const edgeKey of state.edgeAlive.elements()) {
      const edge = decodeEdgeKey(edgeKey);
      if (!aliveNodeSet.has(edge.from) || !aliveNodeSet.has(edge.to)) {
        continue;
      }
      visibleEdges.push(edge);
    }
    return this._indexVisibleEdges(visibleEdges);
  }

  private _registerNodeIds(nodeIds: Iterable<string>): number {
    let count = 0;
    for (const nodeId of nodeIds) {
      this._builder.registerNode(nodeId);
      count += 1;
    }
    return count;
  }

  private _indexVisibleEdges(
    edges: Iterable<{ readonly from: string; readonly to: string }>,
  ): number {
    let count = 0;
    for (const edge of edges) {
      this._builder.addEdge(edge.from, edge.to);
      count += 1;
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
  state: WarpState | null | undefined,
  options?: { crypto?: CryptoPort },
): { tree: Record<string, Uint8Array>; stats: { nodes: number; edges: number } } {
  const indexBuilder = new WarpStateIndexBuilder(options !== undefined ? options : {});
  const { stats } = indexBuilder.buildFromState(state);
  const tree = indexBuilder.serialize();
  return { tree, stats };
}

export async function buildWarpStateIndexFromSession(
  session: StateSession,
  options?: { crypto?: CryptoPort },
): Promise<{ tree: Record<string, Uint8Array>; stats: { nodes: number; edges: number } }> {
  const indexBuilder = new WarpStateIndexBuilder(options !== undefined ? options : {});
  const { stats } = await indexBuilder.buildFromSession(session);
  const tree = indexBuilder.serialize();
  return { tree, stats };
}
