import { IndexError, ShardLoadError, ShardCorruptionError } from '../../errors/index.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import nullLogger from '../../utils/nullLogger.ts';
import LRUCache from '../../utils/LRUCache.ts';
import { getRoaringBitmap32 } from '../../utils/roaring.ts';
import { isValidShardOid } from '../../utils/validateShardOid.ts';

/** @typedef {import('../../../ports/IndexStoragePort.ts').default} IndexStoragePort */

/** @typedef {Record<string, number> | Record<string, Uint8Array>} LoadedShard */

/** Default maximum number of shards to cache. */
const DEFAULT_MAX_CACHED_SHARDS = 100;
const LARGE_ID_CACHE_WARNING_THRESHOLD = 1_000_000;
const ESTIMATED_ID_CACHE_ENTRY_BYTES = 40;

/**
 * Checks whether a value is a non-empty string.
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Checks whether a shard path points at a metadata shard.
 * @param {string} path
 * @returns {boolean}
 */
function isMetaShardPath(path) {
  return path.startsWith('meta_') && path.endsWith('.cbor');
}

/**
 * Service for querying a loaded bitmap index.
 *
 * Provides O(1) lookups for parent/child relationships by lazily loading
 * sharded CBOR bitmap data from storage. Shards are cached after first access.
 *
 * Shard format: plain CBOR (no envelopes). git-cas handles integrity
 * at the storage layer.
 *
 * @example
 * const reader = new BitmapIndexReader({ storage });
 * reader.setup(shardOids);
 * const parents = await reader.getParents('abc123...');
 */
export default class BitmapIndexReader {
  /**
   * Creates a BitmapIndexReader instance.
   * @param {{ storage: IndexStoragePort, strict?: boolean, logger?: import('../../../ports/LoggerPort.ts').default, maxCachedShards?: number, codec?: import('../../../ports/CodecPort.ts').default }} options
   */
  constructor({ storage, strict = true, logger = nullLogger, maxCachedShards = DEFAULT_MAX_CACHED_SHARDS, codec }) {
    BitmapIndexReader._assertStorage(storage);
    this.storage = storage;
    this.strict = strict;
    this.logger = logger;
    this.maxCachedShards = maxCachedShards;
    /** @type {import('../../../ports/CodecPort.ts').default} */
    this._codec = codec ?? defaultCodec;
    /** @type {Map<string, string>} */
    this.shardOids = new Map();
    /** @type {LRUCache<string, LoadedShard>} */
    this.loadedShards = new LRUCache(maxCachedShards);
    /** @type {string[]|null} */
    this._idToShaCache = null;
  }

  /**
   * Validates that a storage adapter was provided.
   * @param {IndexStoragePort|null|undefined} storage
   * @private
   */
  static _assertStorage(storage) {
    if (storage === null || storage === undefined) {
      throw new IndexError('BitmapIndexReader requires a storage adapter', {
        code: 'E_INDEX_STORAGE_REQUIRED',
      });
    }
  }

  /**
   * Configures the reader with shard OID mappings for lazy loading.
   *
   * @param {Record<string, string>} shardOids - Map of shard path to blob OID
   */
  setup(shardOids) {
    const entries = Object.entries(shardOids);
    /** @type {[string, string][]} */
    const validEntries = [];
    for (const [path, oid] of entries) {
      if (isValidShardOid(oid)) {
        validEntries.push([path, oid]);
      } else if (this.strict) {
        throw new ShardCorruptionError('Invalid shard OID', {
          shardPath: path,
          oid,
          reason: 'invalid_oid',
        });
      } else {
        this.logger.warn('Skipping shard with invalid OID', {
          operation: 'setup',
          shardPath: path,
          oid,
          reason: 'invalid_oid',
        });
      }
    }
    this.shardOids = new Map(validEntries);
    this._idToShaCache = null;
    this.loadedShards.clear();
  }

  /**
   * Looks up the numeric ID for a SHA.
   * @param {string} sha - The 40-character SHA
   * @returns {Promise<number|undefined>} The numeric ID or undefined
   */
  async lookupId(sha) {
    const prefix = sha.substring(0, 2);
    const path = `meta_${prefix}.cbor`;
    const idMap = /** @type {Record<string, number>} */ (await this._getOrLoadShard(path));
    return idMap[sha];
  }

  /**
   * Gets parent SHAs for a node (O(1) via reverse bitmap).
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of parent SHAs
   */
  async getParents(sha) {
    return await this._getEdges(sha, 'rev');
  }

  /**
   * Gets child SHAs for a node (O(1) via forward bitmap).
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of child SHAs
   */
  async getChildren(sha) {
    return await this._getEdges(sha, 'fwd');
  }

  /**
   * Gets edges in the given direction for a node.
   * @param {string} sha
   * @param {string} type - 'fwd' or 'rev'
   * @returns {Promise<string[]>}
   * @private
   */
  async _getEdges(sha, type) {
    const prefix = sha.substring(0, 2);
    const shardPath = `shards_${type}_${prefix}.cbor`;
    const shard = /** @type {Record<string, Uint8Array>} */ (await this._getOrLoadShard(shardPath));

    const bitmapBytes = shard[sha];
    if (!bitmapBytes || !(bitmapBytes instanceof Uint8Array) || bitmapBytes.length === 0) {
      return [];
    }
    const ids = this._deserializeBitmapIds(bitmapBytes, shardPath);
    const idToSha = await this._buildIdToShaMapping();
    return ids.filter((id) => typeof idToSha[id] === 'string').map((id) => /** @type {string} */ (idToSha[id]));
  }

  /**
   * Deserializes raw bitmap bytes into numeric IDs.
   * @param {Uint8Array} bitmapBytes
   * @param {string} shardPath
   * @returns {number[]}
   * @private
   */
  _deserializeBitmapIds(bitmapBytes, shardPath) {
    try {
      const RoaringBitmap32 = getRoaringBitmap32();
      const bitmap = RoaringBitmap32.deserialize(bitmapBytes, true);
      return bitmap.toArray();
    } catch (err) {
      const oid = this.shardOids.get(shardPath);
      const shardOid = isNonEmptyString(oid) ? oid : shardPath;
      const corruptionError = new ShardCorruptionError('Failed to deserialize bitmap', {
        shardPath,
        oid: shardOid,
        reason: 'bitmap_deserialize_error',
        context: { originalError: err instanceof Error ? err.message : String(err) },
      });
      if (this.strict) {
        throw corruptionError;
      }
      this.logger.warn('Bitmap deserialization failed', {
        operation: 'deserializeBitmap',
        shardPath,
        oid: shardOid,
      });
      return [];
    }
  }

  /**
   * Builds the ID → SHA reverse mapping by loading all meta shards.
   * @returns {Promise<string[]>}
   * @private
   */
  async _buildIdToShaMapping() {
    if (this._idToShaCache !== null) {
      return this._idToShaCache;
    }
    /** @type {string[]} */
    const cache = [];
    this._idToShaCache = cache;

    for (const [path] of this.shardOids) {
      if (!isMetaShardPath(path)) {
        continue;
      }
      const shard = /** @type {Record<string, number>} */ (await this._getOrLoadShard(path));
      for (const [sha, id] of Object.entries(shard)) {
        cache[/** @type {number} */ (id)] = sha;
      }
    }

    this._warnLargeIdCache(cache.length);
    return cache;
  }

  /**
   * Emits a warning when the ID→SHA cache exceeds the size threshold.
   * @param {number} entryCount
   * @private
   */
  _warnLargeIdCache(entryCount) {
    if (entryCount < LARGE_ID_CACHE_WARNING_THRESHOLD) {
      return;
    }
    this.logger.warn('ID-to-SHA cache has high memory usage', {
      operation: '_buildIdToShaMapping',
      entryCount,
      estimatedMemoryBytes: entryCount * ESTIMATED_ID_CACHE_ENTRY_BYTES,
    });
  }

  /**
   * Loads a shard via storage, decodes CBOR, and caches the result.
   *
   * @param {string} path - Shard path
   * @returns {Promise<LoadedShard>}
   * @private
   */
  async _getOrLoadShard(path) {
    const cached = this.loadedShards.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const oid = this.shardOids.get(path);
    if (!isNonEmptyString(oid)) {
      return {};
    }
    const buffer = await this._loadShardBuffer(path, oid);
    return this._decodeAndCacheShard(buffer, path, oid);
  }

  /**
   * Decodes a raw shard buffer and caches the result.
   * @param {Uint8Array} buffer
   * @param {string} path
   * @param {string} oid
   * @returns {LoadedShard}
   * @private
   */
  _decodeAndCacheShard(buffer, path, oid) {
    try {
      const data = /** @type {LoadedShard} */ (this._codec.decode(buffer));
      this.loadedShards.set(path, data);
      return data;
    } catch (err) {
      return this._handleDecodeError(err, path, oid);
    }
  }

  /**
   * Handles a CBOR decode failure based on strict mode.
   * @param {unknown} err
   * @param {string} path
   * @param {string} oid
   * @returns {LoadedShard}
   * @private
   */
  _handleDecodeError(err, path, oid) {
    const corruptionError = new ShardCorruptionError('Failed to decode shard', {
      shardPath: path,
      oid,
      reason: 'decode_error',
      context: { originalError: err instanceof Error ? err.message : String(err) },
    });
    if (this.strict) {
      throw corruptionError;
    }
    this.logger.warn('Shard decode failed', {
      operation: 'loadShard',
      shardPath: path,
      oid,
    });
    return {};
  }

  /**
   * Loads raw buffer from storage.
   * @param {string} path
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   * @private
   */
  async _loadShardBuffer(path, oid) {
    try {
      return await this.storage.readBlob(oid);
    } catch (cause) {
      throw new ShardLoadError('Failed to load shard from storage', {
        shardPath: path,
        oid,
        cause: /** @type {Error} */ (cause),
      });
    }
  }
}
