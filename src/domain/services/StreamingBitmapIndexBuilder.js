import { createHash } from 'crypto';

import ShardCorruptionError from '../errors/ShardCorruptionError.js';
import ShardValidationError from '../errors/ShardValidationError.js';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import { checkAborted } from '../utils/cancellation.js';
import { getRoaringBitmap32 } from '../utils/roaring.js';
import { encode as cborEncode } from '../../infrastructure/codecs/CborCodec.js';

/**
 * Produces canonical JSON with lexicographically sorted keys at all levels.
 * @param {*} value - Value to serialize
 * @returns {string} Canonical JSON string
 */
function canonicalJson(value) {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}

/**
 * Current shard format version.
 * @const {number}
 */
export const SHARD_VERSION = 1;

/**
 * Default memory threshold before flushing (50MB).
 * @const {number}
 */
const DEFAULT_MAX_MEMORY_BYTES = 50 * 1024 * 1024;

/**
 * Estimated bytes per SHA→ID mapping entry.
 * Accounts for: 40-char string (~80 bytes with overhead) + number (8 bytes) + Map overhead.
 * @const {number}
 */
const BYTES_PER_ID_MAPPING = 120;

/**
 * Base overhead per RoaringBitmap32 instance (empty bitmap).
 * @const {number}
 */
const BITMAP_BASE_OVERHEAD = 64;

/**
 * Computes a SHA-256 checksum of the given data.
 * Used to verify shard integrity on load.
 * Must match the algorithm in BitmapIndexBuilder and BitmapIndexReader.
 *
 * @param {Object} data - The data object to checksum
 * @returns {string} Hex-encoded SHA-256 hash
 */
function computeChecksum(data) {
  const json = JSON.stringify(data);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Streaming bitmap index builder with memory-bounded operation.
 *
 * Unlike {@link BitmapIndexBuilder}, this builder flushes bitmap data to storage
 * periodically when memory usage exceeds a threshold. This enables indexing
 * arbitrarily large graphs without OOM.
 *
 * **Memory Model**:
 * - SHA→ID mappings are kept in memory (required for global ID consistency)
 * - Bitmap data is flushed to storage when threshold exceeded
 * - Flushed chunks are merged at finalization
 *
 * **Trade-offs**:
 * - More I/O operations than in-memory builder
 * - Requires storage adapter (not pure domain)
 * - Merge step at finalization adds overhead
 *
 * @example
 * const builder = new StreamingBitmapIndexBuilder({
 *   storage: gitAdapter,
 *   maxMemoryBytes: 100 * 1024 * 1024, // 100MB
 * });
 *
 * for await (const node of nodes) {
 *   await builder.registerNode(node.sha);
 *   for (const parent of node.parents) {
 *     await builder.addEdge(parent, node.sha);
 *   }
 * }
 *
 * const treeOid = await builder.finalize();
 */
export default class StreamingBitmapIndexBuilder {
  /**
   * Creates a new StreamingBitmapIndexBuilder instance.
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.storage - Storage adapter implementing IndexStoragePort.
   *   Required methods: writeBlob, writeTree, readBlob
   * @param {number} [options.maxMemoryBytes=52428800] - Maximum bitmap memory before flush (default 50MB).
   *   Note: SHA→ID mappings are not counted against this limit as they must remain in memory.
   * @param {Function} [options.onFlush] - Optional callback invoked on each flush.
   *   Receives { flushedBytes, totalFlushedBytes, flushCount }.
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging.
   *   Defaults to NoOpLogger (no logging).
   */
  constructor({ storage, maxMemoryBytes = DEFAULT_MAX_MEMORY_BYTES, onFlush, logger = new NoOpLogger() }) {
    if (!storage) {
      throw new Error('StreamingBitmapIndexBuilder requires a storage adapter');
    }
    if (maxMemoryBytes <= 0) {
      throw new Error('maxMemoryBytes must be a positive number');
    }

    /** @type {Object} */
    this.storage = storage;

    /** @type {number} */
    this.maxMemoryBytes = maxMemoryBytes;

    /** @type {Function|undefined} */
    this.onFlush = onFlush;

    /** @type {import('../../ports/LoggerPort.js').default} */
    this.logger = logger;

    /** @type {Map<string, number>} SHA → numeric ID (kept in memory) */
    this.shaToId = new Map();

    /** @type {string[]} ID → SHA reverse mapping (kept in memory) */
    this.idToSha = [];

    /** @type {Map<string, RoaringBitmap32>} Current in-memory bitmaps */
    this.bitmaps = new Map();

    /** @type {number} Estimated bytes used by current bitmaps */
    this.estimatedBitmapBytes = 0;

    /** @type {Map<string, string[]>} path → array of blob OIDs (for multi-chunk shards) */
    this.flushedChunks = new Map();

    /** @type {number} Total bytes flushed to storage */
    this.totalFlushedBytes = 0;

    /** @type {number} Number of flush operations performed */
    this.flushCount = 0;
  }

  /**
   * Registers a node without adding edges.
   *
   * @param {string} sha - The node's SHA
   * @returns {Promise<number>} The assigned numeric ID
   */
  registerNode(sha) {
    return Promise.resolve(this._getOrCreateId(sha));
  }

  /**
   * Adds a directed edge from source to target node.
   *
   * May trigger a flush if memory threshold is exceeded after adding.
   *
   * @param {string} srcSha - Source node SHA (parent)
   * @param {string} tgtSha - Target node SHA (child)
   * @returns {Promise<void>}
   */
  async addEdge(srcSha, tgtSha) {
    const srcId = this._getOrCreateId(srcSha);
    const tgtId = this._getOrCreateId(tgtSha);

    this._addToBitmap({ sha: srcSha, id: tgtId, type: 'fwd' });
    this._addToBitmap({ sha: tgtSha, id: srcId, type: 'rev' });

    // Check if we need to flush
    if (this.estimatedBitmapBytes >= this.maxMemoryBytes) {
      await this.flush();
    }
  }

  /**
   * Serializes current bitmaps into shard structure.
   * @private
   */
  _serializeBitmapsToShards() {
    const bitmapShards = { fwd: {}, rev: {} };
    for (const [key, bitmap] of this.bitmaps) {
      const type = key.substring(0, 3);
      const sha = key.substring(4);
      const prefix = sha.substring(0, 2);

      if (!bitmapShards[type][prefix]) {
        bitmapShards[type][prefix] = {};
      }
      bitmapShards[type][prefix][sha] = bitmap.serialize(true).toString('base64');
    }
    return bitmapShards;
  }

  /**
   * Writes serialized bitmap shards to storage and tracks their OIDs.
   *
   * @param {Object} bitmapShards - Object with 'fwd' and 'rev' shard data
   * @returns {Promise<void>}
   * @private
   */
  async _writeShardsToStorage(bitmapShards) {
    const writePromises = [];

    for (const type of ['fwd', 'rev']) {
      for (const [prefix, shardData] of Object.entries(bitmapShards[type])) {
        const path = `shards_${type}_${prefix}.json`;
        const envelope = {
          version: SHARD_VERSION,
          checksum: computeChecksum(shardData),
          data: shardData,
        };
        const buffer = Buffer.from(JSON.stringify(envelope));

        writePromises.push(
          this.storage.writeBlob(buffer).then(oid => {
            if (!this.flushedChunks.has(path)) {
              this.flushedChunks.set(path, []);
            }
            this.flushedChunks.get(path).push(oid);
          })
        );
      }
    }

    await Promise.all(writePromises);
  }

  /**
   * Flushes current bitmap data to storage.
   *
   * Serializes all in-memory bitmaps, writes them as blobs, and clears
   * the bitmap map. SHA→ID mappings are preserved.
   *
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.bitmaps.size === 0) {
      return;
    }

    const flushedBytes = this.estimatedBitmapBytes;
    const bitmapShards = this._serializeBitmapsToShards();
    await this._writeShardsToStorage(bitmapShards);

    // Clear bitmaps and reset memory counter
    this.bitmaps.clear();
    this.totalFlushedBytes += flushedBytes;
    this.estimatedBitmapBytes = 0;
    this.flushCount++;

    this.logger.debug('Flushed bitmap data', {
      operation: 'flush',
      flushedBytes,
      totalFlushedBytes: this.totalFlushedBytes,
      flushCount: this.flushCount,
    });

    // Invoke callback if provided
    if (this.onFlush) {
      this.onFlush({
        flushedBytes,
        totalFlushedBytes: this.totalFlushedBytes,
        flushCount: this.flushCount,
      });
    }
  }

  /**
   * Builds meta shards (SHA→ID mappings) grouped by prefix.
   *
   * @returns {Object} Object mapping prefix to SHA→ID maps
   * @private
   */
  _buildMetaShards() {
    const idShards = {};
    for (const [sha, id] of this.shaToId) {
      const prefix = sha.substring(0, 2);
      if (!idShards[prefix]) {
        idShards[prefix] = {};
      }
      idShards[prefix][sha] = id;
    }
    return idShards;
  }

  /**
   * Writes meta shards to storage in parallel.
   *
   * @param {Object} idShards - Object mapping prefix to SHA→ID maps
   * @returns {Promise<string[]>} Array of tree entry strings
   * @private
   */
  async _writeMetaShards(idShards) {
    return await Promise.all(
      Object.entries(idShards).map(async ([prefix, map]) => {
        const path = `meta_${prefix}.json`;
        const envelope = {
          version: SHARD_VERSION,
          checksum: computeChecksum(map),
          data: map,
        };
        const buffer = Buffer.from(JSON.stringify(envelope));
        const oid = await this.storage.writeBlob(buffer);
        return `100644 blob ${oid}\t${path}`;
      })
    );
  }

  /**
   * Processes bitmap shards, merging chunks if necessary.
   *
   * @param {Object} [options] - Options
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<string[]>} Array of tree entry strings
   * @private
   */
  async _processBitmapShards({ signal } = {}) {
    return await Promise.all(
      Array.from(this.flushedChunks.entries()).map(async ([path, oids]) => {
        checkAborted(signal, 'processBitmapShards');
        const finalOid = oids.length === 1 ? oids[0] : await this._mergeChunks(oids, { signal });
        return `100644 blob ${finalOid}\t${path}`;
      })
    );
  }

  /**
   * Finalizes the index and returns the tree OID.
   *
   * Performs the following:
   * 1. Flushes any remaining bitmap data
   * 2. Writes meta shards (SHA→ID mappings) in parallel
   * 3. Merges multi-chunk shards by ORing bitmaps together in parallel
   * 4. Creates and returns the final tree
   *
   * Meta shards and bitmap shards are processed in parallel using Promise.all
   * since they are independent (prefix-based partitioning).
   *
   * @param {Object} [options] - Finalization options
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<string>} OID of the created tree containing the index
   */
  async finalize({ signal, frontier } = {}) {
    this.logger.debug('Finalizing index', {
      operation: 'finalize',
      nodeCount: this.shaToId.size,
      totalFlushedBytes: this.totalFlushedBytes,
      flushCount: this.flushCount,
    });

    checkAborted(signal, 'finalize');
    await this.flush();

    checkAborted(signal, 'finalize');
    const idShards = this._buildMetaShards();
    const metaEntries = await this._writeMetaShards(idShards);

    checkAborted(signal, 'finalize');
    const bitmapEntries = await this._processBitmapShards({ signal });
    const flatEntries = [...metaEntries, ...bitmapEntries];

    // Store frontier metadata for staleness detection
    if (frontier) {
      const sorted = {};
      for (const key of Array.from(frontier.keys()).sort()) {
        sorted[key] = frontier.get(key);
      }
      const envelope = { version: 1, writerCount: frontier.size, frontier: sorted };
      const cborOid = await this.storage.writeBlob(Buffer.from(cborEncode(envelope)));
      flatEntries.push(`100644 blob ${cborOid}\tfrontier.cbor`);
      const jsonOid = await this.storage.writeBlob(Buffer.from(canonicalJson(envelope)));
      flatEntries.push(`100644 blob ${jsonOid}\tfrontier.json`);
    }

    const treeOid = await this.storage.writeTree(flatEntries);

    this.logger.debug('Index finalized', {
      operation: 'finalize',
      treeOid,
      shardCount: flatEntries.length,
      nodeCount: this.shaToId.size,
    });

    return treeOid;
  }

  /**
   * Returns current memory statistics.
   *
   * @returns {Object} Memory statistics
   * @returns {number} return.estimatedBitmapBytes - Current in-memory bitmap size
   * @returns {number} return.estimatedMappingBytes - Estimated SHA→ID mapping size
   * @returns {number} return.totalFlushedBytes - Total bytes written to storage
   * @returns {number} return.flushCount - Number of flush operations
   * @returns {number} return.nodeCount - Number of registered nodes
   * @returns {number} return.bitmapCount - Number of in-memory bitmaps
   */
  getMemoryStats() {
    return {
      estimatedBitmapBytes: this.estimatedBitmapBytes,
      estimatedMappingBytes: this.shaToId.size * BYTES_PER_ID_MAPPING,
      totalFlushedBytes: this.totalFlushedBytes,
      flushCount: this.flushCount,
      nodeCount: this.shaToId.size,
      bitmapCount: this.bitmaps.size,
    };
  }

  /**
   * Gets or creates a numeric ID for a SHA.
   *
   * @param {string} sha - The SHA to look up or register
   * @returns {number} The numeric ID
   * @private
   */
  _getOrCreateId(sha) {
    if (this.shaToId.has(sha)) {
      return this.shaToId.get(sha);
    }
    const id = this.idToSha.length;
    this.idToSha.push(sha);
    this.shaToId.set(sha, id);
    return id;
  }

  /**
   * Adds an ID to a node's bitmap and updates memory estimate.
   *
   * @param {Object} opts - Options
   * @param {string} opts.sha - The SHA to use as key
   * @param {number} opts.id - The ID to add to the bitmap
   * @param {string} opts.type - 'fwd' or 'rev'
   * @private
   */
  _addToBitmap({ sha, id, type }) {
    const key = `${type}_${sha}`;
    if (!this.bitmaps.has(key)) {
      this.bitmaps.set(key, new (getRoaringBitmap32())());
      this.estimatedBitmapBytes += BITMAP_BASE_OVERHEAD;
    }

    const bitmap = this.bitmaps.get(key);
    const sizeBefore = bitmap.size;
    bitmap.add(id);
    const sizeAfter = bitmap.size;

    // Estimate ~4 bytes per new entry (approximation; actual Roaring compression varies widely based on data distribution)
    if (sizeAfter > sizeBefore) {
      this.estimatedBitmapBytes += 4;
    }
  }

  /**
   * Loads a chunk from storage, parses JSON, and validates version and checksum.
   *
   * @param {string} oid - Blob OID of the chunk to load
   * @returns {Promise<Object>} The validated chunk data
   * @throws {ShardCorruptionError} If the chunk cannot be parsed or checksum is invalid
   * @throws {ShardValidationError} If the chunk has an unsupported version
   * @private
   */
  async _loadAndValidateChunk(oid) {
    const buffer = await this.storage.readBlob(oid);
    let envelope;
    try {
      envelope = JSON.parse(buffer.toString('utf-8'));
    } catch (err) {
      throw new ShardCorruptionError('Failed to parse shard JSON', {
        oid,
        reason: 'invalid_format',
        originalError: err.message,
      });
    }

    // Validate version
    if (envelope.version !== SHARD_VERSION) {
      throw new ShardValidationError('Shard version mismatch', {
        oid,
        expected: SHARD_VERSION,
        actual: envelope.version,
        field: 'version',
      });
    }

    // Validate checksum
    const expectedChecksum = computeChecksum(envelope.data);
    if (envelope.checksum !== expectedChecksum) {
      throw new ShardCorruptionError('Shard checksum mismatch', {
        oid,
        reason: 'invalid_checksum',
        context: {
          expected: expectedChecksum,
          actual: envelope.checksum,
        },
      });
    }

    return envelope.data;
  }

  /**
   * Deserializes a base64-encoded bitmap and merges it into the merged object.
   *
   * @param {Object} opts - Options
   * @param {Object} opts.merged - Object mapping SHA to RoaringBitmap32 instances
   * @param {string} opts.sha - The SHA key for this bitmap
   * @param {string} opts.base64Bitmap - Base64-encoded serialized bitmap
   * @param {string} opts.oid - Blob OID (for error reporting)
   * @throws {ShardCorruptionError} If the bitmap cannot be deserialized
   * @private
   */
  _mergeDeserializedBitmap({ merged, sha, base64Bitmap, oid }) {
    let bitmap;
    try {
      bitmap = getRoaringBitmap32().deserialize(Buffer.from(base64Bitmap, 'base64'), true);
    } catch (err) {
      throw new ShardCorruptionError('Failed to deserialize bitmap', {
        oid,
        reason: 'invalid_bitmap',
        originalError: err.message,
      });
    }

    if (!merged[sha]) {
      merged[sha] = bitmap;
    } else {
      // OR the bitmaps together
      merged[sha].orInPlace(bitmap);
    }
  }

  /**
   * Merges multiple shard chunks by ORing their bitmaps together.
   *
   * Validates version and checksum of each chunk before merging.
   * Throws ShardValidationError on version mismatch or ShardCorruptionError on checksum mismatch.
   *
   * @param {string[]} oids - Blob OIDs of chunks to merge
   * @param {Object} [options] - Options
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<string>} OID of merged shard blob
   * @throws {ShardValidationError} If a chunk has an unsupported version
   * @throws {ShardCorruptionError} If a chunk's checksum does not match
   * @private
   */
  async _mergeChunks(oids, { signal } = {}) {
    // Load all chunks and merge bitmaps by SHA
    const merged = {};

    for (const oid of oids) {
      checkAborted(signal, 'mergeChunks');
      const chunk = await this._loadAndValidateChunk(oid);

      for (const [sha, base64Bitmap] of Object.entries(chunk)) {
        this._mergeDeserializedBitmap({ merged, sha, base64Bitmap, oid });
      }
    }

    // Serialize merged result
    const result = {};
    for (const [sha, bitmap] of Object.entries(merged)) {
      result[sha] = bitmap.serialize(true).toString('base64');
    }

    // Wrap merged result in envelope with version and checksum
    const mergedEnvelope = {
      version: SHARD_VERSION,
      checksum: computeChecksum(result),
      data: result,
    };

    let serialized;
    try {
      serialized = Buffer.from(JSON.stringify(mergedEnvelope));
    } catch (err) {
      throw new ShardCorruptionError('Failed to serialize merged shard', {
        reason: 'serialization_error',
        originalError: err.message,
      });
    }
    return this.storage.writeBlob(serialized);
  }
}
