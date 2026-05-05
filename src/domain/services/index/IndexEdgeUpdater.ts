/**
 * Index edge operations for incremental bitmap index updates.
 *
 * Handles edge add/remove against mutable EdgeShardData caches,
 * managing per-label and "all" bucket bitmaps. Stateless — all
 * state is owned by the IncrementalIndexUpdater orchestrator.
 *
 * @module domain/services/index/IndexEdgeUpdater
 */

import computeShardKey from '../../utils/shardKey.ts';
import toBytes from '../../utils/toBytes.ts';
import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import type { WorkingMetaShard, EdgeShardData } from './types.ts';
import type { EdgeDiffEntry } from '../../types/PatchDiff.ts';

/** Shared context passed from the orchestrator to edge operations. */
export type EdgeUpdateContext = {
  readonly labels: Record<string, number>;
  readonly getOrLoadMeta: (shardKey: string) => WorkingMetaShard;
  readonly fwdCache: Map<string, EdgeShardData>;
  readonly revCache: Map<string, EdgeShardData>;
  readonly getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData;
};

/**
 * Handles edge-level index mutations: add, remove, bitmap maintenance.
 */
export default class IndexEdgeUpdater {
  /**
   * Adds forward and reverse bitmap entries for a new edge.
   *
   * Both "all" and per-label buckets are updated in the forward
   * shard (keyed by `from`) and reverse shard (keyed by `to`).
   */
  handleEdgeAdd(edge: EdgeDiffEntry, ctx: EdgeUpdateContext): void {
    const fromMeta = ctx.getOrLoadMeta(computeShardKey(edge.from));
    const toMeta = ctx.getOrLoadMeta(computeShardKey(edge.to));
    const fromGid = fromMeta.nodeToGlobalMap.get(edge.from);
    const toGid = toMeta.nodeToGlobalMap.get(edge.to);
    if (fromGid === undefined || toGid === undefined) {
      return;
    }

    const labelId = String(ctx.labels[edge.label]);
    const fromShard = computeShardKey(edge.from);
    const toShard = computeShardKey(edge.to);

    this._addToEdgeBitmap(ctx.fwdCache, { shardKey: fromShard, bucket: 'all', owner: fromGid, target: toGid, dir: 'fwd' }, ctx.getOrLoadEdgeShard);
    this._addToEdgeBitmap(ctx.fwdCache, { shardKey: fromShard, bucket: labelId, owner: fromGid, target: toGid, dir: 'fwd' }, ctx.getOrLoadEdgeShard);
    this._addToEdgeBitmap(ctx.revCache, { shardKey: toShard, bucket: 'all', owner: toGid, target: fromGid, dir: 'rev' }, ctx.getOrLoadEdgeShard);
    this._addToEdgeBitmap(ctx.revCache, { shardKey: toShard, bucket: labelId, owner: toGid, target: fromGid, dir: 'rev' }, ctx.getOrLoadEdgeShard);
  }

  /**
   * Removes forward and reverse bitmap entries for a deleted edge.
   *
   * Removes from the per-label bucket, then recomputes the "all"
   * bucket by OR-ing remaining per-label bitmaps.
   */
  handleEdgeRemove(edge: EdgeDiffEntry, ctx: EdgeUpdateContext): void {
    const fromMeta = ctx.getOrLoadMeta(computeShardKey(edge.from));
    const toMeta = ctx.getOrLoadMeta(computeShardKey(edge.to));
    const fromGid = fromMeta.nodeToGlobalMap.get(edge.from);
    const toGid = toMeta.nodeToGlobalMap.get(edge.to);
    if (fromGid === undefined || toGid === undefined) {
      return;
    }

    if (ctx.labels[edge.label] === undefined) {
      return;
    }

    const labelId = String(ctx.labels[edge.label]);
    const fromShard = computeShardKey(edge.from);
    const toShard = computeShardKey(edge.to);

    this._removeFromEdgeBitmap(ctx.fwdCache, { shardKey: fromShard, bucket: labelId, owner: fromGid, target: toGid, dir: 'fwd' }, ctx.getOrLoadEdgeShard);
    this._removeFromEdgeBitmap(ctx.revCache, { shardKey: toShard, bucket: labelId, owner: toGid, target: fromGid, dir: 'rev' }, ctx.getOrLoadEdgeShard);

    this._recomputeAllBucket({
      cache: ctx.fwdCache, shardKey: fromShard, owner: fromGid,
      labels: ctx.labels, getOrLoadEdgeShard: ctx.getOrLoadEdgeShard, dir: 'fwd',
    });
    this._recomputeAllBucket({
      cache: ctx.revCache, shardKey: toShard, owner: toGid,
      labels: ctx.labels, getOrLoadEdgeShard: ctx.getOrLoadEdgeShard, dir: 'rev',
    });
  }

  /**
   * Deserializes a bitmap from edge shard data, or creates a new one.
   */
  deserializeBitmap(data: EdgeShardData, bucket: string, ownerStr: string): RoaringBitmapSubset {
    const RoaringBitmap32 = getRoaringBitmap32();
    if (data[bucket] && data[bucket][ownerStr]) {
      return RoaringBitmap32.deserialize(
        toBytes(data[bucket][ownerStr]),
        true,
      );
    }
    return new RoaringBitmap32();
  }

  /**
   * Adds a target globalId to an edge bitmap entry for the given owner.
   */
  private _addToEdgeBitmap(
    cache: Map<string, EdgeShardData>,
    opts: { shardKey: string; bucket: string; owner: number; target: number; dir: string },
    getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData,
  ): void {
    const { shardKey, bucket, owner, target, dir } = opts;
    const data = getOrLoadEdgeShard(cache, dir, shardKey);
    const bm = this.deserializeBitmap(data, bucket, String(owner));
    bm.add(target);
    if (!data[bucket]) { data[bucket] = {}; }
    data[bucket][String(owner)] = bm.serialize(true);
  }

  /**
   * Removes a target globalId from an edge bitmap entry for the given owner.
   */
  private _removeFromEdgeBitmap(
    cache: Map<string, EdgeShardData>,
    opts: { shardKey: string; bucket: string; owner: number; target: number; dir: string },
    getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData,
  ): void {
    const { shardKey, bucket, owner, target, dir } = opts;
    const data = getOrLoadEdgeShard(cache, dir, shardKey);
    const bm = this.deserializeBitmap(data, bucket, String(owner));
    bm.remove(target);
    if (!data[bucket]) { data[bucket] = {}; }
    data[bucket][String(owner)] = bm.serialize(true);
  }

  /**
   * Recomputes the "all" bucket for a given owner by OR-ing all per-label bitmaps.
   */
  private _recomputeAllBucket(opts: {
    cache: Map<string, EdgeShardData>;
    shardKey: string;
    owner: number;
    labels: Record<string, number>;
    getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData;
    dir: string;
  }): void {
    const { cache, shardKey, owner, labels, getOrLoadEdgeShard, dir } = opts;
    const data = getOrLoadEdgeShard(cache, dir, shardKey);
    const RoaringBitmap32 = getRoaringBitmap32();
    const merged = new RoaringBitmap32();
    const ownerStr = String(owner);

    for (const labelId of Object.values(labels)) {
      const bucket = String(labelId);
      if (data[bucket] && data[bucket][ownerStr]) {
        const bm = RoaringBitmap32.deserialize(
          toBytes(data[bucket][ownerStr]),
          true,
        );
        merged.orInPlace(bm);
      }
    }

    if (!data['all']) { data['all'] = {}; }
    data['all'][ownerStr] = merged.serialize(true);
  }
}
