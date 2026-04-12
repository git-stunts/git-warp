/**
 * Builder for constructing CBOR-based bitmap indexes over the logical graph.
 *
 * Produces sharded index with stable numeric IDs, append-only label registry,
 * per-label forward/reverse bitmaps, and alive bitmaps per shard.
 *
 * Shard output:
 *   meta_XX.cbor   — nodeId → globalId mappings, nextLocalId, alive bitmap
 *   labels.cbor    — label registry (append-only)
 *   fwd_XX.cbor    — forward edge bitmaps (all + byLabel)
 *   rev_XX.cbor    — reverse edge bitmaps (all + byLabel)
 *   receipt.cbor   — build metadata
 *
 * @module domain/services/index/LogicalBitmapIndexBuilder
 */

import computeShardKey from '../../utils/shardKey.ts';
import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import { ShardIdOverflowError } from '../../errors/index.ts';
import { MetaShard } from '../../artifacts/MetaShard.ts';
import { EdgeShard } from '../../artifacts/EdgeShard.ts';
import { LabelShard } from '../../artifacts/LabelShard.ts';
import { ReceiptShard } from '../../artifacts/ReceiptShard.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';

/** Maximum local IDs per shard (2^24). */
const MAX_LOCAL_ID = 1 << 24;

type NodeToGlobalArray = Array<[string, number]>;
type NodeToGlobalRecord = Record<string, number>;

type MetaInput = {
  nodeToGlobal: NodeToGlobalArray | NodeToGlobalRecord;
  nextLocalId: number;
};

export default class LogicalBitmapIndexBuilder {
  private readonly _nodeToGlobal: Map<string, number>;
  private readonly _globalToNode: Map<string, string>;
  private readonly _shardNextLocal: Map<string, number>;
  private readonly _aliveBitmaps: Map<string, RoaringBitmapSubset>;
  private readonly _labelToId: Map<string, number>;
  private _nextLabelId: number;
  private readonly _fwdBitmaps: Map<string, RoaringBitmapSubset>;
  private readonly _revBitmaps: Map<string, RoaringBitmapSubset>;
  private readonly _shardNodes: Map<string, Array<[string, number]>>;

  constructor() {
    this._nodeToGlobal = new Map();
    this._globalToNode = new Map();
    this._shardNextLocal = new Map();
    this._aliveBitmaps = new Map();
    this._labelToId = new Map();
    this._nextLabelId = 0;
    this._fwdBitmaps = new Map();
    this._revBitmaps = new Map();
    this._shardNodes = new Map();
  }

  /**
   * Registers a node and returns its stable global ID.
   * GlobalId = (shardByte << 24) | localId.
   *
   * @throws {ShardIdOverflowError} If the shard is full
   */
  registerNode(nodeId: string): number {
    const existing = this._nodeToGlobal.get(nodeId);
    if (existing !== undefined) {
      return existing;
    }

    const shardKey = computeShardKey(nodeId);
    const shardByte = parseInt(shardKey, 16);
    const nextLocal = this._shardNextLocal.get(shardKey) ?? 0;

    if (nextLocal >= MAX_LOCAL_ID) {
      throw new ShardIdOverflowError(
        `Shard '${shardKey}' exceeded max local ID (${MAX_LOCAL_ID})`,
        { shardKey, nextLocalId: nextLocal },
      );
    }

    const globalId = ((shardByte << 24) | nextLocal) >>> 0;
    this._nodeToGlobal.set(nodeId, globalId);
    this._globalToNode.set(String(globalId), nodeId);
    this._shardNextLocal.set(shardKey, nextLocal + 1);

    let shardList = this._shardNodes.get(shardKey);
    if (!shardList) {
      shardList = [];
      this._shardNodes.set(shardKey, shardList);
    }
    shardList.push([nodeId, globalId]);

    return globalId;
  }

  /**
   * Marks a node as alive in its shard's alive bitmap.
   */
  markAlive(nodeId: string): void {
    const globalId = this._nodeToGlobal.get(nodeId);
    if (globalId === undefined) {
      return;
    }
    const shardKey = computeShardKey(nodeId);
    let bitmap = this._aliveBitmaps.get(shardKey);
    if (!bitmap) {
      const RoaringBitmap32 = getRoaringBitmap32();
      bitmap = new RoaringBitmap32();
      this._aliveBitmaps.set(shardKey, bitmap);
    }
    bitmap.add(globalId);
  }

  /**
   * Registers a label and returns its append-only labelId.
   */
  registerLabel(label: string): number {
    const existing = this._labelToId.get(label);
    if (existing !== undefined) {
      return existing;
    }
    const id = this._nextLabelId++;
    this._labelToId.set(label, id);
    return id;
  }

  /**
   * Adds a directed edge, populating forward/reverse bitmaps
   * for both the 'all' bucket and the per-label bucket.
   */
  addEdge(fromId: string, toId: string, label: string): void {
    const fromGlobal = this._nodeToGlobal.get(fromId);
    const toGlobal = this._nodeToGlobal.get(toId);
    if (fromGlobal === undefined || toGlobal === undefined) {
      return;
    }

    const labelId = this._labelToId.get(label);
    if (labelId === undefined) {
      return;
    }

    const fromShard = computeShardKey(fromId);
    const toShard = computeShardKey(toId);

    // Forward: from's shard, keyed by fromGlobal, value contains toGlobal
    this._addToBitmap(this._fwdBitmaps, { shardKey: fromShard, bucket: 'all', owner: fromGlobal, target: toGlobal });
    this._addToBitmap(this._fwdBitmaps, { shardKey: fromShard, bucket: String(labelId), owner: fromGlobal, target: toGlobal });

    // Reverse: to's shard, keyed by toGlobal, value contains fromGlobal
    this._addToBitmap(this._revBitmaps, { shardKey: toShard, bucket: 'all', owner: toGlobal, target: fromGlobal });
    this._addToBitmap(this._revBitmaps, { shardKey: toShard, bucket: String(labelId), owner: toGlobal, target: fromGlobal });
  }

  /**
   * Seeds ID mappings from a previously built meta shard for ID stability.
   */
  loadExistingMeta(shardKey: string, metaShard: MetaInput): void {
    const entries: Array<[string, number]> = Array.isArray(metaShard.nodeToGlobal)
      ? metaShard.nodeToGlobal
      : Object.entries(metaShard.nodeToGlobal);
    let shardList = this._shardNodes.get(shardKey);
    if (!shardList) {
      shardList = [];
      this._shardNodes.set(shardKey, shardList);
    }
    for (const [nodeId, globalId] of entries) {
      this._nodeToGlobal.set(nodeId, globalId);
      this._globalToNode.set(String(globalId), nodeId);
      shardList.push([nodeId, globalId]);
    }
    const current = this._shardNextLocal.get(shardKey) ?? 0;
    if (metaShard.nextLocalId > current) {
      this._shardNextLocal.set(shardKey, metaShard.nextLocalId);
    }
  }

  /**
   * Seeds the label registry from a previous build for append-only stability.
   */
  loadExistingLabels(registry: Record<string, number> | Array<[string, number]>): void {
    const entries: Array<[string, number]> = Array.isArray(registry)
      ? registry
      : Object.entries(registry);
    let maxId = this._nextLabelId;
    for (const [label, id] of entries) {
      this._labelToId.set(label, id);
      if (id >= maxId) {
        maxId = id + 1;
      }
    }
    this._nextLabelId = maxId;
  }

  /**
   * Yields IndexShard instances without encoding.
   *
   * Pipe the output through the adapter's encode → blobWrite → treeAssemble
   * pipeline to persist.
   */
  *yieldShards(): Generator<IndexShard> {
    const allShardKeys = new Set([...this._shardNextLocal.keys()]);

    // Meta shards
    for (const shardKey of allShardKeys) {
      const nodeToGlobal = (this._shardNodes.get(shardKey) ?? [])
        .slice()
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

      const aliveBitmap = this._aliveBitmaps.get(shardKey);
      const aliveBytes = aliveBitmap ? aliveBitmap.serialize(true) : new Uint8Array(0);

      yield new MetaShard({
        shardKey,
        nodeToGlobal,
        nextLocalId: this._shardNextLocal.get(shardKey) ?? 0,
        alive: aliveBytes,
      });
    }

    // Labels registry
    const labelRegistry: Array<[string, number]> = [];
    for (const [label, id] of this._labelToId) {
      labelRegistry.push([label, id]);
    }
    yield new LabelShard({ labels: labelRegistry });

    // Forward/reverse edge shards
    yield* this._yieldEdgeShards('fwd', this._fwdBitmaps);
    yield* this._yieldEdgeShards('rev', this._revBitmaps);

    // Receipt
    yield new ReceiptShard({
      version: 1,
      nodeCount: this._nodeToGlobal.size,
      labelCount: this._labelToId.size,
      shardCount: allShardKeys.size,
    });
  }

  private *_yieldEdgeShards(
    direction: 'fwd' | 'rev',
    bitmaps: Map<string, RoaringBitmapSubset>,
  ): Generator<EdgeShard> {
    const byShardKey = new Map<string, Record<string, Record<string, Uint8Array>>>();

    for (const [key, bitmap] of bitmaps) {
      const firstColon = key.indexOf(':');
      const secondColon = key.indexOf(':', firstColon + 1);
      const shardKey = key.substring(0, firstColon);
      const bucketName = key.substring(firstColon + 1, secondColon);
      const globalIdStr = key.substring(secondColon + 1);

      if (!byShardKey.has(shardKey)) {
        byShardKey.set(shardKey, {});
      }
      const shardData = byShardKey.get(shardKey)!;
      if (!shardData[bucketName]) {
        shardData[bucketName] = {};
      }
      shardData[bucketName][globalIdStr] = bitmap.serialize(true);
    }

    for (const [shardKey, shardData] of byShardKey) {
      yield new EdgeShard({ shardKey, direction, buckets: shardData });
    }
  }

  private _addToBitmap(
    store: Map<string, RoaringBitmapSubset>,
    opts: { shardKey: string; bucket: string; owner: number; target: number },
  ): void {
    const { shardKey, bucket, owner, target } = opts;
    const key = `${shardKey}:${bucket}:${owner}`;
    let bitmap = store.get(key);
    if (!bitmap) {
      const RoaringBitmap32 = getRoaringBitmap32();
      bitmap = new RoaringBitmap32();
      store.set(key, bitmap);
    }
    bitmap.add(target);
  }
}
