import roaring from 'roaring';
const { RoaringBitmap32 } = roaring;

/**
 * Service for querying a loaded bitmap index.
 *
 * This service provides O(1) lookups for parent/child relationships
 * by lazily loading sharded bitmap data from storage. Shards are
 * cached after first access.
 *
 * @example
 * const reader = new BitmapIndexReader({ storage });
 * reader.setup(shardOids);
 * const parents = await reader.getParents('abc123...');
 */
export default class BitmapIndexReader {
  /**
   * Creates a BitmapIndexReader instance.
   * @param {Object} options
   * @param {import('../../ports/IndexStoragePort.js').default} options.storage - Storage adapter for reading index data
   */
  constructor({ storage } = {}) {
    this.storage = storage;
    this.shardOids = new Map(); // path -> OID
    this.loadedShards = new Map(); // path -> Data
    this._idToShaCache = null; // Lazy-built reverse mapping
  }

  /**
   * Configures the reader with shard OID mappings for lazy loading.
   *
   * The shardOids object maps shard filenames to their Git blob OIDs.
   * Shards are organized by type and SHA prefix:
   * - `meta_XX.json` - SHA→ID mappings for nodes with SHA prefix XX
   * - `shards_fwd_XX.json` - Forward edge bitmaps (parent→children)
   * - `shards_rev_XX.json` - Reverse edge bitmaps (child→parents)
   *
   * @param {Record<string, string>} shardOids - Map of shard path to blob OID
   * @example
   * // Typical shardOids structure from IndexRebuildService.load()
   * reader.setup({
   *   'meta_ab.json': 'a1b2c3d4e5f6...',
   *   'meta_cd.json': 'f6e5d4c3b2a1...',
   *   'shards_fwd_ab.json': '1234567890ab...',
   *   'shards_rev_ab.json': 'abcdef123456...',
   *   'shards_fwd_cd.json': '0987654321fe...',
   *   'shards_rev_cd.json': 'fedcba098765...'
   * });
   *
   * // After setup, queries will lazy-load only the shards needed
   * const parents = await reader.getParents('abcd1234...'); // loads meta_ab, shards_rev_ab
   */
  setup(shardOids) {
    this.shardOids = new Map(Object.entries(shardOids));
    this._idToShaCache = null; // Clear cache when shards change
    this.loadedShards.clear();
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
      const buffer = await this.storage.readBlob(oid);
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
}
