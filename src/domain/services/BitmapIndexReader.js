import { createHash } from 'crypto';
import { ShardLoadError, ShardCorruptionError, ShardValidationError } from '../errors/index.js';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import LRUCache from '../utils/LRUCache.js';
import { getRoaringBitmap32 } from '../utils/roaring.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';

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

/**
 * Computes a SHA-256 checksum of the given data.
 * Used to verify shard integrity on load.
 *
 * @param {Object} data - The data object to checksum
 * @param {number} [version=2] - Shard version (1 uses JSON.stringify, 2+ uses canonicalStringify)
 * @returns {string} Hex-encoded SHA-256 hash
 */
const computeChecksum = (data, version = 2) => {
  const json = version === 1 ? JSON.stringify(data) : canonicalStringify(data);
  return createHash('sha256').update(json).digest('hex');
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
 * In non-strict mode (default), validation failures are logged as warnings
 * and an empty shard is returned for graceful degradation.
 *
 * **Note**: Storage errors (e.g., `storage.readBlob` failures) always throw
 * {@link ShardLoadError} regardless of strict mode.
 *
 * @example
 * // Non-strict mode (default) - graceful degradation on validation errors
 * const reader = new BitmapIndexReader({ storage });
 * reader.setup(shardOids);
 * const parents = await reader.getParents('abc123...');
 *
 * @example
 * // Strict mode - throws on any validation failure
 * const strictReader = new BitmapIndexReader({ storage, strict: true });
 * strictReader.setup(shardOids);
 * try {
 *   const parents = await strictReader.getParents('abc123...');
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
   * @param {Object} options
   * @param {import('../../ports/IndexStoragePort.js').default} options.storage - Storage adapter for reading index data
   * @param {boolean} [options.strict=false] - If true, throw errors on validation failures; if false, log warnings and return empty shards
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging.
   *   Defaults to NoOpLogger (no logging).
   * @param {number} [options.maxCachedShards=100] - Maximum number of shards to keep in the LRU cache.
   *   When exceeded, least recently used shards are evicted to free memory.
   */
  constructor({ storage, strict = false, logger = new NoOpLogger(), maxCachedShards = DEFAULT_MAX_CACHED_SHARDS } = {}) {
    if (!storage) {
      throw new Error('BitmapIndexReader requires a storage adapter');
    }
    this.storage = storage;
    this.strict = strict;
    this.logger = logger;
    this.maxCachedShards = maxCachedShards;
    this.shardOids = new Map(); // path -> OID
    this.loadedShards = new LRUCache(maxCachedShards); // path -> Data
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
    const shard = await this._getOrLoadShard(shardPath, 'json');

    const encoded = shard[sha];
    if (!encoded) {
      return [];
    }

    // Decode base64 bitmap and extract IDs
    const buffer = Buffer.from(encoded, 'base64');
    let ids;
    try {
      const RoaringBitmap32 = getRoaringBitmap32();
      const bitmap = RoaringBitmap32.deserialize(buffer, true);
      ids = bitmap.toArray();
    } catch (err) {
      const corruptionError = new ShardCorruptionError('Failed to deserialize bitmap', {
        shardPath,
        oid: this.shardOids.get(shardPath),
        reason: 'bitmap_deserialize_error',
        originalError: err.message,
      });
      this._handleShardError(corruptionError, {
        path: shardPath,
        oid: this.shardOids.get(shardPath),
        format: 'json',
      });
      return [];
    }

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

    const entryCount = this._idToShaCache.length;
    if (entryCount > 1_000_000) {
      this.logger.warn('ID-to-SHA cache has high memory usage', {
        operation: '_buildIdToShaMapping',
        entryCount,
        estimatedMemoryBytes: entryCount * 40,
        message: `Cache contains ${entryCount} entries (~40 bytes per entry). Consider pagination or streaming for very large graphs.`,
      });
    }

    return this._idToShaCache;
  }

  /**
   * Validates a shard envelope for version and checksum integrity.
   *
   * @param {Object} envelope - The shard envelope to validate
   * @param {string} path - Shard path (for error context)
   * @param {string} oid - Object ID (for error context)
   * @returns {Object} The validated data from the envelope
   * @throws {ShardCorruptionError} If envelope format is invalid
   * @throws {ShardValidationError} If version or checksum validation fails
   * @private
   */
  _validateShard(envelope, path, oid) {
    if (!envelope || typeof envelope !== 'object') {
      throw new ShardCorruptionError('Invalid shard format', {
        shardPath: path,
        oid,
        reason: 'not_an_object',
      });
    }
    // Validate data field exists and is an object
    if (typeof envelope.data !== 'object' || envelope.data === null || Array.isArray(envelope.data)) {
      throw new ShardCorruptionError('Invalid or missing data field', {
        shardPath: path,
        oid,
        reason: 'missing_or_invalid_data',
      });
    }
    if (!SUPPORTED_SHARD_VERSIONS.includes(envelope.version)) {
      throw new ShardValidationError('Unsupported version', {
        shardPath: path,
        expected: SUPPORTED_SHARD_VERSIONS,
        actual: envelope.version,
        field: 'version',
      });
    }
    // Use version-appropriate checksum computation for backward compatibility
    const actualChecksum = computeChecksum(envelope.data, envelope.version);
    if (envelope.checksum !== actualChecksum) {
      throw new ShardValidationError('Checksum mismatch', {
        shardPath: path,
        expected: envelope.checksum,
        actual: actualChecksum,
        field: 'checksum',
      });
    }
    return envelope.data;
  }

  /**
   * Handles validation/corruption errors based on strict mode.
   * @param {ShardCorruptionError|ShardValidationError} err - The error to handle
   * @param {Object} context - Error context
   * @param {string} context.path - Shard path
   * @param {string} context.oid - Object ID
   * @param {string} context.format - 'json' or 'bitmap'
   * @returns {Object|RoaringBitmap32} Empty shard (non-strict mode only)
   * @throws {ShardCorruptionError|ShardValidationError} In strict mode
   * @private
   */
  _handleShardError(err, { path, oid, format }) {
    if (this.strict) {
      throw err;
    }
    this.logger.warn('Shard validation warning', {
      operation: 'loadShard',
      shardPath: path,
      oid,
      error: err.message,
      code: err.code,
      field: err.field,
      expected: err.expected,
      actual: err.actual,
    });
    const emptyShard = format === 'json' ? {} : new (getRoaringBitmap32())();
    this.loadedShards.set(path, emptyShard);
    return emptyShard;
  }

  /**
   * Parses and validates a shard buffer.
   * @param {Buffer} buffer - Raw shard buffer
   * @param {string} path - Shard path (for error context)
   * @param {string} oid - Object ID (for error context)
   * @returns {Object} The validated data from the shard
   * @throws {ShardCorruptionError} If parsing fails or format is invalid
   * @throws {ShardValidationError} If version or checksum validation fails
   * @private
   */
  _parseAndValidateShard(buffer, path, oid) {
    const envelope = JSON.parse(new TextDecoder().decode(buffer));
    return this._validateShard(envelope, path, oid);
  }

  /**
   * Loads raw buffer from storage.
   * @param {string} path - Shard path
   * @param {string} oid - Object ID
   * @returns {Promise<Buffer>} Raw buffer
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
        cause,
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
   * @param {Error} err - The error to handle
   * @param {Object} context - Error context
   * @returns {Object|RoaringBitmap32|null} Handled result or null if error should be re-thrown
   * @private
   */
  _tryHandleShardError(err, context) {
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
   * @returns {Promise<Object|RoaringBitmap32>}
   * @throws {ShardLoadError} When storage.readBlob fails
   * @throws {ShardCorruptionError} When shard format is invalid (strict mode only)
   * @throws {ShardValidationError} When version or checksum validation fails (strict mode only)
   * @private
   */
  async _getOrLoadShard(path, format) {
    if (this.loadedShards.has(path)) {
      return this.loadedShards.get(path);
    }

    const oid = this.shardOids.get(path);
    const emptyShard = format === 'json' ? {} : new (getRoaringBitmap32())();
    if (!oid) {
      return emptyShard;
    }

    const buffer = await this._loadShardBuffer(path, oid);
    const context = { path, oid, format };

    try {
      const data = this._parseAndValidateShard(buffer, path, oid);
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
