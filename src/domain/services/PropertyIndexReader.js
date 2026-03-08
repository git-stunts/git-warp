/**
 * Reads property index shards lazily with LRU caching.
 *
 * Loads `props_XX.cbor` shards on demand via IndexStoragePort.readBlob.
 *
 * @module domain/services/PropertyIndexReader
 */

import defaultCodec from '../utils/defaultCodec.js';
import computeShardKey from '../utils/shardKey.js';
import LRUCache from '../utils/LRUCache.js';

export default class PropertyIndexReader {
  /**
   * @param {{ storage?: import('../../ports/IndexStoragePort.js').default, codec?: import('../../ports/CodecPort.js').default, maxCachedShards?: number }} [options]
   */
  constructor({ storage, codec, maxCachedShards = 64 } = /** @type {{ storage?: import('../../ports/IndexStoragePort.js').default, codec?: import('../../ports/CodecPort.js').default, maxCachedShards?: number }} */ ({})) {
    this._storage = storage;
    this._codec = codec || defaultCodec;
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

    const oid = this._shardOids.get(path);
    if (!oid) {
      return null;
    }

    if (!this._storage) {
      return null;
    }

    const buffer = await /** @type {{ readBlob(oid: string): Promise<Uint8Array|undefined|null> }} */ (this._storage).readBlob(oid);
    if (buffer === null || buffer === undefined) {
      throw new Error(`PropertyIndexReader: missing blob for OID '${oid}' (${path})`);
    }
    const decoded = this._codec.decode(buffer);

    // Shards are stored as array of [nodeId, props] pairs (proto-safe)
    if (!Array.isArray(decoded)) {
      const shape = decoded === null ? 'null' : typeof decoded;
      throw new Error(`PropertyIndexReader: invalid shard format for '${path}' (expected array, got ${shape})`);
    }

    /** @type {Record<string, Record<string, unknown>>} */
    const data = Object.create(null);
    for (const [nid, props] of /** @type {Array<[string, Record<string, unknown>]>} */ (decoded)) {
      data[nid] = props;
    }
    this._cache.set(path, data);
    return data;
  }
}
