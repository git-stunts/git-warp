/**
 * Index node operations for incremental bitmap index updates.
 *
 * Handles node add/remove/purge against mutable WorkingMetaShard
 * and EdgeShardData caches. Stateless — all state is owned by
 * the IncrementalIndexUpdater orchestrator.
 *
 * @module domain/services/index/IndexNodeUpdater
 */

import computeShardKey from '../../utils/shardKey.ts';
import toBytes from '../../utils/toBytes.ts';
import { getRoaringBitmap32 } from '../../utils/roaring.ts';
import { ShardIdOverflowError } from '../../errors/index.ts';
import type { WorkingMetaShard, EdgeShardData } from './types.ts';

/** Maximum local IDs per shard (2^24). */
const MAX_LOCAL_ID = 1 << 24;

/** Context for purging edge bitmaps of a dead node. */
export type PurgeContext = {
  readonly fwdCache: Map<string, EdgeShardData>;
  readonly revCache: Map<string, EdgeShardData>;
  readonly getOrLoadMeta: (shardKey: string) => WorkingMetaShard;
  readonly getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData;
};

/**
 * Handles node-level index mutations: add, remove, and edge purge.
 */
export default class IndexNodeUpdater {
  /**
   * Allocates or reactivates a globalId for a node and sets the alive bit.
   *
   * If the node already has a globalId (re-add), the existing ID is reused
   * and the alive bit is set. Otherwise a new globalId is allocated.
   *
   * @throws {ShardIdOverflowError} If the shard exceeds 2^24 local IDs.
   */
  handleNodeAdd(
    nodeId: string,
    shardKey: string,
    meta: WorkingMetaShard,
  ): void {
    const existing = meta.nodeToGlobalMap.get(nodeId);
    if (existing !== undefined) {
      meta.aliveBitmap.add(existing);
      return;
    }
    if (meta.nextLocalId >= MAX_LOCAL_ID) {
      throw new ShardIdOverflowError(
        `Shard ${shardKey} exceeded 2^24 local IDs`,
        { shardKey, nextLocalId: meta.nextLocalId },
      );
    }
    const shardByte = parseInt(shardKey, 16);
    const globalId = ((shardByte << 24) | meta.nextLocalId) >>> 0;
    meta.nextLocalId++;
    meta.nodeToGlobal.push([nodeId, globalId]);
    meta.globalToNode.set(globalId, nodeId);
    meta.nodeToGlobalMap.set(nodeId, globalId);
    meta.aliveBitmap.add(globalId);
  }

  /**
   * Clears the alive bit for a node but keeps its globalId stable.
   */
  handleNodeRemove(nodeId: string, meta: WorkingMetaShard): void {
    const gid = meta.nodeToGlobalMap.get(nodeId);
    if (gid !== undefined) {
      meta.aliveBitmap.remove(gid);
    }
  }

  /**
   * Purges all edge bitmap entries that reference a removed node.
   *
   * When a node is removed, edges touching it become invisible even if
   * the edge itself is alive in the ORSet. Scans forward and reverse
   * shards, zeroing the dead node's bitmaps and removing it from peers.
   */
  purgeNodeEdges(deadNodeId: string, ctx: PurgeContext): void {
    const deadMeta = ctx.getOrLoadMeta(computeShardKey(deadNodeId));
    const deadGid = deadMeta.nodeToGlobalMap.get(deadNodeId);
    if (deadGid === undefined) {
      return;
    }

    const shardKey = computeShardKey(deadNodeId);

    this._purgeDirection(deadGid, shardKey, {
      primaryCache: ctx.fwdCache, peerCache: ctx.revCache,
      primaryDir: 'fwd', peerDir: 'rev',
      getOrLoadMeta: ctx.getOrLoadMeta, getOrLoadEdgeShard: ctx.getOrLoadEdgeShard,
    });

    this._purgeDirection(deadGid, shardKey, {
      primaryCache: ctx.revCache, peerCache: ctx.fwdCache,
      primaryDir: 'rev', peerDir: 'fwd',
      getOrLoadMeta: ctx.getOrLoadMeta, getOrLoadEdgeShard: ctx.getOrLoadEdgeShard,
    });
  }

  /**
   * Looks up a globalId for a nodeId via the O(1) forward map.
   */
  findGlobalId(meta: WorkingMetaShard, nodeId: string): number | undefined {
    return meta.nodeToGlobalMap.get(nodeId);
  }

  /**
   * Reverse-looks up a nodeId from a globalId using the shard byte encoding.
   */
  findNodeIdByGlobal(
    globalId: number,
    getOrLoadMeta: (shardKey: string) => WorkingMetaShard,
  ): string | undefined {
    const shardByte = (globalId >>> 24) & 0xff;
    const shardKey = shardByte.toString(16).padStart(2, '0');
    const meta = getOrLoadMeta(shardKey);
    return meta.globalToNode.get(globalId);
  }

  /**
   * Purges edge bitmaps in one direction for a dead node, and removes
   * the dead node's globalId from the opposite direction's peer bitmaps.
   */
  private _purgeDirection(deadGid: number, shardKey: string, opts: {
    primaryCache: Map<string, EdgeShardData>;
    peerCache: Map<string, EdgeShardData>;
    primaryDir: string;
    peerDir: string;
    getOrLoadMeta: (shardKey: string) => WorkingMetaShard;
    getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData;
  }): void {
    const data = opts.getOrLoadEdgeShard(opts.primaryCache, opts.primaryDir, shardKey);
    const gidStr = String(deadGid);

    for (const bucket of Object.keys(data)) {
      if (!data[bucket] || !data[bucket][gidStr]) {
        continue;
      }
      const peers = this._clearBitmapAndCollectPeers(data, bucket, gidStr);
      this._removePeerReferences(deadGid, peers, { bucket, ...opts });
    }
  }

  /**
   * Clears a bitmap entry for the dead node and returns the peer globalIds.
   */
  private _clearBitmapAndCollectPeers(
    data: EdgeShardData,
    bucket: string,
    gidStr: string,
  ): number[] {
    const RoaringBitmap32 = getRoaringBitmap32();
    const bucketData = data[bucket];
    if (!bucketData || !bucketData[gidStr]) {
      return [];
    }
    const bm = RoaringBitmap32.deserialize(toBytes(bucketData[gidStr]), true);
    const peers = bm.toArray();
    bm.clear();
    bucketData[gidStr] = bm.serialize(true);
    return peers;
  }

  /**
   * Removes deadGid from each peer's bitmap in the opposite direction.
   */
  private _removePeerReferences(deadGid: number, peers: number[], opts: {
    bucket: string;
    peerCache: Map<string, EdgeShardData>;
    peerDir: string;
    getOrLoadMeta: (shardKey: string) => WorkingMetaShard;
    getOrLoadEdgeShard: (cache: Map<string, EdgeShardData>, dir: string, shardKey: string) => EdgeShardData;
  }): void {
    const RoaringBitmap32 = getRoaringBitmap32();
    for (const peerGid of peers) {
      const peerNodeId = this.findNodeIdByGlobal(peerGid, opts.getOrLoadMeta);
      if (peerNodeId === undefined) {
        continue;
      }
      const peerShard = computeShardKey(peerNodeId);
      const peerData = opts.getOrLoadEdgeShard(opts.peerCache, opts.peerDir, peerShard);
      const peerGidStr = String(peerGid);
      const peerBucketData = peerData[opts.bucket];
      if (peerBucketData && peerBucketData[peerGidStr]) {
        const peerBm = RoaringBitmap32.deserialize(
          toBytes(peerBucketData[peerGidStr]),
          true,
        );
        peerBm.remove(deadGid);
        peerBucketData[peerGidStr] = peerBm.serialize(true);
      }
    }
  }
}
