import { performance } from 'perf_hooks';
import BitmapIndexBuilder from './BitmapIndexBuilder.js';
import BitmapIndexReader from './BitmapIndexReader.js';
import StreamingBitmapIndexBuilder from './StreamingBitmapIndexBuilder.js';
import { loadIndexFrontier, checkStaleness } from './IndexStalenessChecker.js';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import { checkAborted } from '../utils/cancellation.js';

/**
 * Service for building and loading the bitmap index from the graph.
 *
 * This service orchestrates index creation by walking the graph and persisting
 * the resulting bitmap shards to storage via the IndexStoragePort. The bitmap
 * index enables O(1) neighbor lookups (children/parents) after a one-time
 * O(N) rebuild cost.
 *
 * **Build Modes**:
 * - **In-memory** (default): Fast, but requires O(N) memory. Best for graphs
 *   under ~1M nodes or systems with ample RAM.
 * - **Streaming**: Memory-bounded, flushes to storage periodically. Required
 *   for very large graphs that exceed available memory.
 *
 * **Index Structure**: The index is stored as a Git tree containing:
 * - `meta_XX.json`: SHA-to-numeric-ID mappings (256 shards by SHA prefix)
 * - `shards_fwd_XX.json`: Forward edge bitmaps (for child lookups)
 * - `shards_rev_XX.json`: Reverse edge bitmaps (for parent lookups)
 * - `frontier.json`: Writer frontier snapshot (for staleness detection)
 *
 * **Staleness Detection**: The index stores the frontier at build time.
 * On load, the current frontier can be compared to detect if new patches
 * have been written since the index was built.
 *
 * @module domain/services/IndexRebuildService
 * @see BitmapIndexBuilder
 * @see BitmapIndexReader
 * @see StreamingBitmapIndexBuilder
 */
export default class IndexRebuildService {
  /**
   * Creates an IndexRebuildService instance.
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.graphService - Graph service providing node iteration.
   *   Must implement `iterateNodes({ ref, limit }) => AsyncGenerator<GraphNode>`.
   * @param {import('../../ports/IndexStoragePort.js').default} options.storage - Storage adapter
   *   for persisting index blobs and trees. Typically GitGraphAdapter.
   * @param {import('../../ports/LoggerPort.js').default} [options.logger=NoOpLogger] - Logger for
   *   structured logging. Defaults to NoOpLogger (no logging).
   * @throws {Error} If graphService is not provided
   * @throws {Error} If storage adapter is not provided
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
   * @param {Map<string, string>} [options.frontier] - Frontier to persist alongside the rebuilt index.
   *   Maps writer IDs to their tip SHAs; stored in the index tree for staleness detection.
   * @returns {Promise<string>} OID of the created tree containing the index
   * @throws {Error} If maxMemoryBytes is specified but not positive
   * @throws {OperationAbortedError} If the signal is aborted during rebuild
   * @throws {Error} If graphService.iterateNodes() fails (e.g., invalid ref)
   * @throws {Error} If storage.writeBlob() or storage.writeTree() fails
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
  async rebuild(ref, { limit = 10_000_000, maxMemoryBytes, onFlush, onProgress, signal, frontier } = {}) {
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
        treeOid = await this._rebuildStreaming(ref, { limit, maxMemoryBytes, onFlush, onProgress, signal, frontier });
      } else {
        treeOid = await this._rebuildInMemory(ref, { limit, onProgress, signal, frontier });
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
   * Loads all nodes into memory, builds the complete index, then persists
   * in a single batch. This is the fastest approach but requires O(N) memory
   * where N is the number of nodes.
   *
   * **Memory usage**: Approximately 150-200 bytes per node for the bitmap
   * data structures, plus temporary overhead during serialization.
   *
   * @param {string} ref - Git ref to traverse from
   * @param {Object} options - Options
   * @param {number} options.limit - Maximum nodes to process
   * @param {Function} [options.onProgress] - Progress callback invoked every 10,000 nodes.
   *   Receives `{ processedNodes: number, currentMemoryBytes: null }`.
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation. Checked every
   *   10,000 nodes to balance responsiveness with performance.
   * @param {Map<string, string>} [options.frontier] - Frontier to persist with the index
   * @returns {Promise<string>} Tree OID of the persisted index
   * @throws {OperationAbortedError} If the signal is aborted during iteration
   * @throws {Error} If node iteration fails (e.g., invalid ref, Git error)
   * @throws {Error} If index persistence fails (storage error)
   * @private
   */
  async _rebuildInMemory(ref, { limit, onProgress, signal, frontier }) {
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

    return await this._persistIndex(builder, { frontier });
  }

  /**
   * Streaming rebuild implementation with memory-bounded operation.
   *
   * Uses StreamingBitmapIndexBuilder to flush bitmap data to storage when
   * memory usage exceeds the threshold. Multiple chunks are written during
   * iteration, then merged at finalization.
   *
   * **Memory usage**: Bounded by `maxMemoryBytes`. When exceeded, current
   * bitmap data is serialized and flushed to storage, freeing memory for
   * continued iteration.
   *
   * **I/O pattern**: Higher I/O than in-memory mode due to intermediate
   * flushes. Each flush writes partial shards that are later merged.
   *
   * **Trade-offs**: Use streaming mode when:
   * - Graph is too large to fit in memory
   * - Memory is constrained (container limits, shared systems)
   * - You can tolerate longer rebuild times for lower memory usage
   *
   * @param {string} ref - Git ref to traverse from
   * @param {Object} options - Options
   * @param {number} options.limit - Maximum nodes to process
   * @param {number} options.maxMemoryBytes - Memory threshold in bytes. When estimated
   *   bitmap memory exceeds this, a flush is triggered.
   * @param {Function} [options.onFlush] - Flush callback invoked after each flush.
   *   Receives `{ flushedBytes, totalFlushedBytes, flushCount }`.
   * @param {Function} [options.onProgress] - Progress callback invoked every 10,000 nodes.
   *   Receives `{ processedNodes, currentMemoryBytes }`.
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation. Checked every
   *   10,000 nodes during iteration and at finalization.
   * @param {Map<string, string>} [options.frontier] - Frontier to persist with the index
   * @returns {Promise<string>} Tree OID of the persisted index
   * @throws {OperationAbortedError} If the signal is aborted during iteration or finalization
   * @throws {Error} If node iteration fails (e.g., invalid ref, Git error)
   * @throws {Error} If flush or finalization fails (storage error)
   * @private
   */
  async _rebuildStreaming(ref, { limit, maxMemoryBytes, onFlush, onProgress, signal, frontier }) {
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

    return await builder.finalize({ signal, frontier });
  }

  /**
   * Persists a built index to storage (in-memory builder only).
   *
   * Serializes the builder's state and writes each shard as a blob,
   * then creates a tree containing all shards.
   *
   * **Persistence format**: Creates a flat tree with entries like:
   * - `100644 blob <oid>\tmeta_00.json`
   * - `100644 blob <oid>\tshards_fwd_00.json`
   * - `100644 blob <oid>\tshards_rev_00.json`
   * - `100644 blob <oid>\tfrontier.json` (if frontier provided)
   *
   * @param {BitmapIndexBuilder} builder - The builder containing index data
   * @param {Object} [options] - Persistence options
   * @param {Map<string, string>} [options.frontier] - Frontier to include in the tree
   * @returns {Promise<string>} OID of the created tree
   * @throws {Error} If storage.writeBlob() fails for any shard
   * @throws {Error} If storage.writeTree() fails
   * @private
   */
  async _persistIndex(builder, { frontier } = {}) {
    const treeStructure = builder.serialize({ frontier });
    const flatEntries = [];
    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.storage.writeBlob(buffer);
      flatEntries.push(`100644 blob ${oid}\t${path}`);
    }
    return await this.storage.writeTree(flatEntries);
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
   * in a ref (e.g., 'refs/warp/index') for persistence across sessions.
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
   * @param {Map<string, string>} [options.currentFrontier] - Frontier to compare for staleness.
   *   Maps writer IDs to their current tip SHAs. When provided, triggers a staleness
   *   check against the frontier stored in the index.
   * @param {boolean} [options.autoRebuild=false] - Auto-rebuild when a stale index is detected.
   *   Requires `rebuildRef` to be set.
   * @param {string} [options.rebuildRef] - Git ref to rebuild from when `autoRebuild` is true.
   *   Required if `autoRebuild` is true.
   * @returns {Promise<BitmapIndexReader>} Configured reader ready for O(1) queries.
   *   The reader lazily loads shards on demand; initial load is O(1).
   * @throws {Error} If treeOid is invalid or tree cannot be read from storage
   * @throws {Error} If autoRebuild is true but rebuildRef is not provided
   * @throws {ShardValidationError} (strict mode) If shard structure validation fails
   *   (e.g., missing required fields, invalid format)
   * @throws {ShardCorruptionError} (strict mode) If shard data integrity check fails
   *   (e.g., checksum mismatch, truncated data)
   * @throws {ShardLoadError} (strict mode) If shard cannot be loaded from storage
   *   (e.g., blob not found, I/O error)
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
   * const savedOid = await storage.readRef('refs/warp/index');
   * const reader = await rebuildService.load(savedOid);
   */
  async load(treeOid, { strict = true, currentFrontier, autoRebuild = false, rebuildRef } = {}) {
    this.logger.debug('Loading index', {
      operation: 'load',
      treeOid,
      strict,
    });

    if (autoRebuild && !rebuildRef) {
      throw new Error('rebuildRef is required when autoRebuild is true');
    }

    const startTime = performance.now();
    const shardOids = await this.storage.readTreeOids(treeOid);
    const shardCount = Object.keys(shardOids).length;

    // Staleness check
    if (currentFrontier) {
      const indexFrontier = await loadIndexFrontier(shardOids, this.storage);
      if (indexFrontier) {
        const result = checkStaleness(indexFrontier, currentFrontier);
        if (result.stale) {
          this.logger.warn('Index is stale', {
            operation: 'load',
            reason: result.reason,
            hint: 'Rebuild the index or pass autoRebuild: true',
          });
          if (autoRebuild && rebuildRef) {
            const newTreeOid = await this.rebuild(rebuildRef, { frontier: currentFrontier });
            return await this.load(newTreeOid, { strict });
          }
        }
      } else {
        this.logger.debug('No frontier in index (legacy); skipping staleness check', {
          operation: 'load',
        });
      }
    }

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
