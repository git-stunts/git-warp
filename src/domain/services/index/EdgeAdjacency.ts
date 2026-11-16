/**
 * Node-to-incident-edge adjacency over the alive edge set.
 *
 * The incremental index updater uses it to find the alive edges of a node
 * that is re-added, so it can restore their bitmaps. Build it once from the
 * alive edges, then keep it in sync by applying each later diff.
 *
 * @module domain/services/index/EdgeAdjacency
 */

import type ORSet from '../../crdt/ORSet.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import { decodeEdgeKey, encodeEdgeKey } from '../KeyCodec.ts';

/** Mutable adjacency index: node ID to the keys of its incident alive edges. */
export default class EdgeAdjacency {
  readonly #incident = new Map<string, Set<string>>();

  /** Builds the adjacency of every alive edge. */
  static fromAliveEdges(edgeAlive: ORSet): EdgeAdjacency {
    const adjacency = new EdgeAdjacency();
    for (const edgeKey of edgeAlive.elements()) {
      adjacency.#add(edgeKey);
    }
    return adjacency;
  }

  /** Applies a diff whose effects `edgeAlive` already contains. */
  applyDiff(edgeAlive: ORSet, diff: PatchDiff): void {
    for (const edge of diff.edgesAdded) {
      const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
      if (edgeAlive.contains(edgeKey)) {
        this.#add(edgeKey);
      }
    }
    for (const edge of diff.edgesRemoved) {
      const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
      if (!edgeAlive.contains(edgeKey)) {
        this.#remove(edgeKey);
      }
    }
  }

  /** Returns the keys of the alive edges incident to any of the nodes. */
  incidentTo(nodeIds: Iterable<string>): Set<string> {
    const keys = new Set<string>();
    for (const nodeId of nodeIds) {
      for (const edgeKey of this.#incident.get(nodeId) ?? []) {
        keys.add(edgeKey);
      }
    }
    return keys;
  }

  #add(edgeKey: string): void {
    const { from, to } = decodeEdgeKey(edgeKey);
    for (const nodeId of [from, to]) {
      let keys = this.#incident.get(nodeId);
      if (keys === undefined) {
        keys = new Set();
        this.#incident.set(nodeId, keys);
      }
      keys.add(edgeKey);
    }
  }

  #remove(edgeKey: string): void {
    const { from, to } = decodeEdgeKey(edgeKey);
    for (const nodeId of [from, to]) {
      const keys = this.#incident.get(nodeId);
      keys?.delete(edgeKey);
      if (keys?.size === 0) {
        this.#incident.delete(nodeId);
      }
    }
  }
}
