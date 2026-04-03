import { IndexError, ShardLoadError, ShardCorruptionError, ShardValidationError } from '../../errors/index.js';
import defaultCrypto from '../../utils/defaultCrypto.js';
import nullLogger from '../../utils/nullLogger.js';
import LRUCache from '../../utils/LRUCache.js';
import { getRoaringBitmap32 } from '../../utils/roaring.js';
import { canonicalStringify } from '../../utils/canonicalStringify.js';
import { isValidShardOid } from '../../utils/validateShardOid.js';
import { base64Decode } from '../../utils/bytes.js';


/** @import { RoaringBitmapSubset as BitmapShard } from '../../utils/roaring.js' */
/** @typedef {import('../../../ports/IndexStoragePort.js').default} IndexStoragePort */
/** @typedef {import('../../types/WarpPersistence.js').IndexStorage} IndexStorage */


/** @typedef {Record<string, string | number>} JsonShard */

/** @typedef {JsonShard | BitmapShard} LoadedShard */

/**
 * Supported shard format versions for backward compatibility.
 * Version 1: Original format using JSON.stringify for checksums
 * Version 2: Uses canonicalStringify for deterministic checksums
 * @const {number[]}
 */
const SUPPORTED_SHARD_VERSIONS = [1, 2];

/**
 * Default maximum number of shards to cache.
 * @const {number}
 */
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
  return path.startsWith('meta_') && path.endsWith('.json');
}

/**
 * Creates an empty bitmap shard instance.
 * @returns {BitmapShard}
 */
function createEmptyBitmapShard() {
  return new (getRoaringBitmap32())();
}

/**
 * Computes a SHA-256 checksum of the given data.
 * Used to verify shard integrity on load.
 *
 * @param {Record<string, unknown>} data - The data object to checksum
 * @param {number} version - Shard version (1 uses JSON.stringify, 2+ uses canonicalStringify)
 * @param {import('../../../ports/CryptoPort.js').default} crypto - CryptoPort instance
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
const computeChecksum = async (data, version, crypto) => {
  const json = version === 1 ? JSON.stringify(data) : canonicalStringify(data);
  return await crypto.hash('sha256', json);
};

/**
 * Service for querying a loaded bitmap index.
 *
 * This service provides O(1) lookups for parent/child relationships
 * by lazily loading sharded bitmap data from storage. Shards are
 * cached after first access.
 *
 * **Strict Mode**: When `strict: true` is passed to the constructor,
 * the reader will throw errors on any shard validation failure:
 * - {@link ShardCorruptionError} for invalid shard format
 * - {@link ShardValidationError} for version or checksum mismatches
 *
 * In non-strict mode (strict: false), validation failures are logged as warnings
 * and an empty shard is returned for graceful degradation.
 *
 * **Note**: Storage errors (e.g., `storage.readBlob` failures) always throw
 * {@link ShardLoadError} regardless of strict mode.
 *
 * @example
 * // Strict mode (default) - throws on any validation failure
 * const reader = new BitmapIndexReader({ storage });
 * reader.setup(shardOids);
 * const parents = await reader.getParents('abc123...');
 *
 * @example
 * // Non-strict mode - graceful degradation on validation errors
 * const lenientReader = new BitmapIndexReader({ storage, strict: false });
 * lenientReader.setup(shardOids);
 * try {
 *   const parents = await lenientReader.getParents('abc123...');
 * } catch (err) {
 *   if (err instanceof ShardValidationError) {
 *     console.error('Shard validation failed:', err.field, err.expected, err.actual);
 *   }
 * }
 *
 * @throws {ShardLoadError} When storage.readBlob fails (always, regardless of strict mode)
 * @throws {ShardCorruptionError} When shard format is invalid (strict mode only)
 * @throws {ShardValidationError} When version or checksum validation fails (strict mode only)
 */
export default class BitmapIndexReader {
  /**
   * Creates a BitmapIndexReader instance.
   * @param {{ storage: IndexStoragePort, strict?: boolean, logger?: import('../../../ports/LoggerPort.js').default, maxCachedShards?: number, crypto?: import('../../../ports/CryptoPort.js').default }} options
   */
  constructor({ storage, strict = true, logger = nullLogger, maxCachedShards = DEFAULT_MAX_CACHED_SHARDS, crypto }) {
    BitmapIndexReader._assertStorage(storage);
    this.storage = /** @type {IndexStorage} */ (storage);
    this.strict = strict;
    this.logger = logger;
    this.maxCachedShards = maxCachedShards;
    /** @type {import('../../../ports/CryptoPort.js').default} */
    this._crypto = crypto ?? defaultCrypto;
    /** @type {Map<string, string>} */
    this.shardOids = new Map();
    /** @type {LRUCache<string, LoadedShard>} */
    this.loadedShards = new LRUCache(maxCachedShards);
    /** @type {string[]|null} */
    this._idToShaCache = null; // Lazy-built reverse mapping
  }

  /**
   * Validates that a storage adapter was provided.
   * @param {IndexStoragePort|null|undefined} storage
   * @throws {IndexError} If storage is null or undefined
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
   * The shardOids object maps shard filenames to their Git blob OIDs.
   * Shards are organized by type and SHA prefix:
   * - `meta_XX.json` - SHA→ID mappings for nodes with SHA prefix XX
   * - `shards_fwd_XX.json` - Forward edge bitmaps (parent→children)
   * - `shards_rev_XX.json` - Reverse edge bitmaps (child→parents)
   *
   * @param {Record<string, string>} shardOids - Map of shard path to blob OID
   * @returns {void}
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
    const path = `meta_${prefix}.json`;
    // Meta shards always map SHA→numeric ID (built by BitmapIndexBuilder)
    const idMap = /** @type {Record<string, number>} */ (await this._getOrLoadShard(path, 'json'));
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
   * Internal method to get edges (forward or reverse) for a node.
   * @param {string} sha - The node's SHA
   * @param {string} type - 'fwd' for children, 'rev' for parents
   * @returns {Promise<string[]>} Array of connected SHAs
   * @private
   */
  async _getEdges(sha, type) {
    const prefix = sha.substring(0, 2);
    const shardPath = `shards_${type}_${prefix}.json`;
    // Bitmap shards always map SHA→base64-encoded bitmap data
    const shard = /** @type {Record<string, string>} */ (await this._getOrLoadShard(shardPath, 'json'));

    const encoded = shard[sha];
    if (!isNonEmptyString(encoded)) {
      return [];
    }
    const ids = this._deserializeBitmapIds(encoded, shardPath);
    const idToSha = await this._buildIdToShaMapping();
    return ids.filter((id) => typeof idToSha[id] === 'string').map((id) => /** @type {string} */ (idToSha[id]));
  }

  /**
   * Deserializes base64-encoded bitmap data into numeric ids.
   * @param {string} encoded
   * @param {string} shardPath
   * @returns {number[]}
   * @private
   */
  _deserializeBitmapIds(encoded, shardPath) {
    const buffer = base64Decode(encoded);
    try {
      const RoaringBitmap32 = getRoaringBitmap32();
      const bitmap = RoaringBitmap32.deserialize(buffer, true);
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
      this._handleShardError(corruptionError, {
        path: shardPath,
        oid: shardOid,
        format: 'json',
      });
      return [];
    }
  }

  /**
   * Builds the ID -> SHA reverse mapping by loading all meta shards.
   * @returns {Promise<string[]>} Array where index is ID and value is SHA
   * @private
   */
  async _buildIdToShaMapping() {
    if (this._idToShaCache !== null) {
      return this._idToShaCache;
    }
    /** @type {string[]} */
    const idToShaCache = [];
    this._idToShaCache = idToShaCache;
    await this._populateIdToShaCache(idToShaCache);
    this._warnLargeIdCache(idToShaCache.length);
    return idToShaCache;
  }

  /**
   * Populates the reverse id-to-sha cache from all metadata shards.
   * @param {string[]} idToShaCache
   * @returns {Promise<void>}
   * @private
   */
  async _populateIdToShaCache(idToShaCache) {
    for (const [path] of this.shardOids) {
      if (!isMetaShardPath(path)) {
        continue;
      }
      const shard = /** @type {Record<string, number>} */ (await this._getOrLoadShard(path, 'json'));
      for (const [sha, id] of Object.entries(shard)) {
        idToShaCache[id] = sha;
      }
    }
  }

  /**
   * Logs a warning when the id-to-sha cache grows unusually large.
   * @param {number} entryCount
   * @returns {void}
   * @private
   */
  _warnLargeIdCache(entryCount) {
    if (entryCount <= LARGE_ID_CACHE_WARNING_THRESHOLD) {
      return;
    }
    this.logger.warn('ID-to-SHA cache has high memory usage', {
      operation: '_buildIdToShaMapping',
      entryCount,
      estimatedMemoryBytes: entryCount * ESTIMATED_ID_CACHE_ENTRY_BYTES,
      message: `Cache contains ${entryCount} entries (~${ESTIMATED_ID_CACHE_ENTRY_BYTES} bytes per entry). Consider pagination or streaming for very large graphs.`,
    });
  }

  /**
   * Validates a shard envelope for version and checksum integrity.
   *
   * @param {{ data?: Record<string, string | number>, version?: number, checksum?: string }} envelope - The shard envelope to validate
   * @param {string} path - Shard path (for error context)
   * @param {string} oid - Object ID (for error context)
   * @returns {Promise<Record<string, string | number>>} The validated data from the envelope
   * @throws {ShardCorruptionError} If envelope format is invalid
   * @throws {ShardValidationError} If version or checksum validation fails
   * @private
   */
  async _validateShard(envelope, path, oid) {
    this._assertShardEnvelopeObject(envelope, path, oid);
    const data = this._getShardEnvelopeData(envelope, path, oid);
    const version = this._getShardEnvelopeVersion(envelope, path);
    await this._assertShardChecksum({ data, version, expectedChecksum: envelope.checksum, path });
    return data;
  }

  /**
   * Ensures the shard envelope is an object before deeper validation.
   * @param {{ data?: JsonShard, version?: number, checksum?: string }} envelope
   * @param {string} path
   * @param {string} oid
   * @returns {void}
   * @private
   */
  _assertShardEnvelopeObject(envelope, path, oid) {
    if (envelope === null || typeof envelope !== 'object') {
      throw new ShardCorruptionError('Invalid shard format', {
        shardPath: path,
        oid,
        reason: 'not_an_object',
      });
    }
  }

  /**
   * Extracts and validates the `data` portion of a shard envelope.
   * @param {{ data?: JsonShard }} envelope
   * @param {string} path
   * @param {string} oid
   * @returns {JsonShard}
   * @private
   */
  _getShardEnvelopeData(envelope, path, oid) {
    const { data } = envelope;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new ShardCorruptionError('Invalid or missing data field', {
        shardPath: path,
        oid,
        reason: 'missing_or_invalid_data',
      });
    }
    return data;
  }

  /**
   * Extracts and validates the shard format version.
   * @param {{ version?: number }} envelope
   * @param {string} path
   * @returns {number}
   * @private
   */
  _getShardEnvelopeVersion(envelope, path) {
    const { version } = envelope;
    if (typeof version !== 'number' || !SUPPORTED_SHARD_VERSIONS.includes(version)) {
      throw new ShardValidationError('Unsupported version', {
        shardPath: path,
        expected: SUPPORTED_SHARD_VERSIONS,
        actual: version,
        field: 'version',
      });
    }
    return version;
  }

  /**
   * Verifies the stored shard checksum against the recomputed checksum.
   * @param {{ data: JsonShard, version: number, expectedChecksum: string | undefined, path: string }} opts
   * @returns {Promise<void>}
   * @private
   */
  async _assertShardChecksum({ data, version, expectedChecksum, path }) {
    const actualChecksum = await computeChecksum(data, version, this._crypto);
    if (expectedChecksum !== actualChecksum) {
      throw new ShardValidationError('Checksum mismatch', {
        shardPath: path,
        expected: expectedChecksum,
        actual: actualChecksum,
        field: 'checksum',
      });
    }
  }

  /**
   * Handles validation/corruption errors based on strict mode.
   * @param {ShardCorruptionError|ShardValidationError} err - The error to handle
   * @param {{ path: string, oid: string, format: string }} context - Error context
   * @returns {Record<string, string | number> | import('../../utils/roaring.js').RoaringBitmapSubset} Empty shard (non-strict mode only)
   * @throws {ShardCorruptionError|ShardValidationError} In strict mode
   * @private
   */
  _handleShardError(err, { path, oid, format }) {
    if (this.strict) {
      throw err;
    }
    const details = this._getShardValidationDetails(err);
    this.logger.warn('Shard validation warning', {
      operation: 'loadShard',
      shardPath: path,
      oid,
      error: err.message,
      code: err.code,
      field: details.field,
      expected: details.expected,
      actual: details.actual,
    });
    const emptyShard = this._createEmptyShard(format);
    this.loadedShards.set(path, emptyShard);
    return emptyShard;
  }

  /**
   * Extracts optional validation metadata from a shard error.
   * @param {ShardCorruptionError|ShardValidationError} err
   * @returns {{ field?: string, expected?: unknown, actual?: unknown }}
   * @private
   */
  _getShardValidationDetails(err) {
    if (err instanceof ShardValidationError) {
      return {
        ...(err.field !== undefined ? { field: err.field } : {}),
        ...(err.expected !== undefined ? { expected: err.expected } : {}),
        ...(err.actual !== undefined ? { actual: err.actual } : {}),
      };
    }
    return {};
  }

  /**
   * Creates an empty shard matching the requested format.
   * @param {string} format
   * @returns {LoadedShard}
   * @private
   */
  _createEmptyShard(format) {
    return format === 'json' ? {} : createEmptyBitmapShard();
  }

  /**
   * Parses and validates a shard buffer.
   * @param {Uint8Array} buffer - Raw shard buffer
   * @param {string} path - Shard path (for error context)
   * @param {string} oid - Object ID (for error context)
   * @returns {Promise<Record<string, string | number>>} The validated data from the shard
   * @throws {ShardCorruptionError} If parsing fails or format is invalid
   * @throws {ShardValidationError} If version or checksum validation fails
   * @private
   */
  async _parseAndValidateShard(buffer, path, oid) {
    /** @type {unknown} */
    const parsed = JSON.parse(new TextDecoder().decode(buffer));
    const envelope = /** @type {{ data?: JsonShard, version?: number, checksum?: string }} */ (parsed);
    return await this._validateShard(envelope, path, oid);
  }

  /**
   * Loads raw buffer from storage.
   * @param {string} path - Shard path
   * @param {string} oid - Object ID
   * @returns {Promise<Uint8Array>} Raw buffer
   * @throws {ShardLoadError} When storage.readBlob fails
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

  /**
   * Wraps an error as a ShardCorruptionError if it's a SyntaxError.
   * Returns the original error otherwise.
   * @param {Error} err - The error to potentially wrap
   * @param {string} path - Shard path
   * @param {string} oid - Object ID
   * @returns {Error} The wrapped or original error
   * @private
   */
  _wrapParseError(err, path, oid) {
    if (err instanceof SyntaxError) {
      return new ShardCorruptionError('Failed to parse shard JSON', {
        shardPath: path,
        oid,
        reason: 'parse_error',
      });
    }
    return err;
  }

  /**
   * Attempts to handle a shard error based on its type.
   * Returns handled result for validation/corruption errors, null otherwise.
   * @param {unknown} err - The error to handle
   * @param {{ path: string, oid: string, format: string }} context - Error context
   * @returns {Record<string, string | number> | import('../../utils/roaring.js').RoaringBitmapSubset | null} Handled result or null if error should be re-thrown
   * @private
   */
  _tryHandleShardError(err, context) {
    if (!(err instanceof Error)) { return null; }
    const wrappedErr = this._wrapParseError(err, context.path, context.oid);
    const isHandleable = wrappedErr instanceof ShardCorruptionError ||
                         wrappedErr instanceof ShardValidationError;
    return isHandleable ? this._handleShardError(wrappedErr, context) : null;
  }

  /**
   * Loads a shard with validation and configurable error handling.
   *
   * In strict mode, throws on any validation failure.
   * In non-strict mode, logs warnings and returns empty shards on validation failures.
   * Storage errors always throw ShardLoadError regardless of mode.
   *
   * @param {string} path - Shard path
   * @param {string} format - 'json' or 'bitmap'
   * @returns {Promise<Record<string, string | number> | import('../../utils/roaring.js').RoaringBitmapSubset>}
   * @throws {ShardLoadError} When storage.readBlob fails
   * @throws {ShardCorruptionError} When shard format is invalid (strict mode only)
   * @throws {ShardValidationError} When version or checksum validation fails (strict mode only)
   * @private
   */
  async _getOrLoadShard(path, format) {
    const cachedShard = this.loadedShards.get(path);
    if (cachedShard !== undefined) {
      return cachedShard;
    }

    const oid = this.shardOids.get(path);
    if (!isNonEmptyString(oid)) {
      return this._createEmptyShard(format);
    }

    const buffer = await this._loadShardBuffer(path, oid);
    const context = { path, oid, format };

    try {
      const data = await this._parseAndValidateShard(buffer, path, oid);
      this.loadedShards.set(path, data);
      return data;
    } catch (err) {
      const handled = this._tryHandleShardError(err, context);
      if (handled !== null) {
        return handled;
      }
      throw err;
    }
  }
}
