/**
 * Reads a serialized logical bitmap index from a tree (in-memory buffers)
 * or lazily from OID→blob storage, and produces a LogicalIndex interface.
 *
 * Extracted from test/helpers/fixtureDsl.js so that production code can
 * hydrate indexes stored inside checkpoints (Phase 3).
 *
 * @module domain/services/index/LogicalIndexReader
 */

import defaultCodec from '../../utils/defaultCodec.js';
import computeShardKey from '../../utils/shardKey.js';
import toBytes from '../../utils/toBytes.js';
import { getRoaringBitmap32 } from '../../utils/roaring.js';
import { MetaShard, EdgeShard, LabelShard } from '../../artifacts/IndexShard.js';

/** @typedef {import('./BitmapNeighborProvider.js').LogicalIndex} LogicalIndex */
/** @typedef {import('../../utils/roaring.js').RoaringBitmapSubset} Bitmap */

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
    if (neighborId !== undefined) {
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
  /** @type {import('../../../ports/NeighborProviderPort.js').NeighborEdge[]} */
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
 * Returns true if the shard path represents a meta file (meta_XX.cbor).
 *
 * @param {string} path - Shard file path
 * @returns {boolean}
 */
function isMetaShard(path) {
  return path.startsWith('meta_') && path.endsWith('.cbor');
}

/**
 * Returns true if the shard path represents an edge file (fwd_XX.cbor or rev_XX.cbor).
 *
 * @param {string} path - Shard file path
 * @returns {boolean}
 */
function isEdgeShard(path) {
  return path.endsWith('.cbor') && (path.startsWith('fwd_') || path.startsWith('rev_'));
}

/**
 * Classifies loaded path/buf pairs into meta, labels, and edge buckets.
 *
 * @param {ShardItem[]} items - Array of shard path/buffer pairs to classify
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
    if (isMetaShard(path)) {
      meta.push(item);
    } else if (path === 'labels.cbor') {
      labels = item.buf;
    } else if (isEdgeShard(path)) {
      edges.push(item);
    }
  }

  return { meta, labels, edges };
}

/**
 * Checks whether a node is alive in the bitmap index.
 *
 * @param {Map<string, number>} n2g - Node-to-global-ID mapping
 * @param {Map<string, Bitmap>} alive - Shard-key to alive bitmap mapping
 * @param {string} nodeId - Node identifier to check
 * @returns {boolean}
 */
function checkAlive(n2g, alive, nodeId) {
  const gid = n2g.get(nodeId);
  if (gid === undefined) {
    return false;
  }
  const bitmap = alive.get(computeShardKey(nodeId));
  return bitmap !== undefined ? bitmap.has(gid) : false;
}

/**
 * Resolves filtered edges for a specific node and direction.
 *
 * @param {Map<string, Bitmap>} store - Forward or reverse edge store
 * @param {{ gid: number, dir: string, filterLabelIds: number[], i2l: Map<number, string>, g2n: Map<number, string> }} ctx
 * @returns {Array<{neighborId: string, label: string}>}
 */
function resolveFilteredEdges(store, ctx) {
  /** @type {import('../../../ports/NeighborProviderPort.js').NeighborEdge[]} */
  const out = [];
  for (const labelId of ctx.filterLabelIds) {
    const bitmap = store.get(`${ctx.dir}:${labelId}:${ctx.gid}`);
    if (bitmap !== undefined) {
      expandBitmap(bitmap, ctx.i2l.get(labelId) ?? '', { g2n: ctx.g2n, out });
    }
  }
  return out;
}

/**
 * @typedef {{
 *   n2g: Map<string, number>,
 *   g2n: Map<number, string>,
 *   alive: Map<string, Bitmap>,
 *   lr: Map<string, number>,
 *   i2l: Map<number, string>,
 *   fwd: Map<string, Bitmap>,
 *   rev: Map<string, Bitmap>,
 *   byOwnerFwd: Map<number, Array<{labelId: number, bitmap: Bitmap}>>,
 *   byOwnerRev: Map<number, Array<{labelId: number, bitmap: Bitmap}>>
 * }} IndexMaps
 */

/**
 * Builds a LogicalIndex object from decoded shard maps.
 *
 * @param {IndexMaps} maps - Decoded index data maps
 * @returns {LogicalIndex}
 */
function buildLogicalIndex(maps) {
  const { n2g, g2n, alive, lr } = maps;
  return {
    /** Maps a node ID to its global numeric identifier. @param {string} nodeId */
    getGlobalId: (nodeId) => n2g.get(nodeId),
    /** Maps a global numeric identifier back to its node ID. @param {number} globalId */
    getNodeId: (globalId) => g2n.get(globalId),
    /** Returns the label-to-numeric-ID registry. */
    getLabelRegistry: () => lr,
    /** Checks whether a node is alive in the bitmap index. @param {string} nodeId */
    isAlive: (nodeId) => checkAlive(n2g, alive, nodeId),
    /** Retrieves edges for a node in the given direction.
     * @param {string} nodeId @param {string} direction @param {number[]} [filterLabelIds] */
    getEdges(nodeId, direction, filterLabelIds) {
      const dir = /** @type {'in'|'out'} */ (direction);
      return resolveEdgesForNode(
        maps,
        { nodeId, direction: dir, ...(filterLabelIds ? { filterLabelIds } : {}) },
      );
    },
  };
}

/**
 * Selects the appropriate edge stores for the given direction.
 *
 * @param {IndexMaps} maps - Index data maps
 * @param {string} dir - 'fwd' or 'rev'
 * @returns {{ store: Map<string, Bitmap>, byOwner: Map<number, Array<{labelId: number, bitmap: Bitmap}>> }}
 */
function selectEdgeStores(maps, dir) {
  return {
    store: dir === 'fwd' ? maps.fwd : maps.rev,
    byOwner: dir === 'fwd' ? maps.byOwnerFwd : maps.byOwnerRev,
  };
}

/**
 * Resolves edges for a specific node and direction from index maps.
 *
 * @param {IndexMaps} maps - Index data maps
 * @param {{ nodeId: string, direction: 'in'|'out', filterLabelIds?: number[] }} query - Edge query parameters
 * @returns {Array<{neighborId: string, label: string}>}
 */
function resolveEdgesForNode(maps, query) {
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

/** @typedef {typeof import('roaring').RoaringBitmap32} RoaringCtor */

export default class LogicalIndexReader {
  /**
   * Constructs a LogicalIndexReader with an optional CBOR codec override
   * and/or an IndexStorePort for codec-free reads.
   *
   * @param {{ codec?: import('../../../ports/CodecPort.js').default, indexStore?: import('../../../ports/IndexStorePort.js').default }} [options] - Reader options
   */
  constructor(options = undefined) {
    const { codec, indexStore } = options || {};
    this._codec = codec || defaultCodec;
    /** @type {import('../../../ports/IndexStorePort.js').default|null} */
    this._indexStore = indexStore || null;

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
   * Populates the reader directly from IndexShard domain objects.
   *
   * This is the codec-free alternative to loadFromTree() and loadFromOids().
   * No CBOR decoding is needed — the shards already carry decoded data.
   *
   * @param {Iterable<import('../../artifacts/IndexShard.js').IndexShard>} shards
   * @returns {this}
   */
  loadFromShards(shards) {
    this._resetState();
    const Ctor = getRoaringBitmap32();
    for (const shard of shards) {
      if (shard instanceof MetaShard) {
        this._loadMetaShard(shard, Ctor);
      } else if (shard instanceof LabelShard) {
        this._loadLabelShard(shard);
      } else if (shard instanceof EdgeShard) {
        this._loadEdgeShard(shard, Ctor);
      }
    }
    return this;
  }

  /**
   * Loads all shards from an IndexStorePort via scanShards (codec-free).
   *
   * The adapter reads, decodes, and classifies blobs into IndexShard
   * domain objects. The reader consumes them without touching any codec.
   *
   * @param {string} treeOid - The index tree OID
   * @returns {Promise<this>}
   */
  async loadFromStore(treeOid) {
    if (!this._indexStore) {
      throw new Error('LogicalIndexReader: loadFromStore() requires an indexStore');
    }
    const shards = await this._indexStore.scanShards(treeOid).collect();
    this.loadFromShards(shards);
    return this;
  }

  /**
   * Returns a LogicalIndex interface object backed by the decoded shard data.
   *
   * @returns {LogicalIndex}
   */
  toLogicalIndex() {
    return buildLogicalIndex({
      n2g: this._nodeToGlobal,
      g2n: this._globalToNode,
      alive: this._aliveBitmaps,
      lr: this._labelRegistry,
      i2l: this._idToLabel,
      fwd: this._edgeFwd,
      rev: this._edgeRev,
      byOwnerFwd: this._edgeByOwnerFwd,
      byOwnerRev: this._edgeByOwnerRev,
    });
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
   * Decodes a meta shard and populates node-to-global and alive bitmap maps.
   *
   * @param {string} path - Shard file path (e.g. meta_ab.cbor)
   * @param {Uint8Array} buf - Raw CBOR bytes
   * @param {RoaringCtor} Ctor - RoaringBitmap32 constructor
   * @private
   */
  _decodeMeta(path, buf, Ctor) {
    /** @type {{ nodeToGlobal: Array<[string, number]>|Record<string, number>, alive: Uint8Array|ArrayLike<number> }} */
    const meta = /** @type {{ nodeToGlobal: Array<[string, number]>|Record<string, number>, alive: Uint8Array|ArrayLike<number> }} */ (/** @type {unknown} */ (this._codec.decode(buf)));
    const entries = Array.isArray(meta.nodeToGlobal)
      ? meta.nodeToGlobal
      : Object.entries(meta.nodeToGlobal);
    for (const [nodeId, globalId] of entries) {
      this._nodeToGlobal.set(nodeId, /** @type {number} */ (globalId));
      this._globalToNode.set(/** @type {number} */ (globalId), nodeId);
    }
    this._loadAliveBitmap(path.slice(5, 7), meta.alive, Ctor);
  }

  /**
   * Loads an alive bitmap from decoded meta data if present and non-empty.
   *
   * @param {string} shardKey - Two-character hex shard key
   * @param {Uint8Array|ArrayLike<number>} aliveData - Serialized bitmap data
   * @param {RoaringCtor} Ctor - RoaringBitmap32 constructor
   * @private
   */
  _loadAliveBitmap(shardKey, aliveData, Ctor) {
    if (aliveData !== null && aliveData !== undefined && aliveData.length > 0) {
      this._aliveBitmaps.set(shardKey, Ctor.deserialize(toBytes(aliveData), true));
    }
  }

  /**
   * Decodes a label registry shard from CBOR into the label maps.
   *
   * @param {Uint8Array} buf - Raw CBOR bytes
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
   * Decodes a forward or reverse edge shard and populates the edge stores.
   *
   * @param {string} dir - 'fwd' or 'rev'
   * @param {Uint8Array} buf - Raw CBOR bytes
   * @param {RoaringCtor} Ctor - RoaringBitmap32 constructor
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

  // ── loadFromShards helpers (codec-free) ───────────────────────────────────

  /**
   * Loads a MetaShard's data into the reader's maps.
   *
   * @param {MetaShard} shard
   * @param {RoaringCtor} Ctor
   * @private
   */
  _loadMetaShard(shard, Ctor) {
    for (const [nodeId, globalId] of shard.nodeToGlobal) {
      this._nodeToGlobal.set(nodeId, globalId);
      this._globalToNode.set(globalId, nodeId);
    }
    this._loadAliveBitmap(shard.shardKey, shard.alive, Ctor);
  }

  /**
   * Loads a LabelShard's data into the reader's label maps.
   *
   * @param {LabelShard} shard
   * @private
   */
  _loadLabelShard(shard) {
    for (const [label, id] of shard.labels) {
      this._labelRegistry.set(label, id);
      this._idToLabel.set(id, label);
    }
  }

  /**
   * Loads an EdgeShard's bitmap data into the reader's edge stores.
   *
   * @param {EdgeShard} shard
   * @param {RoaringCtor} Ctor
   * @private
   */
  _loadEdgeShard(shard, Ctor) {
    const dir = shard.direction;
    const store = dir === 'fwd' ? this._edgeFwd : this._edgeRev;
    const byOwner = dir === 'fwd' ? this._edgeByOwnerFwd : this._edgeByOwnerRev;
    for (const [bucket, entries] of Object.entries(shard.buckets)) {
      for (const [gidStr, bitmapBytes] of Object.entries(entries)) {
        const bitmap = Ctor.deserialize(toBytes(bitmapBytes), true);
        store.set(`${dir}:${bucket}:${gidStr}`, bitmap);
        this._indexByOwner(byOwner, { bucket, gidStr, bitmap });
      }
    }
  }
}
