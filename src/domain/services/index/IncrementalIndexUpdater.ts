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
    this.#applyNodeChanges(request, workspace);
    this.#applyEdgeChanges(request, workspace);
    this.#restoreIncidentEdges(request, workspace);
    const propertyShards = this.#propertyUpdater.computeDirtyPropertyShards({
      propsChanged: diff.propsChanged,
      nodesCleared: diff.nodesCleared,
      state,
    }, shards);
    return [...workspace.flush(), ...propertyShards];
  }

  /**
   * Applies node adds and removes. A diff records every transition of every
   * op, so one patch that removes a node and adds it again lists the node in
   * both lists; the node is removed only when it is dead after the patch.
   */
  #applyNodeChanges({ diff, state }: DirtyShardRequest, workspace: IndexShardWorkspace): void {
    for (const nodeId of diff.nodesAdded) {
      const shardKey = computeShardKey(nodeId);
      this.#nodeUpdater.handleNodeAdd(nodeId, shardKey, workspace.meta(shardKey));
    }
    const removed = diff.nodesRemoved.filter((nodeId) => !state.nodeAlive.contains(nodeId));
    for (const nodeId of removed) {
      this.#nodeUpdater.handleNodeRemove(nodeId, workspace.meta(computeShardKey(nodeId)));
    }
    // Purge edge bitmaps for removed nodes (dangling edge elimination).
    for (const nodeId of removed) {
      this.#nodeUpdater.purgeNodeEdges(nodeId, workspace.edgeContext());
    }
  }

  /** Applies edge adds and removes; like a node, an edge is removed only when it is dead after the patch. */
  #applyEdgeChanges({ diff, state }: DirtyShardRequest, workspace: IndexShardWorkspace): void {
    // Filter edgesAdded by endpoint alive-ness (matches edgeVisible).
    for (const edge of diff.edgesAdded) {
      if (endpointsAlive(state, edge)) {
        workspace.ensureLabel(edge.label);
        this.#edgeUpdater.handleEdgeAdd(edge, workspace.edgeContext());
      }
    }
    for (const edge of diff.edgesRemoved) {
      if (!state.edgeAlive.contains(encodeEdgeKey(edge.from, edge.to, edge.label))) {
        this.#edgeUpdater.handleEdgeRemove(edge, workspace.edgeContext());
      }
    }
  }

  /**
   * Indexes the alive edges of added nodes that the diff does not add itself.
   *
   * Every added node can have such edges. A re-added node's edges were purged
   * when it was removed. A node added for the first time can be the endpoint
   * of an edge that a patch added before any patch added the node, because
   * adding an edge does not require its endpoints to exist; that edge was not
   * indexed while the node was not alive.
   */
  #restoreIncidentEdges(request: DirtyShardRequest, workspace: IndexShardWorkspace): void {
    const added = new Set(request.diff.nodesAdded);
    const adjacency = this.#syncAdjacency(request, added);
    if (adjacency === null) {
      return;
    }
    const diffEdges = new Set(request.diff.edgesAdded.map((edge) => encodeEdgeKey(edge.from, edge.to, edge.label)));
    for (const edgeKey of adjacency.incidentTo(added)) {
      const edge = decodeEdgeKey(edgeKey);
      if (endpointsAlive(request.state, edge) && !diffEdges.has(encodeEdgeKey(edge.from, edge.to, edge.label))) {
        workspace.ensureLabel(edge.label);
        this.#edgeUpdater.handleEdgeAdd(edge, workspace.edgeContext());
      }
    }
  }

  /**
   * Returns the alive-edge adjacency, kept in sync for every diff once built.
   * Builds it only when a node is added; returns null while it is not needed.
   */
  #syncAdjacency({ diff, state }: DirtyShardRequest, added: ReadonlySet<string>): EdgeAdjacency | null {
    const cached = this.#adjacencyCache.get(state.edgeAlive);
    if (cached !== undefined) {
      cached.applyDiff(state.edgeAlive, diff);
      return cached;
    }
    if (added.size === 0) {
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
