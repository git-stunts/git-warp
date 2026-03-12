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
 * @module domain/services/LogicalBitmapIndexBuilder
 */

import defaultCodec from '../utils/defaultCodec.js';
import computeShardKey from '../utils/shardKey.js';
import { getRoaringBitmap32 } from '../utils/roaring.js';
import { ShardIdOverflowError } from '../errors/index.js';

/** Maximum local IDs per shard (2^24). */
const MAX_LOCAL_ID = 1 << 24;

export default class LogicalBitmapIndexBuilder {
  /**
   * @param {{ codec?: import('../../ports/CodecPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { codec } = options || {};
    this._codec = codec || defaultCodec;

    /** @type {Map<string, number>} nodeId → globalId */
    this._nodeToGlobal = new Map();

    /** @type {Map<string, string>} globalId(string) → nodeId */
    this._globalToNode = new Map();

    /** Per-shard next local ID counters. @type {Map<string, number>} */
    this._shardNextLocal = new Map();

    /** Alive bitmap per shard. @type {Map<string, import('../utils/roaring.js').RoaringBitmapSubset>} */
    this._aliveBitmaps = new Map();

    /** Label → labelId (append-only). @type {Map<string, number>} */
    this._labelToId = new Map();

    /** @type {number} */
    this._nextLabelId = 0;

    /**
     * Forward edge bitmaps.
     * Key: `${shardKey}:all:${globalId}` or `${shardKey}:${labelId}:${globalId}`
     * @type {Map<string, import('../utils/roaring.js').RoaringBitmapSubset>}
     */
    this._fwdBitmaps = new Map();

    /** Reverse edge bitmaps. Same key scheme as _fwdBitmaps. @type {Map<string, import('../utils/roaring.js').RoaringBitmapSubset>} */
    this._revBitmaps = new Map();

    /** Per-shard node list for O(shard) serialize. @type {Map<string, Array<[string, number]>>} */
    this._shardNodes = new Map();
  }

  /**
   * Registers a node and returns its stable global ID.
   * GlobalId = (shardByte << 24) | localId.
   *
   * @param {string} nodeId
   * @returns {number} globalId
   * @throws {ShardIdOverflowError} If the shard is full
   */
  registerNode(nodeId) {
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
   *
   * @param {string} nodeId
   */
  markAlive(nodeId) {
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
   *
   * @param {string} label
   * @returns {number}
   */
  registerLabel(label) {
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
   *
   * @param {string} fromId - Source node ID (must be registered)
   * @param {string} toId - Target node ID (must be registered)
   * @param {string} label - Edge label (must be registered)
   */
  addEdge(fromId, toId, label) {
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
   *
   * @param {string} shardKey
   * @param {{ nodeToGlobal: Array<[string, number]>|Record<string, number>, nextLocalId: number }} metaShard
   */
  loadExistingMeta(shardKey, metaShard) {
    const entries = Array.isArray(metaShard.nodeToGlobal)
      ? metaShard.nodeToGlobal
      : Object.entries(metaShard.nodeToGlobal);
    let shardList = this._shardNodes.get(shardKey);
    if (!shardList) {
      shardList = [];
      this._shardNodes.set(shardKey, shardList);
    }
    for (const [nodeId, globalId] of entries) {
      this._nodeToGlobal.set(nodeId, /** @type {number} */ (globalId));
      this._globalToNode.set(String(globalId), /** @type {string} */ (nodeId));
      shardList.push([/** @type {string} */ (nodeId), /** @type {number} */ (globalId)]);
    }
    const current = this._shardNextLocal.get(shardKey) ?? 0;
    if (metaShard.nextLocalId > current) {
      this._shardNextLocal.set(shardKey, metaShard.nextLocalId);
    }
  }

  /**
   * Seeds the label registry from a previous build for append-only stability.
   *
   * @param {Record<string, number>|Array<[string, number]>} registry - label → labelId
   */
  loadExistingLabels(registry) {
    const entries = Array.isArray(registry) ? registry : Object.entries(registry);
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
   * Serializes the full index to a Record<string, Uint8Array>.
   *
   * @returns {Record<string, Uint8Array>}
   */
  serialize() {
    /** @type {Record<string, Uint8Array>} */
    const tree = {};

    // Collect all shard keys that have any data
    const allShardKeys = new Set([
      ...this._shardNextLocal.keys(),
    ]);

    // Meta shards
    for (const shardKey of allShardKeys) {
      // Use array of [nodeId, globalId] pairs to avoid __proto__ key issues
      // Sort by nodeId for deterministic output
      const nodeToGlobal = (this._shardNodes.get(shardKey) ?? [])
        .slice()
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

      const aliveBitmap = this._aliveBitmaps.get(shardKey);
      const aliveBytes = aliveBitmap ? aliveBitmap.serialize(true) : new Uint8Array(0);

      const shard = {
        nodeToGlobal,
        nextLocalId: this._shardNextLocal.get(shardKey) ?? 0,
        alive: aliveBytes,
      };

      tree[`meta_${shardKey}.cbor`] = this._codec.encode(shard).slice();
    }

    // Labels registry
    /** @type {Array<[string, number]>} */
    const labelRegistry = [];
    for (const [label, id] of this._labelToId) {
      labelRegistry.push([label, id]);
    }
    tree['labels.cbor'] = this._codec.encode(labelRegistry).slice();

    // Forward/reverse edge shards
    this._serializeEdgeShards(tree, 'fwd', this._fwdBitmaps);
    this._serializeEdgeShards(tree, 'rev', this._revBitmaps);

    // Receipt
    const receipt = {
      version: 1,
      nodeCount: this._nodeToGlobal.size,
      labelCount: this._labelToId.size,
      shardCount: allShardKeys.size,
    };
    tree['receipt.cbor'] = this._codec.encode(receipt).slice();

    return tree;
  }

  /**
   * @param {Record<string, Uint8Array>} tree
   * @param {string} direction - 'fwd' or 'rev'
   * @param {Map<string, import('../utils/roaring.js').RoaringBitmapSubset>} bitmaps
   * @private
   */
  _serializeEdgeShards(tree, direction, bitmaps) {
    // Group by shardKey
    /** @type {Map<string, Record<string, Record<string, Uint8Array>>>} */
    const byShardKey = new Map();

    for (const [key, bitmap] of bitmaps) {
      // key: `${shardKey}:${bucketName}:${globalId}`
      const firstColon = key.indexOf(':');
      const secondColon = key.indexOf(':', firstColon + 1);
      const shardKey = key.substring(0, firstColon);
      const bucketName = key.substring(firstColon + 1, secondColon);
      const globalIdStr = key.substring(secondColon + 1);

      if (!byShardKey.has(shardKey)) {
        byShardKey.set(shardKey, {});
      }
      const shardData = /** @type {Record<string, Record<string, Uint8Array>>} */ (byShardKey.get(shardKey));
      if (!shardData[bucketName]) {
        shardData[bucketName] = {};
      }
      shardData[bucketName][globalIdStr] = bitmap.serialize(true);
    }

    for (const [shardKey, shardData] of byShardKey) {
      tree[`${direction}_${shardKey}.cbor`] = this._codec.encode(shardData).slice();
    }
  }

  /**
   * @param {Map<string, import('../utils/roaring.js').RoaringBitmapSubset>} store
   * @param {{ shardKey: string, bucket: string, owner: number, target: number }} opts
   * @private
   */
  _addToBitmap(store, { shardKey, bucket, owner, target }) {
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
