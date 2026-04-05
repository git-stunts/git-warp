/**
 * Reads property index shards lazily with LRU caching.
 *
 * Loads `props_XX.cbor` shards on demand via IndexStoragePort.readBlob.
 *
 * @module domain/services/index/PropertyIndexReader
 */

import defaultCodec from '../../utils/defaultCodec.js';
import computeShardKey from '../../utils/shardKey.js';
import LRUCache from '../../utils/LRUCache.js';

/**
 * Creates a prototype-less record for safe property storage.
 * @returns {Record<string, Record<string, unknown>>}
 */
function createNullRecord() {
  /** @type {Record<string, Record<string, unknown>>} */
  const record = {};
  return record;
}

export default class PropertyIndexReader {
  /**
   * Constructs a PropertyIndexReader with optional storage, codec, indexStore, and cache size.
   * @param {{ storage?: import('../../../ports/IndexStoragePort.js').default, codec?: import('../../../ports/CodecPort.js').default, indexStore?: import('../../../ports/IndexStorePort.js').default, maxCachedShards?: number }} [options]
   */
  constructor({ storage, codec, indexStore, maxCachedShards = 64 } = /** @type {{ storage?: import('../../../ports/IndexStoragePort.js').default, codec?: import('../../../ports/CodecPort.js').default, indexStore?: import('../../../ports/IndexStorePort.js').default, maxCachedShards?: number }} */ ({})) {
    this._storage = storage;
    this._codec = codec || defaultCodec;
    /** @type {import('../../../ports/IndexStorePort.js').default|null} */
    this._indexStore = indexStore || null;
    /** @type {Map<string, string>} path → oid */
    this._shardOids = new Map();
    /** @type {LRUCache<string, Record<string, Record<string, unknown>>>} */
    this._cache = new LRUCache(maxCachedShards);
  }

  /**
   * Configures OID mappings for lazy loading.
   *
   * @param {Record<string, string>} shardOids - path → blob OID
   */
  setup(shardOids) {
    this._shardOids = new Map(Object.entries(shardOids));
    this._cache.clear();
  }

  /**
   * Returns all properties for a node, or null if not found.
   *
   * @param {string} nodeId
   * @returns {Promise<Record<string, unknown>|null>}
   */
  async getNodeProps(nodeId) {
    const shard = await this._loadShard(nodeId);
    if (!shard) {
      return null;
    }
    return shard[nodeId] ?? null;
  }

  /**
   * Returns a single property value, or undefined.
   *
   * @param {string} nodeId
   * @param {string} key
   * @returns {Promise<unknown|undefined>}
   */
  async getProperty(nodeId, key) {
    const props = await this.getNodeProps(nodeId);
    if (!props) {
      return undefined;
    }
    return props[key];
  }

  /**
   * Loads and caches a property shard by node ID.
   * @param {string} nodeId
   * @returns {Promise<Record<string, Record<string, unknown>>|null>}
   * @private
   */
  async _loadShard(nodeId) {
    const shardKey = computeShardKey(nodeId);
    const path = `props_${shardKey}.cbor`;

    const cached = this._cache.get(path);
    if (cached !== undefined) {
      return cached;
    }

    const oid = this._resolveOid(path);
    if (oid === null) {
      return null;
    }

    return await this._fetchAndDecode(oid, path);
  }

  /**
   * Resolves the blob OID for a shard path, or null if unavailable.
   * @param {string} path
   * @returns {string | null}
   * @private
   */
  _resolveOid(path) {
    const oid = this._shardOids.get(path);
    if (oid === undefined || oid === '') {
      return null;
    }
    if (!this._storage && !this._indexStore) {
      return null;
    }
    return oid;
  }

  /**
   * Fetches a blob by OID, decodes it, and caches the result.
   *
   * When an IndexStorePort is available, delegates read+decode to the
   * adapter (codec-free from the domain's perspective). Otherwise falls
   * back to raw storage + codec.
   *
   * @param {string} oid - Blob OID to read
   * @param {string} path - Shard path (for error messages and cache key)
   * @returns {Promise<Record<string, Record<string, unknown>>>}
   * @private
   */
  async _fetchAndDecode(oid, path) {
    if (this._indexStore) {
      const decoded = /** @type {unknown} */ (await this._indexStore.decodeShard(oid));
      return this._parseShard(decoded, path);
    }
    const buffer = await /** @type {{ readBlob(oid: string): Promise<Uint8Array|undefined|null> }} */ (this._storage).readBlob(oid);
    if (buffer === null || buffer === undefined) {
      throw new Error(`PropertyIndexReader: missing blob for OID '${oid}' (${path})`);
    }
    const decoded = /** @type {unknown} */ (this._codec.decode(buffer));
    return this._parseShard(decoded, path);
  }

  /**
   * Parses a decoded shard value into a keyed record and caches it.
   * @param {unknown} decoded - Decoded CBOR value
   * @param {string} path - Shard path for cache key and error messages
   * @returns {Record<string, Record<string, unknown>>}
   * @private
   */
  _parseShard(decoded, path) {
    if (!Array.isArray(decoded)) {
      const shape = decoded === null ? 'null' : typeof decoded;
      throw new Error(`PropertyIndexReader: invalid shard format for '${path}' (expected array, got ${shape})`);
    }

    const data = createNullRecord();
    for (const [nid, props] of /** @type {Array<[string, Record<string, unknown>]>} */ (decoded)) {
      data[nid] = props;
    }
    this._cache.set(path, data);
    return data;
  }
}
