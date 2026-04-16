/**
 * Streaming bitmap index builder with memory-bounded operation.
 *
 * Flushes bitmap data to storage when memory exceeds a threshold,
 * then merges multi-chunk shards at finalization. Delegates bitmap
 * accumulation to BitmapAccumulator.
 *
 * Shard format: plain CBOR via CodecPort. No envelopes, no checksums —
 * git-cas handles integrity at the storage layer.
 *
 * @module domain/services/index/StreamingBitmapIndexBuilder
 */

import type CodecPort from '../../../ports/CodecPort.ts';
import type IndexStoragePort from '../../../ports/IndexStoragePort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import nullLogger from '../../utils/nullLogger.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import IndexError from '../../errors/IndexError.ts';
import BitmapAccumulator from './BitmapAccumulator.ts';

/** Default memory threshold before flushing (50 MB). */
const DEFAULT_MAX_MEMORY_BYTES = 50 * 1024 * 1024;

export type FlushStats = {
  flushedBytes: number;
  totalFlushedBytes: number;
  flushCount: number;
};

export type BuilderOptions = {
  storage: IndexStoragePort;
  maxMemoryBytes?: number;
  onFlush?: (stats: FlushStats) => void;
  logger?: LoggerPort;
  codec?: CodecPort;
};

export default class StreamingBitmapIndexBuilder {
  private readonly _storage: IndexStoragePort;
  private readonly _codec: CodecPort;
  private readonly _logger: LoggerPort;
  private readonly _maxMemoryBytes: number;
  private readonly _onFlush: ((stats: FlushStats) => void) | undefined;
  private readonly _accumulator: BitmapAccumulator;
  private readonly _flushedChunks: Map<string, string[]> = new Map();
  private _totalFlushedBytes: number = 0;
  private _flushCount: number = 0;

  constructor(options: BuilderOptions) {
    const { storage, maxMemoryBytes } = StreamingBitmapIndexBuilder._validate(options);
    this._storage = storage;
    this._maxMemoryBytes = maxMemoryBytes;
    this._codec = options.codec ?? defaultCodec;
    this._logger = options.logger ?? nullLogger;
    this._onFlush = options.onFlush;
    this._accumulator = new BitmapAccumulator();
  }

  private static _validate(options: BuilderOptions): { storage: IndexStoragePort; maxMemoryBytes: number } {
    StreamingBitmapIndexBuilder._assertStorage(options.storage);
    const maxMem = options.maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES;
    StreamingBitmapIndexBuilder._assertMaxMemory(maxMem);
    return { storage: options.storage, maxMemoryBytes: maxMem };
  }

  private static _assertStorage(storage: IndexStoragePort | null | undefined): asserts storage is IndexStoragePort {
    if (storage === null || storage === undefined) {
      throw new IndexError(
        'StreamingBitmapIndexBuilder requires a storage adapter',
        { code: 'E_INDEX_INVALID_OPTIONS', context: { field: 'storage' } },
      );
    }
  }

  private static _assertMaxMemory(maxMem: number): void {
    if (typeof maxMem !== 'number' || maxMem <= 0) {
      throw new IndexError(
        'maxMemoryBytes must be a positive number',
        { code: 'E_INDEX_INVALID_OPTIONS', context: { field: 'maxMemoryBytes', value: maxMem } },
      );
    }
  }

  /** Registers a node and returns its numeric ID. */
  registerNode(sha: string): Promise<number> {
    return Promise.resolve(this._accumulator.registerNode(sha));
  }

  /** Adds a directed edge. May trigger flush if memory threshold exceeded. */
  async addEdge(srcSha: string, tgtSha: string): Promise<void> {
    this._accumulator.addEdge(srcSha, tgtSha);
    if (this._accumulator.estimatedBitmapBytes >= this._maxMemoryBytes) {
      await this.flush();
    }
  }

  /** Flushes in-memory bitmaps to storage as CBOR shard blobs. */
  async flush(): Promise<void> {
    if (this._accumulator.bitmapCount === 0) {
      return;
    }

    const flushedBytes = this._accumulator.estimatedBitmapBytes;
    const shards = this._accumulator.serializeBitmapsToShards();
    await this._writeShardsToStorage(shards);

    this._accumulator.clearBitmaps();
    this._totalFlushedBytes += flushedBytes;
    this._flushCount++;

    this._logger.debug('Flushed bitmap data', {
      operation: 'flush',
      flushedBytes,
      totalFlushedBytes: this._totalFlushedBytes,
      flushCount: this._flushCount,
    });

    if (this._onFlush) {
      this._onFlush({
        flushedBytes,
        totalFlushedBytes: this._totalFlushedBytes,
        flushCount: this._flushCount,
      });
    }
  }

  /** Returns current memory statistics for monitoring. */
  getMemoryStats(): {
    estimatedBitmapBytes: number;
    estimatedMappingBytes: number;
    totalFlushedBytes: number;
    flushCount: number;
    nodeCount: number;
    bitmapCount: number;
  } {
    return {
      estimatedBitmapBytes: this._accumulator.estimatedBitmapBytes,
      estimatedMappingBytes: this._accumulator.estimatedMappingBytes,
      totalFlushedBytes: this._totalFlushedBytes,
      flushCount: this._flushCount,
      nodeCount: this._accumulator.nodeCount,
      bitmapCount: this._accumulator.bitmapCount,
    };
  }

  /**
   * Finalizes the index: flush remaining data, merge chunks, write tree.
   * Returns the OID of the Git tree containing the complete index.
   */
  async finalize(options?: {
    signal?: AbortSignal;
    frontier?: Map<string, string>;
  }): Promise<string> {
    const { signal, frontier } = options ?? {};
    this._logger.debug('Finalizing index', {
      operation: 'finalize',
      nodeCount: this._accumulator.nodeCount,
      totalFlushedBytes: this._totalFlushedBytes,
      flushCount: this._flushCount,
    });
    const flatEntries = await this._buildAllEntries(signal);
    if (frontier) {
      await this._writeFrontierEntries(frontier, flatEntries);
    }
    return await this._writeAndLogTree(flatEntries);
  }

  private async _buildAllEntries(signal?: AbortSignal): Promise<string[]> {
    checkAborted(signal, 'finalize');
    await this.flush();
    checkAborted(signal, 'finalize');
    const metaEntries = await this._writeMetaShards();
    checkAborted(signal, 'finalize');
    const bitmapEntries = await this._processBitmapShards(signal);
    return [...metaEntries, ...bitmapEntries];
  }

  private async _writeAndLogTree(flatEntries: string[]): Promise<string> {
    const treeOid = await this._storage.writeTree(flatEntries);
    this._logger.debug('Index finalized', {
      operation: 'finalize',
      treeOid,
      shardCount: flatEntries.length,
      nodeCount: this._accumulator.nodeCount,
    });
    return treeOid;
  }

  private async _writeShardsToStorage(shards: {
    fwd: Record<string, Record<string, Uint8Array>>;
    rev: Record<string, Record<string, Uint8Array>>;
  }): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const dir of ['fwd', 'rev'] as const) {
      for (const [prefix, data] of Object.entries(shards[dir])) {
        const path = `shards_${dir}_${prefix}.cbor`;
        tasks.push(
          (async (): Promise<void> => {
            const encoded = this._codec.encode(data);
            const oid = await this._storage.writeBlob(encoded);
            if (!this._flushedChunks.has(path)) {
              this._flushedChunks.set(path, []);
            }
            this._flushedChunks.get(path)!.push(oid);
          })(),
        );
      }
    }
    await Promise.all(tasks);
  }

  private async _writeMetaShards(): Promise<string[]> {
    const metaShards = this._accumulator.buildMetaShards();
    return await Promise.all(
      Object.entries(metaShards).map(async ([prefix, map]) => {
        const encoded = this._codec.encode(map);
        const oid = await this._storage.writeBlob(encoded);
        return `100644 blob ${oid}\tmeta_${prefix}.cbor`;
      }),
    );
  }

  private async _processBitmapShards(
    signal?: AbortSignal,
  ): Promise<string[]> {
    return await Promise.all(
      Array.from(this._flushedChunks.entries()).map(async ([path, oids]) => {
        checkAborted(signal, 'processBitmapShards');
        const finalOid = oids.length === 1
          ? oids[0]
          : await this._mergeChunks(oids, signal);
        return `100644 blob ${finalOid}\t${path}`;
      }),
    );
  }

  private async _mergeChunks(
    oids: string[],
    signal?: AbortSignal,
  ): Promise<string> {
    const merged = await this._loadAndMergeAllChunks(oids, signal);
    const result: Record<string, Uint8Array> = {};
    for (const [sha, bitmap] of Object.entries(merged)) {
      result[sha] = new Uint8Array(bitmap.serialize(true));
    }
    return await this._storage.writeBlob(this._codec.encode(result));
  }

  private async _loadAndMergeAllChunks(
    oids: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, RoaringBitmapSubset>> {
    const RoaringBitmap32 = getRoaringBitmap32();
    const merged: Record<string, RoaringBitmapSubset> = {};
    for (const oid of oids) {
      checkAborted(signal, 'mergeChunks');
      const buffer = await this._storage.readBlob(oid);
      const chunk = this._codec.decode<Record<string, Uint8Array | number[]>>(buffer);
      for (const [sha, bitmapBytes] of Object.entries(chunk)) {
        const bytes = bitmapBytes instanceof Uint8Array ? bitmapBytes : new Uint8Array(bitmapBytes);
        const bitmap = RoaringBitmap32.deserialize(bytes, true);
        if (!merged[sha]) {
          merged[sha] = bitmap;
        } else {
          merged[sha].orInPlace(bitmap);
        }
      }
    }
    return merged;
  }

  private async _writeFrontierEntries(
    frontier: Map<string, string>,
    entries: string[],
  ): Promise<void> {
    const sorted: Record<string, string | undefined> = {};
    for (const key of Array.from(frontier.keys()).sort()) {
      sorted[key] = frontier.get(key);
    }
    const envelope = { version: 1, writerCount: frontier.size, frontier: sorted };
    const cborOid = await this._storage.writeBlob(this._codec.encode(envelope));
    entries.push(`100644 blob ${cborOid}\tfrontier.cbor`);
    const jsonOid = await this._storage.writeBlob(textEncode(canonicalStringify(envelope)));
    entries.push(`100644 blob ${jsonOid}\tfrontier.json`);
  }
}
