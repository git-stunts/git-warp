/**
 * Reads a serialized logical bitmap index from a tree (in-memory buffers)
 * or lazily from OID→blob storage, and produces a LogicalIndex interface.
 *
 * Extracted from test/helpers/fixtureDsl.js so that production code can
 * hydrate indexes stored inside checkpoints (Phase 3).
 *
 * @module domain/services/LogicalIndexReader
 */

import defaultCodec from '../utils/defaultCodec.js';
import computeShardKey from '../utils/shardKey.js';
import toBytes from '../utils/toBytes.js';
import { getRoaringBitmap32 } from '../utils/roaring.js';

/** @typedef {import('./BitmapNeighborProvider.js').LogicalIndex} LogicalIndex */
/** @typedef {import('../utils/roaring.js').RoaringBitmapSubset} Bitmap */

/**
 * Expands a bitmap into neighbor entries, pushing into `out`.
 *
 * @param {Bitmap} bitmap
 * @param {string} label
 * @param {{ g2n: Map<number, string>, out: Array<{neighborId: string, label: string}> }} ctx
 */
function expandBitmap(bitmap, label, ctx) {
  for (const neighborGid of bitmap.toArray()) {
    const neighborId = ctx.g2n.get(neighborGid);
    if (neighborId) {
      ctx.out.push({ neighborId, label });
    }
  }
}

/**
 * Resolves edges from a byOwner map for a given node (all labels).
 *
 * @param {Map<number, Array<{labelId: number, bitmap: Bitmap}>>} byOwner
 * @param {{ gid: number, i2l: Map<number, string>, g2n: Map<number, string> }} ctx
 * @returns {Array<{neighborId: string, label: string}>}
 */
function resolveAllLabels(byOwner, ctx) {
  const { gid, i2l, g2n } = ctx;
  const entries = byOwner.get(gid);
  if (!entries) {
    return [];
  }
  /** @type {import('../../ports/NeighborProviderPort.js').NeighborEdge[]} */
  const out = [];
  for (const { labelId, bitmap } of entries) {
    expandBitmap(bitmap, i2l.get(labelId) ?? '', { g2n, out });
  }
  return out;
}

/**
 * @typedef {{ path: string, buf: Uint8Array }} ShardItem
 */

/**
 * Classifies loaded path/buf pairs into meta, labels, and edge buckets.
 *
 * @param {ShardItem[]} items
 * @returns {{ meta: ShardItem[], labels: Uint8Array|null, edges: ShardItem[] }}
 */
function classifyShards(items) {
  /** @type {ShardItem[]} */
  const meta = [];
  /** @type {Uint8Array|null} */
  let labels = null;
  /** @type {ShardItem[]} */
  const edges = [];

  for (const item of items) {
    const { path } = item;
    if (path.startsWith('meta_') && path.endsWith('.cbor')) {
      meta.push(item);
    } else if (path === 'labels.cbor') {
      labels = item.buf;
    } else if (path.endsWith('.cbor') && (path.startsWith('fwd_') || path.startsWith('rev_'))) {
      edges.push(item);
    }
  }

  return { meta, labels, edges };
}

/** @typedef {typeof import('roaring').RoaringBitmap32} RoaringCtor */

export default class LogicalIndexReader {
  /**
   * @param {{ codec?: import('../../ports/CodecPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { codec } = options || {};
    this._codec = codec || defaultCodec;

    /** @type {Map<string, number>} */
    this._nodeToGlobal = new Map();
    /** @type {Map<number, string>} */
    this._globalToNode = new Map();
    /** @type {Map<string, Bitmap>} */
    this._aliveBitmaps = new Map();
    /** @type {Map<string, number>} */
    this._labelRegistry = new Map();
    /** @type {Map<number, string>} */
    this._idToLabel = new Map();
    /** @type {Map<string, Bitmap>} */
    this._edgeFwd = new Map();
    /** @type {Map<string, Bitmap>} */
    this._edgeRev = new Map();

    /** @type {Map<number, Array<{labelId: number, bitmap: Bitmap}>>} */
    this._edgeByOwnerFwd = new Map();
    /** @type {Map<number, Array<{labelId: number, bitmap: Bitmap}>>} */
    this._edgeByOwnerRev = new Map();
  }

  /**
   * Eagerly decodes all shards from an in-memory tree (Record<path, Uint8Array>).
   *
   * @param {Record<string, Uint8Array>} tree
   * @returns {this}
   */
  loadFromTree(tree) {
    this._resetState();
    const items = Object.entries(tree).map(([path, buf]) => ({ path, buf }));
    this._processShards(items);
    return this;
  }

  /**
   * Loads all shards from OID→blob storage (async).
   *
   * @param {Record<string, string>} shardOids - path → blob OID
   * @param {{ readBlob(oid: string): Promise<Uint8Array> }} storage
   * @returns {Promise<this>}
   */
  async loadFromOids(shardOids, storage) {
    this._resetState();
    const entries = Object.entries(shardOids);
    const items = await Promise.all(
      entries.map(async ([path, oid]) => ({ path, buf: await storage.readBlob(oid) }))
    );
    this._processShards(items);
    return this;
  }

  /**
   * Returns a LogicalIndex interface object.
   *
   * @returns {LogicalIndex}
   */
  toLogicalIndex() {
    const { _nodeToGlobal: n2g, _globalToNode: g2n, _aliveBitmaps: alive,
      _labelRegistry: lr, _idToLabel: i2l, _edgeFwd: fwd, _edgeRev: rev,
      _edgeByOwnerFwd: byOwnerFwd, _edgeByOwnerRev: byOwnerRev } = this;

    return {
      getGlobalId: (nodeId) => n2g.get(nodeId),
      getNodeId: (globalId) => g2n.get(globalId),
      getLabelRegistry: () => lr,

      isAlive(nodeId) {
        const gid = n2g.get(nodeId);
        if (gid === undefined) {
          return false;
        }
        const bitmap = alive.get(computeShardKey(nodeId));
        return bitmap ? bitmap.has(gid) : false;
      },

      getEdges(nodeId, direction, filterLabelIds) {
        const gid = n2g.get(nodeId);
        if (gid === undefined) {
          return [];
        }
        const dir = direction === 'out' ? 'fwd' : 'rev';

        if (!filterLabelIds) {
          const byOwner = dir === 'fwd' ? byOwnerFwd : byOwnerRev;
          return resolveAllLabels(byOwner, { gid, i2l, g2n });
        }
        const store = dir === 'fwd' ? fwd : rev;
        /** @type {import('../../ports/NeighborProviderPort.js').NeighborEdge[]} */
        const out = [];
        for (const labelId of filterLabelIds) {
          const bitmap = store.get(`${dir}:${labelId}:${gid}`);
          if (bitmap) {
            expandBitmap(bitmap, i2l.get(labelId) ?? '', { g2n, out });
          }
        }
        return out;
      },
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Processes classified shards in deterministic order.
   *
   * @param {ShardItem[]} items
   * @private
   */
  _processShards(items) {
    const Ctor = getRoaringBitmap32();
    const { meta, labels, edges } = classifyShards(items);

    for (const { path, buf } of meta) {
      this._decodeMeta(path, buf, Ctor);
    }
    if (labels) {
      this._decodeLabels(labels);
    }
    for (const { path, buf } of edges) {
      this._decodeEdgeShard(path.startsWith('fwd_') ? 'fwd' : 'rev', buf, Ctor);
    }
  }

  /**
   * @param {string} path
   * @param {Uint8Array} buf
   * @param {RoaringCtor} Ctor
   * @private
   */
  _decodeMeta(path, buf, Ctor) {
    const shardKey = path.slice(5, 7);
    const meta = /** @type {{ nodeToGlobal: Array<[string, number]>|Record<string, number>, alive: Uint8Array|ArrayLike<number> }} */ (this._codec.decode(buf));

    const entries = Array.isArray(meta.nodeToGlobal)
      ? meta.nodeToGlobal
      : Object.entries(meta.nodeToGlobal);
    for (const [nodeId, globalId] of entries) {
      this._nodeToGlobal.set(nodeId, /** @type {number} */ (globalId));
      this._globalToNode.set(/** @type {number} */ (globalId), nodeId);
    }

    if (meta.alive && meta.alive.length > 0) {
      this._aliveBitmaps.set(
        shardKey,
        Ctor.deserialize(toBytes(meta.alive), true)
      );
    }
  }

  /**
   * @param {Uint8Array} buf
   * @private
   */
  _decodeLabels(buf) {
    const decoded = /** @type {Record<string, number>|Array<[string, number]>} */ (this._codec.decode(buf));
    const entries = Array.isArray(decoded) ? decoded : Object.entries(decoded);
    for (const [label, id] of entries) {
      this._labelRegistry.set(label, id);
      this._idToLabel.set(id, label);
    }
  }

  /**
   * Clears all decoded state so the reader can be reused safely.
   *
   * @private
   */
  _resetState() {
    this._nodeToGlobal.clear();
    this._globalToNode.clear();
    this._aliveBitmaps.clear();
    this._labelRegistry.clear();
    this._idToLabel.clear();
    this._edgeFwd.clear();
    this._edgeRev.clear();
    this._edgeByOwnerFwd.clear();
    this._edgeByOwnerRev.clear();
  }

  /**
   * @param {string} dir - 'fwd' or 'rev'
   * @param {Uint8Array} buf
   * @param {RoaringCtor} Ctor
   * @private
   */
  _decodeEdgeShard(dir, buf, Ctor) {
    const store = dir === 'fwd' ? this._edgeFwd : this._edgeRev;
    const byOwner = dir === 'fwd' ? this._edgeByOwnerFwd : this._edgeByOwnerRev;
    const decoded = /** @type {Record<string, Record<string, Uint8Array|ArrayLike<number>>>} */ (this._codec.decode(buf));
    for (const [bucket, entries] of Object.entries(decoded)) {
      for (const [gidStr, bitmapBytes] of Object.entries(entries)) {
        const bitmap = Ctor.deserialize(toBytes(bitmapBytes), true);
        store.set(`${dir}:${bucket}:${gidStr}`, bitmap);
        this._indexByOwner(byOwner, { bucket, gidStr, bitmap });
      }
    }
  }

  /**
   * Adds a bitmap entry to the per-owner secondary index (non-'all' buckets only).
   *
   * @param {Map<number, Array<{labelId: number, bitmap: Bitmap}>>} byOwner
   * @param {{ bucket: string, gidStr: string, bitmap: Bitmap }} entry
   * @private
   */
  _indexByOwner(byOwner, { bucket, gidStr, bitmap }) {
    if (bucket === 'all') {
      return;
    }
    const gid = parseInt(gidStr, 10);
    let list = byOwner.get(gid);
    if (!list) {
      list = [];
      byOwner.set(gid, list);
    }
    list.push({ labelId: parseInt(bucket, 10), bitmap });
  }
}
