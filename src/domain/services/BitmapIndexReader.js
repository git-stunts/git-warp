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
   * Configures the reader with shard OID mappings.
   * Call this after loading a tree to set up lazy loading.
   * @param {Record<string, string>} shardOids - Map of shard path to blob OID
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
