import roaring from 'roaring';
const { RoaringBitmap32 } = roaring;

/**
 * High-performance sharded index with Lazy Loading.
 *
 * Storage format:
 * - `meta_XX.json`: Maps SHA -> numeric ID (sharded by SHA prefix)
 * - `shards_fwd_XX.json`: Maps SHA -> base64-encoded bitmap of child IDs
 * - `shards_rev_XX.json`: Maps SHA -> base64-encoded bitmap of parent IDs
 *
 * The bitmaps are per-node (keyed by full SHA), grouped into shards by prefix.
 */
export default class BitmapIndexService {
  constructor({ persistence } = {}) {
    this.persistence = persistence;
    this.shardOids = new Map(); // path -> OID
    this.loadedShards = new Map(); // path -> Data
    this._idToShaCache = null; // Lazy-built reverse mapping
  }

  /**
   * Looks up the numeric ID for a SHA.
   * @param {string} sha - The 40-character SHA
   * @returns {Promise<number|undefined>} The numeric ID or undefined
   */
  async lookupId(sha) {
    const prefix = sha.substring(0, 2);
    const path = `meta_${prefix}.json`;
    const idMap = await this._getOrLoadShard(path, 'json');
    return idMap[sha];
  }

  /**
   * Gets parent SHAs for a node (O(1) via reverse bitmap).
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of parent SHAs
   */
  async getParents(sha) {
    return this._getEdges(sha, 'rev');
  }

  /**
   * Gets child SHAs for a node (O(1) via forward bitmap).
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of child SHAs
   */
  async getChildren(sha) {
    return this._getEdges(sha, 'fwd');
  }

  /**
   * Internal method to get edges (forward or reverse) for a node.
   * @param {string} sha - The node's SHA
   * @param {string} type - 'fwd' for children, 'rev' for parents
   * @returns {Promise<string[]>} Array of connected SHAs
   * @private
   */
  async _getEdges(sha, type) {
    const prefix = sha.substring(0, 2);
    const shardPath = `shards_${type}_${prefix}.json`;
    const shard = await this._getOrLoadShard(shardPath, 'json');

    const encoded = shard[sha];
    if (!encoded) {
      return [];
    }

    // Decode base64 bitmap and extract IDs
    const buffer = Buffer.from(encoded, 'base64');
    const bitmap = RoaringBitmap32.deserialize(buffer, true);
    const ids = bitmap.toArray();

    // Convert IDs to SHAs
    const idToSha = await this._buildIdToShaMapping();
    return ids.map(id => idToSha[id]).filter(Boolean);
  }

  /**
   * Builds the ID -> SHA reverse mapping by loading all meta shards.
   * @returns {Promise<string[]>} Array where index is ID and value is SHA
   * @private
   */
  async _buildIdToShaMapping() {
    if (this._idToShaCache) {
      return this._idToShaCache;
    }

    this._idToShaCache = [];

    for (const [path] of this.shardOids) {
      if (path.startsWith('meta_') && path.endsWith('.json')) {
        const shard = await this._getOrLoadShard(path, 'json');
        for (const [sha, id] of Object.entries(shard)) {
          this._idToShaCache[id] = sha;
        }
      }
    }

    return this._idToShaCache;
  }

  /**
   * Loads a shard with graceful degradation.
   * @param {string} path - Shard path
   * @param {string} format - 'json' or 'bitmap'
   * @returns {Promise<Object|RoaringBitmap32>}
   * @private
   */
  async _getOrLoadShard(path, format) {
    if (this.loadedShards.has(path)) {
      return this.loadedShards.get(path);
    }
    const oid = this.shardOids.get(path);
    if (!oid) {
      return format === 'json' ? {} : new RoaringBitmap32();
    }

    try {
      const buffer = await this.persistence.readBlob(oid);
      const data = format === 'json'
        ? JSON.parse(new TextDecoder().decode(buffer))
        : RoaringBitmap32.deserialize(buffer, true);

      this.loadedShards.set(path, data);
      return data;
    } catch {
      // Graceful degradation: return empty shard on load failure
      return format === 'json' ? {} : new RoaringBitmap32();
    }
  }

  setup(shardOids) {
    this.shardOids = new Map(Object.entries(shardOids));
    this._idToShaCache = null; // Clear cache when shards change
    this.loadedShards.clear();
  }

  /**
   * REBUILD LOGIC (In-memory)
   */
  static createRebuildState() {
    return {
      shaToId: new Map(),
      idToSha: [],
      bitmaps: new Map() // `${type}_${sha}` -> RoaringBitmap32
    };
  }

  static addEdge(srcSha, tgtSha, state) {
    const srcId = BitmapIndexService._getOrCreateId(srcSha, state);
    const tgtId = BitmapIndexService._getOrCreateId(tgtSha, state);
    BitmapIndexService._addToBitmap({ sha: srcSha, id: tgtId, type: 'fwd', state });
    BitmapIndexService._addToBitmap({ sha: tgtSha, id: srcId, type: 'rev', state });
  }

  /**
   * Registers a node in the rebuild state without adding edges.
   * Useful for nodes with no parents (roots).
   * @param {string} sha - The node's SHA
   * @param {Object} state - The rebuild state
   * @returns {number} The assigned numeric ID
   */
  static registerNode(sha, state) {
    return BitmapIndexService._getOrCreateId(sha, state);
  }

  static _getOrCreateId(sha, state) {
    if (state.shaToId.has(sha)) {
      return state.shaToId.get(sha);
    }
    const id = state.idToSha.length;
    state.idToSha.push(sha);
    state.shaToId.set(sha, id);
    return id;
  }

  /**
   * Adds an ID to a node's bitmap.
   * Key is now `${type}_${fullSha}` for per-node bitmaps.
   * @param {Object} opts - Options object
   * @param {string} opts.sha - The SHA to use as key
   * @param {number} opts.id - The ID to add to the bitmap
   * @param {string} opts.type - 'fwd' or 'rev'
   * @param {Object} opts.state - The rebuild state
   * @private
   */
  static _addToBitmap({ sha, id, type, state }) {
    const key = `${type}_${sha}`;
    if (!state.bitmaps.has(key)) {
      state.bitmaps.set(key, new RoaringBitmap32());
    }
    state.bitmaps.get(key).add(id);
  }

  /**
   * Serializes the rebuild state to a tree of files.
   *
   * Output structure:
   * - `meta_XX.json`: {sha: id, ...} for SHAs with prefix XX
   * - `shards_fwd_XX.json`: {sha: base64Bitmap, ...} for forward edges
   * - `shards_rev_XX.json`: {sha: base64Bitmap, ...} for reverse edges
   */
  static serialize(state) {
    const tree = {};

    // Serialize ID mappings (sharded by prefix)
    const idShards = {};
    for (const [sha, id] of state.shaToId) {
      const prefix = sha.substring(0, 2);
      if (!idShards[prefix]) {
        idShards[prefix] = {};
      }
      idShards[prefix][sha] = id;
    }
    for (const [prefix, map] of Object.entries(idShards)) {
      tree[`meta_${prefix}.json`] = Buffer.from(JSON.stringify(map));
    }

    // Serialize bitmaps (sharded by prefix, per-node within shard)
    const bitmapShards = { fwd: {}, rev: {} };
    for (const [key, bitmap] of state.bitmaps) {
      const [type, sha] = [key.substring(0, 3), key.substring(4)];
      const prefix = sha.substring(0, 2);

      if (!bitmapShards[type][prefix]) {
        bitmapShards[type][prefix] = {};
      }
      // Encode bitmap as base64 for JSON storage
      bitmapShards[type][prefix][sha] = bitmap.serialize(true).toString('base64');
    }

    for (const type of ['fwd', 'rev']) {
      for (const [prefix, shardData] of Object.entries(bitmapShards[type])) {
        tree[`shards_${type}_${prefix}.json`] = Buffer.from(JSON.stringify(shardData));
      }
    }

    return tree;
  }
}
