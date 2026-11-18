/**
 * Pure helper functions and types for reading a logical bitmap index.
 *
 * Extracted from LogicalIndexReader to keep each file under 500 LOC
 * and to separate pure query/build logic from the stateful reader class.
 *
 * @module domain/services/index/logicalIndexHelpers
 */

import computeShardKey from '../../utils/shardKey.ts';
import type { RoaringBitmapSubset } from '../../utils/roaring.ts';
import type { NeighborEdge } from '../../../ports/NeighborProviderPort.ts';

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * Runtime interface for a fully-hydrated logical bitmap index.
 *
 * Produced by LogicalIndexReader.toLogicalIndex() and consumed by
 * BitmapNeighborProvider and MaterializedViewService.
 */
export interface LogicalIndex {
  getGlobalId(nodeId: string): number | undefined;
  getNodeId(globalId: number): string | undefined;
  getLabelRegistry(): Map<string, number>;
  isAlive(nodeId: string): boolean;
  getEdges(nodeId: string, direction: string, filterLabelIds?: number[]): NeighborEdge[];
}

/**
 * Decoded shard maps used internally to build a LogicalIndex.
 */
export interface IndexMaps {
  n2g: Map<string, number>;
  g2n: Map<number, string>;
  alive: Map<string, RoaringBitmapSubset>;
  lr: Map<string, number>;
  i2l: Map<number, string>;
  fwd: Map<string, RoaringBitmapSubset>;
  rev: Map<string, RoaringBitmapSubset>;
  byOwnerFwd: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>;
  byOwnerRev: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>;
}

// ── Shard classification ──────────────────────────────────────────────────────

/**
 * Returns true if the shard path represents a meta file (meta_XX.cbor).
 */
export function isMetaShard(path: string): boolean {
  return path.startsWith('meta_') && path.endsWith('.cbor');
}

/**
 * Returns true if the shard path represents an edge file (fwd_XX.cbor or rev_XX.cbor).
 */
export function isEdgeShard(path: string): boolean {
  return path.endsWith('.cbor') && (path.startsWith('fwd_') || path.startsWith('rev_'));
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Pushes the neighbours that a bitmap names into `out`, in ascending global
 * id order. The bitmap is never expanded into an array: when it names no
 * more ids than the index knows nodes, its values are iterated; otherwise
 * the known nodes are tested for membership. Memory therefore grows with
 * the smaller of the two, never with a bitmap's cardinality alone.
 */
function expandBitmap(
  bitmap: RoaringBitmapSubset,
  label: string,
  ctx: { g2n: Map<number, string>; out: NeighborEdge[] },
): void {
  for (const neighborGid of neighbourGlobalIds(bitmap, ctx.g2n)) {
    const neighborId = ctx.g2n.get(neighborGid);
    if (neighborId !== undefined) {
      ctx.out.push({ neighborId, label });
    }
  }
}

/** The known global ids that the bitmap holds, ascending, read from the smaller side. */
function neighbourGlobalIds(bitmap: RoaringBitmapSubset, g2n: Map<number, string>): Iterable<number> {
  if (bitmap.size <= g2n.size) {
    return bitmap;
  }
  const held: number[] = [];
  for (const globalId of g2n.keys()) {
    if (bitmap.has(globalId)) {
      held.push(globalId);
    }
  }
  return held.sort((left, right) => left - right);
}

/**
 * Resolves edges from a byOwner map for a given node (all labels).
 */
function resolveAllLabels(
  byOwner: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>,
  ctx: { gid: number; i2l: Map<number, string>; g2n: Map<number, string> },
): NeighborEdge[] {
  const { gid, i2l, g2n } = ctx;
  const entries = byOwner.get(gid);
  if (!entries) {
    return [];
  }
  const out: NeighborEdge[] = [];
  for (const { labelId, bitmap } of entries) {
    expandBitmap(bitmap, i2l.get(labelId) ?? '', { g2n, out });
  }
  return out;
}

/**
 * Resolves filtered edges for a specific node and direction.
 */
function resolveFilteredEdges(
  store: Map<string, RoaringBitmapSubset>,
  ctx: {
    gid: number;
    dir: string;
    filterLabelIds: number[];
    i2l: Map<number, string>;
    g2n: Map<number, string>;
  },
): NeighborEdge[] {
  const out: NeighborEdge[] = [];
  for (const labelId of ctx.filterLabelIds) {
    const bitmap = store.get(`${ctx.dir}:${labelId}:${ctx.gid}`);
    if (bitmap !== undefined) {
      expandBitmap(bitmap, ctx.i2l.get(labelId) ?? '', { g2n: ctx.g2n, out });
    }
  }
  return out;
}

/**
 * Selects the appropriate edge stores for the given direction.
 */
function selectEdgeStores(
  maps: IndexMaps,
  dir: string,
): {
  store: Map<string, RoaringBitmapSubset>;
  byOwner: Map<number, Array<{ labelId: number; bitmap: RoaringBitmapSubset }>>;
} {
  return {
    store: dir === 'fwd' ? maps.fwd : maps.rev,
    byOwner: dir === 'fwd' ? maps.byOwnerFwd : maps.byOwnerRev,
  };
}

/**
 * Resolves edges for a specific node and direction from index maps.
 */
export function resolveEdgesForNode(
  maps: IndexMaps,
  query: { nodeId: string; direction: 'in' | 'out'; filterLabelIds?: number[] },
): NeighborEdge[] {
  const gid = maps.n2g.get(query.nodeId);
  if (gid === undefined) {
    return [];
  }
  const dir = query.direction === 'out' ? 'fwd' : 'rev';
  const { store, byOwner } = selectEdgeStores(maps, dir);
  if (query.filterLabelIds === undefined || query.filterLabelIds === null) {
    return resolveAllLabels(byOwner, { gid, i2l: maps.i2l, g2n: maps.g2n });
  }
  return resolveFilteredEdges(store, { gid, dir, filterLabelIds: query.filterLabelIds, i2l: maps.i2l, g2n: maps.g2n });
}

/**
 * Checks whether a node is alive in the bitmap index.
 */
export function checkAlive(
  n2g: Map<string, number>,
  alive: Map<string, RoaringBitmapSubset>,
  nodeId: string,
): boolean {
  const gid = n2g.get(nodeId);
  if (gid === undefined) {
    return false;
  }
  const bitmap = alive.get(computeShardKey(nodeId));
  return bitmap !== undefined ? bitmap.has(gid) : false;
}

/**
 * Builds a LogicalIndex object from decoded shard maps.
 */
export function buildLogicalIndex(maps: IndexMaps): LogicalIndex {
  const { n2g, g2n, alive, lr } = maps;
  return {
    getGlobalId: (nodeId) => n2g.get(nodeId),
    getNodeId: (globalId) => g2n.get(globalId),
    getLabelRegistry: () => lr,
    isAlive: (nodeId) => checkAlive(n2g, alive, nodeId),
    getEdges(nodeId: string, direction: string, filterLabelIds?: number[]): NeighborEdge[] {
      const dir = direction as 'in' | 'out';
      return resolveEdgesForNode(
        maps,
        { nodeId, direction: dir, ...(filterLabelIds ? { filterLabelIds } : {}) },
      );
    },
  };
}
