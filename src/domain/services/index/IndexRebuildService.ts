import defaultCodec from '../../utils/defaultCodec.ts';
import BitmapIndexBuilder from './BitmapIndexBuilder.ts';
import BitmapIndexReader from './BitmapIndexReader.ts';
import StreamingBitmapIndexBuilder from './StreamingBitmapIndexBuilder.ts';
import { loadIndexFrontier, checkStaleness } from './IndexStalenessChecker.ts';
import nullLogger from '../../utils/nullLogger.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import IndexError from '../../errors/IndexError.ts';
import type IndexStoragePort from '../../../ports/IndexStoragePort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import defaultClock from '../../utils/defaultClock.ts';

type GraphService = {
  iterateNodes(opts: { ref: string; limit: number }): AsyncIterable<{ sha: string; parents: string[] }>;
};

type RebuildOptions = {
  limit?: number;
  maxMemoryBytes?: number;
  onFlush?: (stats: { flushedBytes: number; totalFlushedBytes: number; flushCount: number }) => void;
  onProgress?: (stats: { processedNodes: number; currentMemoryBytes: number | null }) => void;
  signal?: AbortSignal;
  frontier?: Map<string, string>;
};

type InMemoryOptions = {
  limit: number;
  onProgress?: (stats: { processedNodes: number; currentMemoryBytes: number | null }) => void;
  signal?: AbortSignal;
  frontier?: Map<string, string>;
};

type StreamingOptions = {
  limit: number;
  maxMemoryBytes: number;
  onFlush?: (stats: { flushedBytes: number; totalFlushedBytes: number; flushCount: number }) => void;
  onProgress?: (stats: { processedNodes: number; currentMemoryBytes: number }) => void;
  signal?: AbortSignal;
  frontier?: Map<string, string>;
};

type LoadOptions = {
  strict?: boolean;
  currentFrontier?: Map<string, string>;
  autoRebuild?: boolean;
  rebuildRef?: string;
};

/**
 * Service for building and loading the bitmap index from the graph.
 *
 * This service orchestrates index creation by walking the graph and persisting
 * the resulting bitmap shards to storage via the IndexStoragePort. The bitmap
 * index enables O(1) neighbor lookups (children/parents) after a one-time
 * O(N) rebuild cost.
 *
 * @module domain/services/index/IndexRebuildService
 * @see BitmapIndexBuilder
 * @see BitmapIndexReader
 * @see StreamingBitmapIndexBuilder
 */
export default class IndexRebuildService {
  private readonly graphService: GraphService;
  private readonly storage: IndexStoragePort & BlobPort & TreePort;
  private readonly logger: LoggerPort;
  private readonly _codec: CodecPort;
  private readonly _clock: ClockPort;

  constructor(options: {
    graphService: GraphService;
    storage: IndexStoragePort & BlobPort & TreePort;
    logger?: LoggerPort;
    codec?: CodecPort;
    crypto?: unknown;
    clock?: ClockPort;
  }) {
    const { graphService, storage, logger = nullLogger, codec, crypto, clock } = options ?? {};
    if (graphService === undefined || graphService === null) {
      throw new IndexError(
        'IndexRebuildService requires a graphService',
        { code: 'E_INDEX_MISSING_GRAPH_SERVICE' },
      );
    }
    if (storage === undefined || storage === null) {
      throw new IndexError(
        'IndexRebuildService requires a storage adapter',
        { code: 'E_INDEX_MISSING_STORAGE' },
      );
    }
    this.graphService = graphService;
    this.storage = storage;
    this.logger = logger;
    this._codec = codec ?? defaultCodec;
    this._clock = clock ?? defaultClock;
    void crypto; // reserved for future use
  }

  /**
   * Rebuilds the bitmap index by walking the graph from a ref.
   *
   * @returns OID of the created tree containing the index
   */
  async rebuild(ref: string, options: RebuildOptions = {}): Promise<string> {
    const { limit = 10_000_000, maxMemoryBytes, onFlush, onProgress, signal, frontier } = options;
    if (maxMemoryBytes !== undefined && maxMemoryBytes <= 0) {
      throw new IndexError(
        'maxMemoryBytes must be a positive number',
        { code: 'E_INDEX_INVALID_MEMORY_LIMIT', context: { maxMemoryBytes } },
      );
    }
    const mode = maxMemoryBytes !== undefined ? 'streaming' : 'in-memory';
    this.logger.info('Starting index rebuild', {
      operation: 'rebuild',
      ref,
      limit,
      mode,
      maxMemoryBytes: maxMemoryBytes ?? null,
    });

    const startTime = this._clock.now();

    try {
      let treeOid: string;
      if (maxMemoryBytes !== undefined) {
        // Build the required fields first, then attach optional ones only when present
        // to satisfy exactOptionalPropertyTypes.
        treeOid = await this._rebuildStreaming(ref, this._buildStreamOpts(
          limit, maxMemoryBytes, onFlush, onProgress, signal, frontier,
        ));
      } else {
        const memOpts: InMemoryOptions = { limit };
        if (onProgress) { memOpts.onProgress = onProgress; }
        if (signal) { memOpts.signal = signal; }
        if (frontier) { memOpts.frontier = frontier; }
        treeOid = await this._rebuildInMemory(ref, memOpts);
      }

      const durationMs = this._clock.now() - startTime;
      this.logger.info('Index rebuild complete', {
        operation: 'rebuild',
        ref,
        mode,
        treeOid,
        durationMs,
      });

      return treeOid;
    } catch (err) {
      const durationMs = this._clock.now() - startTime;
      this.logger.error('Index rebuild failed', {
        operation: 'rebuild',
        ref,
        mode,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      });
      throw err;
    }
  }

  private _buildStreamOpts(
    limit: number,
    maxMemoryBytes: number,
    onFlush: RebuildOptions['onFlush'],
    onProgress: RebuildOptions['onProgress'],
    signal: AbortSignal | undefined,
    frontier: Map<string, string> | undefined,
  ): StreamingOptions {
    const base: StreamingOptions = { limit, maxMemoryBytes };
    if (onFlush !== undefined) { base.onFlush = onFlush; }
    if (onProgress !== undefined) {
      base.onProgress = onProgress as (stats: { processedNodes: number; currentMemoryBytes: number }) => void;
    }
    if (signal !== undefined) { base.signal = signal; }
    if (frontier !== undefined) { base.frontier = frontier; }
    return base;
  }

  private async _rebuildInMemory(ref: string, options: InMemoryOptions): Promise<string> {
    const { limit, onProgress, signal, frontier } = options;
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

    return await this._persistIndex(builder, frontier ? { frontier } : {});
  }

  private async _rebuildStreaming(ref: string, options: StreamingOptions): Promise<string> {
    const { limit, maxMemoryBytes, onFlush, onProgress, signal, frontier } = options;
    const streamOpts: ConstructorParameters<typeof StreamingBitmapIndexBuilder>[0] = {
      storage: this.storage,
      maxMemoryBytes,
    };
    if (onFlush) { streamOpts.onFlush = onFlush; }
    const builder = new StreamingBitmapIndexBuilder(streamOpts);

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
          const stats = builder.getMemoryStats() as { estimatedBitmapBytes: number };
          onProgress({
            processedNodes,
            currentMemoryBytes: stats.estimatedBitmapBytes,
          });
        }
      }
    }

    const finalizeOpts: { signal?: AbortSignal; frontier?: Map<string, string> } = {};
    if (signal) { finalizeOpts.signal = signal; }
    if (frontier) { finalizeOpts.frontier = frontier; }
    return await builder.finalize(finalizeOpts);
  }

  private async _persistIndex(builder: BitmapIndexBuilder, options?: { frontier?: Map<string, string> }): Promise<string> {
    const { frontier } = options ?? {};
    const treeStructure = builder.serialize(frontier ? { frontier } : {});
    const flatEntries: string[] = [];
    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.storage.writeBlob(buffer);
      flatEntries.push(`100644 blob ${oid}\t${path}`);
    }
    return await this.storage.writeTree(flatEntries);
  }

  /**
   * Loads a previously built index from a tree OID.
   *
   * @returns Configured reader ready for O(1) queries.
   */
  async load(treeOid: string, options: LoadOptions = {}): Promise<BitmapIndexReader> {
    const { strict = true, currentFrontier, autoRebuild = false, rebuildRef } = options;
    this.logger.debug('Loading index', {
      operation: 'load',
      treeOid,
      strict,
    });

    if (autoRebuild && (rebuildRef === undefined || rebuildRef.length === 0)) {
      throw new IndexError(
        'rebuildRef is required when autoRebuild is true',
        { code: 'E_INDEX_MISSING_REBUILD_REF' },
      );
    }

    const startTime = this._clock.now();
    const shardOids = await this.storage.readTreeOids(treeOid);
    const shardCount = Object.keys(shardOids).length;

    // Staleness check
    if (currentFrontier) {
      const indexFrontier = await loadIndexFrontier(
        shardOids,
        this.storage,
        { codec: this._codec },
      );
      if (indexFrontier) {
        const result = checkStaleness(indexFrontier, currentFrontier);
        if (result.stale) {
          this.logger.warn('Index is stale', {
            operation: 'load',
            reason: result.reason,
            hint: 'Rebuild the index or pass autoRebuild: true',
          });
          if (autoRebuild && rebuildRef !== undefined && rebuildRef.length > 0) {
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

    const reader = new BitmapIndexReader({
      storage: this.storage,
      strict,
      logger: this.logger.child({ component: 'BitmapIndexReader' }),
    });
    reader.setup(shardOids);

    const durationMs = this._clock.now() - startTime;
    this.logger.debug('Index loaded', {
      operation: 'load',
      treeOid,
      shardCount,
      durationMs,
    });

    return reader;
  }
}
