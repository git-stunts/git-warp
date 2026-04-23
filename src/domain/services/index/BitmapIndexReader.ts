import { IndexError, ShardLoadError, ShardCorruptionError } from '../../errors/index.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import nullLogger from '../../utils/nullLogger.ts';
import LRUCache from '../../utils/LRUCache.ts';
import { getRoaringBitmap32 } from '../../utils/roaring.ts';
import { isValidShardOid } from '../../utils/validateShardOid.ts';
import type IndexStoragePort from '../../../ports/IndexStoragePort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';

type LoadedShard = Record<string, number> | Record<string, Uint8Array>;

/** Default maximum number of shards to cache. */
const DEFAULT_MAX_CACHED_SHARDS = 100;
const LARGE_ID_CACHE_WARNING_THRESHOLD = 1_000_000;
const ESTIMATED_ID_CACHE_ENTRY_BYTES = 40;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMetaShardPath(path: string): boolean {
  return /^meta_[0-9a-f]{2}(?:\.chunk-\d{6})?\.cbor$/.test(path);
}

function isChunkedVariant(path: string, basePath: string): boolean {
  const base = basePath.endsWith('.cbor') ? basePath.slice(0, -5) : basePath;
  return path.startsWith(`${base}.chunk-`) && path.endsWith('.cbor');
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
  private readonly storage: IndexStoragePort;
  private readonly strict: boolean;
  private readonly logger: LoggerPort;
  private readonly _codec: CodecPort;
  readonly maxCachedShards: number;
  private shardOids: Map<string, string>;
  private readonly loadedShards: LRUCache<string, LoadedShard>;
  private _idToShaCache: string[] | null;

  constructor(options: {
    storage: IndexStoragePort;
    strict?: boolean;
    logger?: LoggerPort;
    maxCachedShards?: number;
    codec?: CodecPort;
  }) {
    const { storage, strict = true, logger = nullLogger, maxCachedShards = DEFAULT_MAX_CACHED_SHARDS, codec } = options;
    BitmapIndexReader._assertStorage(storage);
    this.storage = storage;
    this.strict = strict;
    this.logger = logger;
    this._codec = codec ?? defaultCodec;
    this.maxCachedShards = maxCachedShards;
    this.shardOids = new Map();
    this.loadedShards = new LRUCache(maxCachedShards);
    this._idToShaCache = null;
  }

  private static _assertStorage(storage: IndexStoragePort | null | undefined): void {
    if (storage === null || storage === undefined) {
      throw new IndexError('BitmapIndexReader requires a storage adapter', {
        code: 'E_INDEX_STORAGE_REQUIRED',
      });
    }
  }

  /**
   * Configures the reader with shard OID mappings for lazy loading.
   */
  setup(shardOids: Record<string, string>): void {
    const entries = Object.entries(shardOids);
    const validEntries: [string, string][] = [];
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
   */
  async lookupId(sha: string): Promise<number | undefined> {
    const prefix = sha.substring(0, 2);
    const path = `meta_${prefix}.cbor`;
    for (const actualPath of this._resolveShardPaths(path)) {
      const idMap = await this._getOrLoadShard(actualPath) as Record<string, number>;
      const id = idMap[sha];
      if (typeof id === 'number') {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Gets parent SHAs for a node (O(1) via reverse bitmap).
   */
  async getParents(sha: string): Promise<string[]> {
    return await this._getEdges(sha, 'rev');
  }

  /**
   * Gets child SHAs for a node (O(1) via forward bitmap).
   */
  async getChildren(sha: string): Promise<string[]> {
    return await this._getEdges(sha, 'fwd');
  }

  private async _getEdges(sha: string, type: string): Promise<string[]> {
    const prefix = sha.substring(0, 2);
    const shardPath = `shards_${type}_${prefix}.cbor`;
    const neighborIds = new Set<number>();
    for (const actualPath of this._resolveShardPaths(shardPath)) {
      const shard = await this._getOrLoadShard(actualPath) as Record<string, Uint8Array>;
      const bitmapBytes = shard[sha];
      if (!bitmapBytes || !(bitmapBytes instanceof Uint8Array) || bitmapBytes.length === 0) {
        continue;
      }
      const ids = this._deserializeBitmapIds(bitmapBytes, actualPath);
      for (const id of ids) {
        neighborIds.add(id);
      }
    }
    const idToSha = await this._buildIdToShaMapping();
    const result: string[] = [];
    for (const id of neighborIds) {
      const neighbor = idToSha[id];
      if (typeof neighbor === 'string') {
        result.push(neighbor);
      }
    }
    return result;
  }

  private _deserializeBitmapIds(bitmapBytes: Uint8Array, shardPath: string): number[] {
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

  private async _buildIdToShaMapping(): Promise<string[]> {
    if (this._idToShaCache !== null) {
      return this._idToShaCache;
    }
    const cache: string[] = [];
    this._idToShaCache = cache;

    for (const [path] of this.shardOids) {
      if (!isMetaShardPath(path)) {
        continue;
      }
      const shard = await this._getOrLoadShard(path) as Record<string, number>;
      for (const [sha, id] of Object.entries(shard)) {
        cache[id] = sha;
      }
    }

    this._warnLargeIdCache(cache.length);
    return cache;
  }

  private _warnLargeIdCache(entryCount: number): void {
    if (entryCount < LARGE_ID_CACHE_WARNING_THRESHOLD) {
      return;
    }
    this.logger.warn('ID-to-SHA cache has high memory usage', {
      operation: '_buildIdToShaMapping',
      entryCount,
      estimatedMemoryBytes: entryCount * ESTIMATED_ID_CACHE_ENTRY_BYTES,
    });
  }

  private async _getOrLoadShard(path: string): Promise<LoadedShard> {
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

  private _resolveShardPaths(basePath: string): string[] {
    const exact = this.shardOids.has(basePath) ? [basePath] : [];
    const chunked = Array.from(this.shardOids.keys())
      .filter((path) => isChunkedVariant(path, basePath))
      .sort();
    return [...exact, ...chunked];
  }

  private _decodeAndCacheShard(buffer: Uint8Array, path: string, oid: string): LoadedShard {
    try {
      const data = this._codec.decode<LoadedShard>(buffer);
      this.loadedShards.set(path, data);
      return data;
    } catch (err) {
      return this._handleDecodeError(err, path, oid);
    }
  }

  private _handleDecodeError(err: unknown, path: string, oid: string): LoadedShard {
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

  private async _loadShardBuffer(path: string, oid: string): Promise<Uint8Array> {
    try {
      return await this.storage.readBlob(oid);
    } catch (cause) {
      throw new ShardLoadError('Failed to load shard from storage', {
        shardPath: path,
        oid,
        cause: cause as Error,
      });
    }
  }
}
