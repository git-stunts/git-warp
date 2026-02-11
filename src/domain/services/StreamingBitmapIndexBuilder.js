import defaultCodec from '../utils/defaultCodec.js';
import defaultCrypto from '../utils/defaultCrypto.js';
import ShardCorruptionError from '../errors/ShardCorruptionError.js';
import ShardValidationError from '../errors/ShardValidationError.js';
import nullLogger from '../utils/nullLogger.js';
import { checkAborted } from '../utils/cancellation.js';
import { getRoaringBitmap32 } from '../utils/roaring.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';
import { SHARD_VERSION } from '../utils/shardVersion.js';

// Re-export for backwards compatibility
export { SHARD_VERSION };

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
 * Uses canonical JSON stringification for deterministic output
 * across different JavaScript engines.
 *
 * @param {Object} data - The data object to checksum
 * @param {import('../../ports/CryptoPort.js').default} crypto - CryptoPort instance
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
const computeChecksum = async (data, crypto) => {
  const json = canonicalStringify(data);
  return await crypto.hash('sha256', json);
};

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
   * @param {import('../../ports/CryptoPort.js').default} [options.crypto] - CryptoPort instance for hashing
   * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
   */
  constructor({ storage, maxMemoryBytes = DEFAULT_MAX_MEMORY_BYTES, onFlush, logger = nullLogger, crypto, codec }) {
    if (!storage) {
      throw new Error('StreamingBitmapIndexBuilder requires a storage adapter');
    }
    if (maxMemoryBytes <= 0) {
      throw new Error('maxMemoryBytes must be a positive number');
    }

    /** @type {import('../../ports/CryptoPort.js').default} */
    this._crypto = crypto || defaultCrypto;

    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec || defaultCodec;

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

    /** @type {Map<string, any>} Current in-memory bitmaps */
    this.bitmaps = new Map();

    /** @type {number} Estimated bytes used by current bitmaps */
    this.estimatedBitmapBytes = 0;

    /** @type {Map<string, string[]>} path → array of blob OIDs (for multi-chunk shards) */
    this.flushedChunks = new Map();

    /** @type {number} Total bytes flushed to storage */
    this.totalFlushedBytes = 0;

    /** @type {number} Number of flush operations performed */
    this.flushCount = 0;

    /** @type {any} Cached Roaring bitmap constructor */ // TODO(ts-cleanup): type lazy singleton
    this._RoaringBitmap32 = getRoaringBitmap32(); // TODO(ts-cleanup): type lazy singleton
  }

  /**
   * Registers a node without adding edges.
   *
   * This method assigns a numeric ID to the given SHA if it hasn't been
   * registered before. The ID is used internally for bitmap indexing.
   * If the node has already been registered, returns the existing ID.
   *
   * @param {string} sha - The node's SHA (40-character hex string)
   * @returns {Promise<number>} The assigned numeric ID (0-indexed, monotonically increasing)
   */
  registerNode(sha) {
    return Promise.resolve(this._getOrCreateId(sha));
  }

  /**
   * Adds a directed edge from source to target node.
   *
   * Creates or updates bitmap entries for both forward (src → tgt) and
   * reverse (tgt → src) edge lookups. Both nodes are automatically registered
   * if not already present.
   *
   * May trigger an automatic flush if memory usage exceeds the configured
   * `maxMemoryBytes` threshold after adding the edge.
   *
   * @param {string} srcSha - Source node SHA (parent, 40-character hex string)
   * @param {string} tgtSha - Target node SHA (child, 40-character hex string)
   * @returns {Promise<void>} Resolves when edge is added (and flushed if necessary)
   * @async
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
   * Serializes current in-memory bitmaps into a shard structure.
   *
   * Groups bitmaps by type ('fwd' or 'rev') and SHA prefix (first 2 hex chars).
   * Each bitmap is serialized to a portable format and base64-encoded.
   *
   * @returns {Record<string, Record<string, Record<string, string>>>}
   *   Object with 'fwd' and 'rev' keys, each mapping prefix to SHA→base64Bitmap entries
   * @private
   */
  _serializeBitmapsToShards() {
    /** @type {Record<string, Record<string, Record<string, string>>>} */
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
   * Each shard is wrapped in a versioned envelope with a checksum before writing.
   * The resulting blob OIDs are tracked in `flushedChunks` for later merging.
   * Writes are performed in parallel for efficiency.
   *
   * @param {Record<string, Record<string, Record<string, string>>>} bitmapShards
   *   Object with 'fwd' and 'rev' keys containing prefix-grouped bitmap data
   * @returns {Promise<void>} Resolves when all shards have been written
   * @async
   * @private
   */
  async _writeShardsToStorage(bitmapShards) {
    const tasks = [];

    for (const type of ['fwd', 'rev']) {
      for (const [prefix, shardData] of Object.entries(bitmapShards[type])) {
        const path = `shards_${type}_${prefix}.json`;
        tasks.push(
          computeChecksum(shardData, this._crypto).then(async (checksum) => {
            const envelope = {
              version: SHARD_VERSION,
              checksum,
              data: shardData,
            };
            const buffer = Buffer.from(JSON.stringify(envelope));
            const oid = await /** @type {any} */ (this.storage).writeBlob(buffer); // TODO(ts-cleanup): narrow port type
            if (!this.flushedChunks.has(path)) {
              this.flushedChunks.set(path, []);
            }
            /** @type {string[]} */ (this.flushedChunks.get(path)).push(oid);
          })
        );
      }
    }

    await Promise.all(tasks);
  }

  /**
   * Flushes current bitmap data to storage.
   *
   * Serializes all in-memory bitmaps, writes them as versioned blob chunks,
   * and clears the bitmap map to free memory. SHA→ID mappings are preserved
   * in memory as they are required for global ID consistency.
   *
   * This method is called automatically when memory usage exceeds
   * `maxMemoryBytes`, but can also be called manually to force a flush.
   *
   * If no bitmaps are in memory (e.g., after a previous flush), this
   * method returns immediately without performing any I/O.
   *
   * Invokes the `onFlush` callback (if configured) after successful flush.
   *
   * @returns {Promise<void>} Resolves when flush is complete
   * @async
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
   * Builds meta shards (SHA→ID mappings) grouped by SHA prefix.
   *
   * Groups all registered SHA→ID mappings by the first two hex characters
   * of the SHA. This enables efficient loading of only relevant shards
   * during index reads.
   *
   * @returns {Object<string, Object<string, number>>} Object mapping 2-char hex prefix
   *   to objects of SHA→numeric ID mappings
   * @private
   */
  _buildMetaShards() {
    /** @type {Record<string, Record<string, number>>} */
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
   * Each shard is wrapped in a versioned envelope with checksum before writing.
   * Writes are performed in parallel using Promise.all for efficiency.
   *
   * @param {Object<string, Object<string, number>>} idShards - Object mapping 2-char hex prefix
   *   to objects of SHA→numeric ID mappings
   * @returns {Promise<string[]>} Array of Git tree entry strings in format
   *   "100644 blob <oid>\tmeta_<prefix>.json"
   * @async
   * @private
   */
  async _writeMetaShards(idShards) {
    return await Promise.all(
      Object.entries(idShards).map(async ([prefix, map]) => {
        const path = `meta_${prefix}.json`;
        const envelope = {
          version: SHARD_VERSION,
          checksum: await computeChecksum(map, this._crypto),
          data: map,
        };
        const buffer = Buffer.from(JSON.stringify(envelope));
        const oid = await /** @type {any} */ (this.storage).writeBlob(buffer); // TODO(ts-cleanup): narrow port type
        return `100644 blob ${oid}\t${path}`;
      })
    );
  }

  /**
   * Processes bitmap shards, merging multiple chunks if necessary.
   *
   * For each shard path, if multiple chunks were flushed during the build,
   * they are merged by ORing their bitmaps together. Single-chunk shards
   * are used directly without merging.
   *
   * Processing is parallelized across shard paths for efficiency.
   *
   * @param {Object} [options] - Options
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation.
   *   If aborted, throws an error with code 'ABORT_ERR'.
   * @returns {Promise<string[]>} Array of Git tree entry strings in format
   *   "100644 blob <oid>\tshards_<type>_<prefix>.json"
   * @throws {Error} If the operation is aborted via signal
   * @throws {ShardValidationError} If a chunk has an unsupported version (from _mergeChunks)
   * @throws {ShardCorruptionError} If a chunk's checksum is invalid (from _mergeChunks)
   * @async
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
   * Performs the following steps:
   * 1. Flushes any remaining in-memory bitmap data to storage
   * 2. Builds and writes meta shards (SHA→ID mappings) grouped by prefix
   * 3. Merges multi-chunk bitmap shards by ORing bitmaps together
   * 4. Optionally writes frontier metadata for staleness detection
   * 5. Creates and returns the final Git tree containing all shards
   *
   * Meta shards and bitmap shards are processed using Promise.all
   * since they are independent (prefix-based partitioning).
   *
   * The resulting tree structure:
   * ```
   * index-tree/
   *   meta_00.json ... meta_ff.json       # SHA→ID mappings by prefix
   *   shards_fwd_00.json ... shards_fwd_ff.json  # Forward edge bitmaps
   *   shards_rev_00.json ... shards_rev_ff.json  # Reverse edge bitmaps
   *   frontier.cbor                       # Optional: CBOR-encoded frontier
   *   frontier.json                       # Optional: JSON-encoded frontier
   * ```
   *
   * @param {Object} [options] - Finalization options
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation.
   *   If aborted, throws an error with code 'ABORT_ERR'.
   * @param {Map<string, number>} [options.frontier] - Optional version vector frontier
   *   (writerId → clock) for staleness detection. If provided, frontier.cbor and
   *   frontier.json files are included in the tree.
   * @returns {Promise<string>} OID of the created Git tree containing the complete index
   * @throws {Error} If the operation is aborted via signal
   * @throws {ShardValidationError} If a chunk has an unsupported version during merge
   * @throws {ShardCorruptionError} If a chunk's checksum is invalid during merge
   * @async
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
      /** @type {Record<string, number|undefined>} */
      const sorted = {};
      for (const key of Array.from(frontier.keys()).sort()) {
        sorted[key] = frontier.get(key);
      }
      const envelope = { version: 1, writerCount: frontier.size, frontier: sorted };
      const cborOid = await /** @type {any} */ (this.storage).writeBlob(Buffer.from(/** @type {any} */ (this._codec).encode(envelope))); // TODO(ts-cleanup): narrow port type
      flatEntries.push(`100644 blob ${cborOid}\tfrontier.cbor`);
      const jsonOid = await /** @type {any} */ (this.storage).writeBlob(Buffer.from(canonicalStringify(envelope))); // TODO(ts-cleanup): narrow port type
      flatEntries.push(`100644 blob ${jsonOid}\tfrontier.json`);
    }

    const treeOid = await /** @type {any} */ (this.storage).writeTree(flatEntries); // TODO(ts-cleanup): narrow port type

    this.logger.debug('Index finalized', {
      operation: 'finalize',
      treeOid,
      shardCount: flatEntries.length,
      nodeCount: this.shaToId.size,
    });

    return treeOid;
  }

  /**
   * Returns current memory statistics for monitoring and debugging.
   *
   * Useful for understanding memory pressure during index building and
   * tuning the `maxMemoryBytes` threshold.
   *
   * @returns {Object} Memory statistics object
   * @property {number} estimatedBitmapBytes - Current estimated size of in-memory bitmaps in bytes.
   *   This is an approximation based on bitmap operations; actual memory usage may vary.
   * @property {number} estimatedMappingBytes - Estimated size of SHA→ID mappings in bytes.
   *   Calculated as nodeCount * BYTES_PER_ID_MAPPING (120 bytes per entry).
   * @property {number} totalFlushedBytes - Total bytes flushed to storage across all flush operations.
   * @property {number} flushCount - Number of flush operations performed so far.
   * @property {number} nodeCount - Total number of unique nodes registered (by SHA).
   * @property {number} bitmapCount - Number of bitmaps currently held in memory.
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
   * If the SHA has been seen before, returns its existing ID.
   * Otherwise, assigns the next available ID (equal to current array length)
   * and stores the bidirectional mapping.
   *
   * IDs are assigned sequentially starting from 0 in the order nodes are first seen.
   *
   * @param {string} sha - The SHA to look up or register (40-character hex string)
   * @returns {number} The numeric ID (0-indexed, monotonically increasing)
   * @private
   */
  _getOrCreateId(sha) {
    if (this.shaToId.has(sha)) {
      return /** @type {number} */ (this.shaToId.get(sha));
    }
    const id = this.idToSha.length;
    this.idToSha.push(sha);
    this.shaToId.set(sha, id);
    return id;
  }

  /**
   * Adds an ID to a node's bitmap and updates memory estimate.
   *
   * Creates a new RoaringBitmap32 if this is the first edge for the given
   * SHA and type combination. Updates the `estimatedBitmapBytes` counter
   * to track memory usage for automatic flushing.
   *
   * Memory estimation:
   * - New bitmap: adds BITMAP_BASE_OVERHEAD (64 bytes)
   * - New entry in existing bitmap: adds ~4 bytes (approximation)
   *
   * @param {Object} opts - Options object
   * @param {string} opts.sha - The SHA to use as bitmap key (40-character hex string)
   * @param {number} opts.id - The numeric ID to add to the bitmap
   * @param {'fwd'|'rev'} opts.type - Edge direction type: 'fwd' for forward edges
   *   (this node's children), 'rev' for reverse edges (this node's parents)
   * @private
   */
  _addToBitmap({ sha, id, type }) {
    const key = `${type}_${sha}`;
    if (!this.bitmaps.has(key)) {
      this.bitmaps.set(key, new this._RoaringBitmap32());
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
   * Performs the following validation steps:
   * 1. Reads blob from storage by OID
   * 2. Parses JSON envelope (throws ShardCorruptionError if invalid)
   * 3. Validates version matches SHARD_VERSION (throws ShardValidationError if mismatch)
   * 4. Recomputes and validates checksum (throws ShardCorruptionError if mismatch)
   *
   * @param {string} oid - Git blob OID of the chunk to load (40-character hex string)
   * @returns {Promise<Object<string, string>>} The validated chunk data (SHA→base64Bitmap mappings)
   * @throws {ShardCorruptionError} If the chunk cannot be parsed as JSON or checksum is invalid.
   *   Error context includes: oid, reason ('invalid_format' or 'invalid_checksum'), originalError
   * @throws {ShardValidationError} If the chunk has an unsupported version.
   *   Error context includes: oid, expected version, actual version, field
   * @async
   * @private
   */
  async _loadAndValidateChunk(oid) {
    const buffer = await /** @type {any} */ (this.storage).readBlob(oid); // TODO(ts-cleanup): narrow port type
    let envelope;
    try {
      envelope = JSON.parse(buffer.toString('utf-8'));
    } catch (err) {
      throw new ShardCorruptionError('Failed to parse shard JSON', {
        oid,
        reason: 'invalid_format',
        context: { originalError: /** @type {any} */ (err).message }, // TODO(ts-cleanup): type error
      });
    }

    // Validate version
    if (envelope.version !== SHARD_VERSION) {
      throw new ShardValidationError('Shard version mismatch', {
        expected: SHARD_VERSION,
        actual: envelope.version,
        field: 'version',
      });
    }

    // Validate checksum
    const expectedChecksum = await computeChecksum(envelope.data, this._crypto);
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
   * If no bitmap exists for the SHA in the merged object, the deserialized bitmap
   * is stored directly. If a bitmap already exists, the new bitmap is ORed into
   * it using `orInPlace` to combine edge sets.
   *
   * @param {Object} opts - Options object
   * @param {Record<string, any>} opts.merged - Object mapping SHA to
   *   RoaringBitmap32 instances (mutated in place)
   * @param {string} opts.sha - The SHA key for this bitmap (40-character hex string)
   * @param {string} opts.base64Bitmap - Base64-encoded serialized RoaringBitmap32 data
   * @param {string} opts.oid - Git blob OID of the source chunk (for error reporting)
   * @throws {ShardCorruptionError} If the bitmap cannot be deserialized from base64.
   *   Error context includes: oid, reason ('invalid_bitmap'), originalError
   * @private
   */
  _mergeDeserializedBitmap({ merged, sha, base64Bitmap, oid }) {
    let bitmap;
    try {
      bitmap = this._RoaringBitmap32.deserialize(Buffer.from(base64Bitmap, 'base64'), true);
    } catch (err) {
      throw new ShardCorruptionError('Failed to deserialize bitmap', {
        oid,
        reason: 'invalid_bitmap',
        context: { originalError: /** @type {any} */ (err).message }, // TODO(ts-cleanup): type error
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
   * This is called during finalization when a shard path has multiple flushed
   * chunks that need to be combined. Each chunk is loaded, validated, and its
   * bitmaps are ORed together by SHA key.
   *
   * The merge process:
   * 1. Iterates through each chunk OID
   * 2. Loads and validates each chunk (version + checksum)
   * 3. Deserializes bitmaps and ORs them together by SHA
   * 4. Serializes the merged result with new checksum
   * 5. Writes the merged blob to storage
   *
   * Supports cancellation via AbortSignal between chunk processing iterations.
   *
   * @param {string[]} oids - Git blob OIDs of chunks to merge (40-character hex strings)
   * @param {Object} [options] - Options object
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation.
   *   Checked between chunk iterations; if aborted, throws with code 'ABORT_ERR'.
   * @returns {Promise<string>} Git blob OID of the merged shard (40-character hex string)
   * @throws {Error} If the operation is aborted via signal
   * @throws {ShardValidationError} If a chunk has an unsupported version.
   *   Contains context: oid, expected version, actual version
   * @throws {ShardCorruptionError} If a chunk's checksum does not match, JSON parsing fails,
   *   bitmap deserialization fails, or final serialization fails.
   *   Contains context: oid/reason and relevant details
   * @async
   * @private
   */
  async _mergeChunks(oids, { signal } = {}) {
    // Load all chunks and merge bitmaps by SHA
    /** @type {Record<string, any>} */
    const merged = {};

    for (const oid of oids) {
      checkAborted(signal, 'mergeChunks');
      const chunk = await this._loadAndValidateChunk(oid);

      for (const [sha, base64Bitmap] of Object.entries(chunk)) {
        this._mergeDeserializedBitmap({ merged, sha, base64Bitmap, oid });
      }
    }

    // Serialize merged result
    /** @type {Record<string, string>} */
    const result = {};
    for (const [sha, bitmap] of Object.entries(merged)) {
      result[sha] = bitmap.serialize(true).toString('base64');
    }

    // Wrap merged result in envelope with version and checksum
    const mergedEnvelope = {
      version: SHARD_VERSION,
      checksum: await computeChecksum(result, this._crypto),
      data: result,
    };

    let serialized;
    try {
      serialized = Buffer.from(JSON.stringify(mergedEnvelope));
    } catch (err) {
      throw new ShardCorruptionError('Failed to serialize merged shard', {
        reason: 'serialization_error',
        context: { originalError: /** @type {any} */ (err).message }, // TODO(ts-cleanup): type error
      });
    }
    return /** @type {any} */ (this.storage).writeBlob(serialized); // TODO(ts-cleanup): narrow port type
  }
}
