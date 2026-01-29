import { performance } from 'perf_hooks';
import BitmapIndexBuilder from './BitmapIndexBuilder.js';
import BitmapIndexReader from './BitmapIndexReader.js';
import StreamingBitmapIndexBuilder from './StreamingBitmapIndexBuilder.js';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import { checkAborted } from '../utils/cancellation.js';

/**
 * Service for building and loading the bitmap index from the graph.
 *
 * This service orchestrates index creation by walking the graph and persisting
 * the resulting bitmap shards to storage via the IndexStoragePort.
 *
 * Supports two build modes:
 * - **In-memory** (default): Fast, but requires O(N) memory
 * - **Streaming**: Memory-bounded, flushes to storage periodically
 */
export default class IndexRebuildService {
  /**
   * Creates an IndexRebuildService instance.
   *
   * @param {Object} options - Configuration options
   * @param {import('./GraphService.js').default} options.graphService - Graph service for iterating nodes
   * @param {import('../../ports/IndexStoragePort.js').default} options.storage - Storage adapter for persisting index
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging.
   *   Defaults to NoOpLogger (no logging).
   */
  constructor({ graphService, storage, logger = new NoOpLogger() }) {
    if (!graphService) {
      throw new Error('IndexRebuildService requires a graphService');
    }
    if (!storage) {
      throw new Error('IndexRebuildService requires a storage adapter');
    }
    this.graphService = graphService;
    this.storage = storage;
    this.logger = logger;
  }

  /**
   * Rebuilds the bitmap index by walking the graph from a ref.
   *
   * **Build Modes**:
   *
   * *In-memory mode* (default, when `maxMemoryBytes` not specified):
   * - Fastest option, single pass with bulk serialization at end
   * - Memory: O(N) where N is number of nodes (~150-200MB for 1M nodes)
   *
   * *Streaming mode* (when `maxMemoryBytes` is specified):
   * - Memory-bounded operation for very large graphs
   * - Flushes bitmap data to storage when threshold exceeded
   * - Merges chunks at finalization
   * - More I/O operations, but constant memory ceiling
   *
   * **Persistence**: Creates a Git tree containing sharded JSON blobs:
   * - `meta_XX.json`: SHA→ID mappings (256 shards by SHA prefix)
   * - `shards_fwd_XX.json`: Forward edge bitmaps (child lookups)
   * - `shards_rev_XX.json`: Reverse edge bitmaps (parent lookups)
   *
   * @param {string} ref - Git ref to start traversal from (e.g., 'HEAD', branch name, SHA)
   * @param {Object} [options] - Rebuild options
   * @param {number} [options.limit=10000000] - Maximum nodes to process (1 to 10,000,000)
   * @param {number} [options.maxMemoryBytes] - Enable streaming mode with this memory threshold.
   *   When bitmap memory exceeds this value, data is flushed to storage.
   *   Recommended: 50-100MB for most systems. Minimum: 1MB.
   * @param {Function} [options.onFlush] - Callback invoked on each flush (streaming mode only).
   *   Receives { flushedBytes, totalFlushedBytes, flushCount }.
   * @param {Function} [options.onProgress] - Callback invoked periodically during processing.
   *   Receives { processedNodes, currentMemoryBytes }.
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support.
   *   When aborted, throws OperationAbortedError at the next loop boundary.
   * @returns {Promise<string>} OID of the created tree containing the index
   * @throws {Error} If ref is invalid or limit is out of range
   *
   * @example
   * // In-memory rebuild (default, fast)
   * const treeOid = await rebuildService.rebuild('HEAD');
   *
   * @example
   * // Streaming rebuild with 50MB memory limit
   * const treeOid = await rebuildService.rebuild('HEAD', {
   *   maxMemoryBytes: 50 * 1024 * 1024,
   *   onFlush: ({ flushCount }) => console.log(`Flush #${flushCount}`),
   * });
   */
  async rebuild(ref, { limit = 10_000_000, maxMemoryBytes, onFlush, onProgress, signal } = {}) {
    if (maxMemoryBytes !== undefined && maxMemoryBytes <= 0) {
      throw new Error('maxMemoryBytes must be a positive number');
    }
    const mode = maxMemoryBytes !== undefined ? 'streaming' : 'in-memory';
    this.logger.info('Starting index rebuild', {
      operation: 'rebuild',
      ref,
      limit,
      mode,
      maxMemoryBytes: maxMemoryBytes ?? null,
    });

    const startTime = performance.now();

    try {
      let treeOid;
      if (maxMemoryBytes !== undefined) {
        treeOid = await this._rebuildStreaming(ref, { limit, maxMemoryBytes, onFlush, onProgress, signal });
      } else {
        treeOid = await this._rebuildInMemory(ref, { limit, onProgress, signal });
      }

      const durationMs = performance.now() - startTime;
      this.logger.info('Index rebuild complete', {
        operation: 'rebuild',
        ref,
        mode,
        treeOid,
        durationMs,
      });

      return treeOid;
    } catch (err) {
      const durationMs = performance.now() - startTime;
      this.logger.error('Index rebuild failed', {
        operation: 'rebuild',
        ref,
        mode,
        error: err.message,
        durationMs,
      });
      throw err;
    }
  }

  /**
   * In-memory rebuild implementation (original behavior).
   *
   * @param {string} ref - Git ref to traverse from
   * @param {Object} options - Options
   * @param {number} options.limit - Maximum nodes
   * @param {Function} [options.onProgress] - Progress callback
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation
   * @returns {Promise<string>} Tree OID
   * @private
   */
  async _rebuildInMemory(ref, { limit, onProgress, signal }) {
    const builder = new BitmapIndexBuilder();
    let processedNodes = 0;

    for await (const node of this.graphService.iterateNodes({ ref, limit })) {
      builder.registerNode(node.sha);
      for (const parentSha of node.parents) {
        builder.addEdge(parentSha, node.sha);
      }

      processedNodes++;
      if (processedNodes % 10000 === 0) {
        checkAborted(signal, 'rebuild');
        if (onProgress) {
          onProgress({ processedNodes, currentMemoryBytes: null });
        }
      }
    }

    return this._persistIndex(builder);
  }

  /**
   * Streaming rebuild implementation with memory-bounded operation.
   *
   * @param {string} ref - Git ref to traverse from
   * @param {Object} options - Options
   * @param {number} options.limit - Maximum nodes
   * @param {number} options.maxMemoryBytes - Memory threshold
   * @param {Function} [options.onFlush] - Flush callback
   * @param {Function} [options.onProgress] - Progress callback
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation
   * @returns {Promise<string>} Tree OID
   * @private
   */
  async _rebuildStreaming(ref, { limit, maxMemoryBytes, onFlush, onProgress, signal }) {
    const builder = new StreamingBitmapIndexBuilder({
      storage: this.storage,
      maxMemoryBytes,
      onFlush,
    });

    let processedNodes = 0;

    for await (const node of this.graphService.iterateNodes({ ref, limit })) {
      await builder.registerNode(node.sha);
      for (const parentSha of node.parents) {
        await builder.addEdge(parentSha, node.sha);
      }

      processedNodes++;
      if (processedNodes % 10000 === 0) {
        checkAborted(signal, 'rebuild');
        if (onProgress) {
          const stats = builder.getMemoryStats();
          onProgress({
            processedNodes,
            currentMemoryBytes: stats.estimatedBitmapBytes,
          });
        }
      }
    }

    return builder.finalize();
  }

  /**
   * Persists a built index to storage (in-memory builder only).
   *
   * Serializes the builder's state and writes each shard as a blob,
   * then creates a tree containing all shards.
   *
   * @param {BitmapIndexBuilder} builder - The builder containing index data
   * @returns {Promise<string>} OID of the created tree
   * @private
   */
  async _persistIndex(builder) {
    const treeStructure = builder.serialize();
    const flatEntries = [];
    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.storage.writeBlob(buffer);
      flatEntries.push(`100644 blob ${oid}\t${path}`);
    }
    return this.storage.writeTree(flatEntries);
  }

  /**
   * Loads a previously built index from a tree OID.
   *
   * **Memory cost**: Lazy loading - only shards accessed are loaded into memory.
   * - Initial load: O(1) - just stores shard OID mappings (~50KB for 256 shards)
   * - Per-query: Loads 1-3 shards on demand (~1-5KB each, cached after first access)
   * - Worst case (all shards loaded): Similar to rebuild memory (~150-200MB for 1M nodes)
   *
   * **Persistence**: Reads from storage. The tree OID can be stored
   * in a ref (e.g., 'refs/empty-graph/index') for persistence across sessions.
   *
   * **Strict Mode** (default: `true`):
   * When `strict` is enabled (fail-closed behavior), the reader will validate
   * shard integrity during loading. If corruption or validation failures are
   * detected, errors are thrown immediately, allowing callers to trigger rebuilds.
   *
   * When `strict` is disabled (graceful degradation), the reader will attempt
   * to continue operation despite integrity issues, which may result in
   * incomplete or incorrect query results.
   *
   * @param {string} treeOid - OID of the index tree (from rebuild() or a saved ref)
   * @param {Object} [options] - Load options
   * @param {boolean} [options.strict=true] - Enable strict integrity verification (fail-closed).
   *   When true, throws on any shard validation or corruption errors.
   *   When false, attempts graceful degradation.
   * @returns {Promise<BitmapIndexReader>} Configured reader ready for O(1) queries
   * @throws {Error} If treeOid is invalid or tree cannot be read
   * @throws {ShardValidationError} (strict mode) If shard structure validation fails
   * @throws {ShardCorruptionError} (strict mode) If shard data integrity check fails
   * @throws {ShardLoadError} (strict mode) If shard cannot be loaded from storage
   *
   * @example
   * // Load with strict integrity checking (default)
   * try {
   *   const reader = await service.load(treeOid);
   * } catch (err) {
   *   if (err instanceof ShardValidationError || err instanceof ShardCorruptionError) {
   *     // Integrity failure - trigger rebuild
   *     const newTreeOid = await service.rebuild(ref);
   *     const reader = await service.load(newTreeOid);
   *   }
   * }
   *
   * @example
   * // Load with graceful degradation (non-strict)
   * const reader = await service.load(treeOid, { strict: false });
   *
   * @example
   * // Load from a saved ref
   * const savedOid = await storage.readRef('refs/empty-graph/index');
   * const reader = await rebuildService.load(savedOid);
   */
  async load(treeOid, { strict = true } = {}) {
    this.logger.debug('Loading index', {
      operation: 'load',
      treeOid,
      strict,
    });

    const startTime = performance.now();
    const shardOids = await this.storage.readTreeOids(treeOid);
    const shardCount = Object.keys(shardOids).length;

    const reader = new BitmapIndexReader({ storage: this.storage, strict, logger: this.logger.child({ component: 'BitmapIndexReader' }) });
    reader.setup(shardOids);

    const durationMs = performance.now() - startTime;
    this.logger.debug('Index loaded', {
      operation: 'load',
      treeOid,
      shardCount,
      durationMs,
    });

    return reader;
  }
}
