/**
 * Reads property index shards lazily with LRU caching.
 *
 * Loads `props_XX.cbor` shards on demand via IndexStoragePort.readBlob.
 *
 * @module domain/services/index/PropertyIndexReader
 */

import defaultCodec from '../../utils/defaultCodec.ts';
import computeShardKey from '../../utils/shardKey.ts';
import LRUCache from '../../utils/LRUCache.ts';
import IndexError from '../../errors/IndexError.ts';
import type IndexStoragePort from '../../../ports/IndexStoragePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';

type IndexedPropertyBag = { [key: string]: PropValue };
type PropertyShard = { [nodeId: string]: IndexedPropertyBag };
type PropertyShardEntry = readonly [string, IndexedPropertyBag];

function createNullRecord(): PropertyShard {
  return {};
}

function isIndexedPropertyBag(value: unknown): value is IndexedPropertyBag {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => isPropValue(entry));
}

function isPropertyShardEntry(value: unknown): value is PropertyShardEntry {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'string'
    && isIndexedPropertyBag(value[1]);
}

export default class PropertyIndexReader {
  private readonly _storage: IndexStoragePort | undefined;
  private readonly _codec: CodecPort;
  private readonly _indexStore: IndexStorePort | null;
  private _shardOids: Map<string, string>;
  private readonly _cache: LRUCache<string, PropertyShard>;

  constructor(options?: {
    storage?: IndexStoragePort;
    codec?: CodecPort;
    indexStore?: IndexStorePort;
    maxCachedShards?: number;
  }) {
    const { storage, codec, indexStore, maxCachedShards = 64 } = options ?? {};
    this._storage = storage;
    this._codec = codec ?? defaultCodec;
    this._indexStore = indexStore ?? null;
    this._shardOids = new Map();
    this._cache = new LRUCache(maxCachedShards);
  }

  /**
   * Configures OID mappings for lazy loading.
   */
  setup(shardOids: Record<string, string>): void {
    this._shardOids = new Map(Object.entries(shardOids));
    this._cache.clear();
  }

  /**
   * Returns all properties for a node, or null if not found.
   */
  async getNodeProps(nodeId: string): Promise<IndexedPropertyBag | null> {
    const shard = await this._loadShard(nodeId);
    if (!shard) {
      return null;
    }
    return shard[nodeId] ?? null;
  }

  /**
   * Returns a single property value, or undefined.
   */
  async getProperty(nodeId: string, key: string): Promise<PropValue | undefined> {
    const props = await this.getNodeProps(nodeId);
    if (!props) {
      return undefined;
    }
    return props[key];
  }

  private async _loadShard(nodeId: string): Promise<PropertyShard | null> {
    const shardKey = computeShardKey(nodeId);
    const path = `props_${shardKey}.cbor`;

    const cached = this._cache.get(path);
    if (cached !== undefined) {
      return cached;
    }

    const oid = this._resolveOid(path);
    if (oid === null) {
      return null;
    }

    return await this._fetchAndDecode(oid, path);
  }

  private _resolveOid(path: string): string | null {
    const oid = this._shardOids.get(path);
    if (oid === undefined || oid === '') {
      return null;
    }
    if (!this._storage && !this._indexStore) {
      return null;
    }
    return oid;
  }

  private async _fetchAndDecode(oid: string, path: string): Promise<PropertyShard> {
    if (this._indexStore) {
      const decoded: unknown = await this._indexStore.decodeShard(oid);
      return this._parseShard(decoded, path);
    }
    const storage = this._storage as { readBlob(oid: string): Promise<Uint8Array | undefined | null> };
    const buffer = await storage.readBlob(oid);
    if (buffer === null || buffer === undefined) {
      throw new IndexError(
        `PropertyIndexReader: missing blob for OID '${oid}' (${path})`,
        { code: 'E_INDEX_SHARD_MISSING', context: { oid, path } },
      );
    }
    const decoded: unknown = this._codec.decode(buffer);
    return this._parseShard(decoded, path);
  }

  private _parseShard(decoded: unknown, path: string): PropertyShard {
    if (!Array.isArray(decoded)) {
      const shape = decoded === null ? 'null' : typeof decoded;
      throw new IndexError(
        `PropertyIndexReader: invalid shard format for '${path}' (expected array, got ${shape})`,
        { code: 'E_INDEX_SHARD_MALFORMED', context: { path, shape } },
      );
    }

    const data = createNullRecord();
    for (const entry of decoded) {
      if (!isPropertyShardEntry(entry)) {
        throw new IndexError(
          `PropertyIndexReader: invalid shard property bag for '${path}'`,
          { code: 'E_INDEX_SHARD_MALFORMED', context: { path } },
        );
      }
      data[entry[0]] = entry[1];
    }
    this._cache.set(path, data);
    return data;
  }
}
