/**
 * Orchestrator for incremental bitmap index updates.
 *
 * Reads the shards a PatchDiff touches through an `IndexShardTreePort`,
 * delegates node, edge, and property mutations to the focused updaters, and
 * returns the rewritten semantic shards. Shard encoding and decoding stay in
 * the adapter behind the port. Reuse one instance per linear state stream;
 * create a new instance to reset the adjacency cache.
 *
 * @module domain/services/index/IncrementalIndexUpdater
 */

import type ORSet from '../../crdt/ORSet.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import type WarpState from '../state/WarpState.ts';
import type IndexShardTreePort from '../../../ports/IndexShardTreePort.ts';
import computeShardKey from '../../utils/shardKey.ts';
import { decodeEdgeKey, encodeEdgeKey } from '../KeyCodec.ts';
import IndexNodeUpdater from './IndexNodeUpdater.ts';
import IndexEdgeUpdater from './IndexEdgeUpdater.ts';
import IndexPropertyUpdater from './IndexPropertyUpdater.ts';
import IndexShardWorkspace from './IndexShardWorkspace.ts';
import EdgeAdjacency from './EdgeAdjacency.ts';

/** Inputs for one incremental index update. */
export type DirtyShardRequest = {
  readonly diff: PatchDiff;
  readonly state: WarpState;
  readonly shards: IndexShardTreePort;
};

type EdgeRestore = {
  readonly workspace: IndexShardWorkspace;
  readonly readded: ReadonlySet<string>;
};

export default class IncrementalIndexUpdater {
  readonly #adjacencyCache = new WeakMap<ORSet, EdgeAdjacency>();
  readonly #nodeUpdater = new IndexNodeUpdater();
  readonly #edgeUpdater = new IndexEdgeUpdater();
  readonly #propertyUpdater = new IndexPropertyUpdater();

  /** Returns the semantic shards that the diff rewrites. */
  computeDirtyShards(request: DirtyShardRequest): IndexShard[] {
    const { diff, state, shards } = request;
    if (!touchesIndex(diff)) {
      return [];
    }
    const workspace = new IndexShardWorkspace(shards);
    const readded = this.#applyNodeChanges(diff, workspace);
    this.#applyEdgeChanges(request, workspace);
    this.#restoreReaddedEdges(request, { workspace, readded });
    const propertyShards = this.#propertyUpdater.computeDirtyPropertyShards({
      propsChanged: diff.propsChanged,
      nodesCleared: diff.nodesCleared,
      state,
    }, shards);
    return [...workspace.flush(), ...propertyShards];
  }

  /** Applies node adds and removes; returns the added nodes that already had a global ID. */
  #applyNodeChanges(diff: PatchDiff, workspace: IndexShardWorkspace): Set<string> {
    // Brand-new nodes cannot have pre-existing indexed edges to restore.
    const readded = new Set(diff.nodesAdded.filter(
      (nodeId) => this.#nodeUpdater.findGlobalId(workspace.meta(computeShardKey(nodeId)), nodeId) !== undefined,
    ));
    for (const nodeId of diff.nodesAdded) {
      const shardKey = computeShardKey(nodeId);
      this.#nodeUpdater.handleNodeAdd(nodeId, shardKey, workspace.meta(shardKey));
    }
    for (const nodeId of diff.nodesRemoved) {
      this.#nodeUpdater.handleNodeRemove(nodeId, workspace.meta(computeShardKey(nodeId)));
    }
    // Purge edge bitmaps for removed nodes (dangling edge elimination).
    for (const nodeId of diff.nodesRemoved) {
      this.#nodeUpdater.purgeNodeEdges(nodeId, workspace.edgeContext());
    }
    return readded;
  }

  #applyEdgeChanges({ diff, state }: DirtyShardRequest, workspace: IndexShardWorkspace): void {
    // Filter edgesAdded by endpoint alive-ness (matches edgeVisible).
    for (const edge of diff.edgesAdded) {
      if (endpointsAlive(state, edge)) {
        workspace.ensureLabel(edge.label);
        this.#edgeUpdater.handleEdgeAdd(edge, workspace.edgeContext());
      }
    }
    for (const edge of diff.edgesRemoved) {
      this.#edgeUpdater.handleEdgeRemove(edge, workspace.edgeContext());
    }
  }

  /** Re-indexes the alive edges of re-added nodes that the diff does not add itself. */
  #restoreReaddedEdges(request: DirtyShardRequest, restore: EdgeRestore): void {
    const adjacency = this.#syncAdjacency(request, restore.readded);
    if (adjacency === null) {
      return;
    }
    const diffEdges = new Set(request.diff.edgesAdded.map((edge) => encodeEdgeKey(edge.from, edge.to, edge.label)));
    for (const edgeKey of adjacency.incidentTo(restore.readded)) {
      const edge = decodeEdgeKey(edgeKey);
      if (endpointsAlive(request.state, edge) && !diffEdges.has(encodeEdgeKey(edge.from, edge.to, edge.label))) {
        restore.workspace.ensureLabel(edge.label);
        this.#edgeUpdater.handleEdgeAdd(edge, restore.workspace.edgeContext());
      }
    }
  }

  /**
   * Returns the alive-edge adjacency, kept in sync for every diff once built.
   * Builds it only when a node is re-added; returns null while it is not needed.
   */
  #syncAdjacency({ diff, state }: DirtyShardRequest, readded: ReadonlySet<string>): EdgeAdjacency | null {
    const cached = this.#adjacencyCache.get(state.edgeAlive);
    if (cached !== undefined) {
      cached.applyDiff(state.edgeAlive, diff);
      return cached;
    }
    if (readded.size === 0) {
      return null;
    }
    const adjacency = EdgeAdjacency.fromAliveEdges(state.edgeAlive);
    this.#adjacencyCache.set(state.edgeAlive, adjacency);
    return adjacency;
  }
}

function touchesIndex(diff: PatchDiff): boolean {
  return [
    diff.nodesAdded, diff.nodesRemoved, diff.edgesAdded,
    diff.edgesRemoved, diff.propsChanged, diff.nodesCleared,
  ].some((entries) => entries.length > 0);
}

function endpointsAlive(state: WarpState, edge: { readonly from: string; readonly to: string }): boolean {
  return state.nodeAlive.contains(edge.from) && state.nodeAlive.contains(edge.to);
}
