/**
 * Reads property index shards lazily with LRU caching.
 *
 * Loads `props_XX.cbor` shards on demand through IndexStorePort.
 *
 * @module domain/services/index/PropertyIndexReader
 */

import computeShardKey from '../../utils/shardKey.ts';
import LRUCache from '../../utils/LRUCache.ts';
import IndexError from '../../errors/IndexError.ts';
import { requireCodec } from '../codec/CodecRequirement.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import type AssetHandle from '../../storage/AssetHandle.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';
import type CodecValue from '../../types/codec/CodecValue.ts';

type IndexedPropertyBag = { [key: string]: PropValue };
type PropertyShard = { [nodeId: string]: IndexedPropertyBag };
type PropertyShardEntry = readonly [string, IndexedPropertyBag];

function createNullRecord(): PropertyShard {
  return {};
}

function isIndexedPropertyBag(value: CodecValue): value is IndexedPropertyBag {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => isPropValue(entry));
}

function isPropertyShardEntry(value: CodecValue): value is PropertyShardEntry {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'string'
    && isIndexedPropertyBag(value[1]);
}

export default class PropertyIndexReader {
  private readonly _codec: CodecPort | null;
  private readonly _indexStore: IndexStorePort | null;
  private _shardHandles: Map<string, AssetHandle>;
  private _inMemoryShards: Map<string, Uint8Array>;
  private readonly _cache: LRUCache<string, PropertyShard>;

  constructor(options?: {
    codec?: CodecPort;
    indexStore?: IndexStorePort;
    maxCachedShards?: number;
  }) {
    const { codec, indexStore, maxCachedShards = 64 } = options ?? {};
    this._codec = codec ?? null;
    this._indexStore = indexStore ?? null;
    this._shardHandles = new Map();
    this._inMemoryShards = new Map();
    this._cache = new LRUCache(maxCachedShards);
  }

  /**
   * Configures OID mappings for lazy loading.
   */
  setupHandles(shardHandles: Readonly<Record<string, AssetHandle>>): void {
    this._shardHandles = new Map(Object.entries(shardHandles));
    this._inMemoryShards.clear();
    this._cache.clear();
  }

  /** Configures encoded in-memory shards for a freshly built view. */
  setupTree(tree: Readonly<Record<string, Uint8Array>>): void {
    this._shardHandles.clear();
    this._inMemoryShards = new Map(
      Object.entries(tree).filter(([path]) => path.startsWith('props_')),
    );
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

    const handle = this._shardHandles.get(path);
    const inMemory = this._inMemoryShards.get(path);
    if (handle === undefined && inMemory === undefined) {
      return null;
    }
    return await this._fetchAndDecode({ path, handle, inMemory });
  }

  private async _fetchAndDecode(options: {
    path: string;
    handle: AssetHandle | undefined;
    inMemory: Uint8Array | undefined;
  }): Promise<PropertyShard> {
    if (options.handle !== undefined) {
      if (this._indexStore === null) {
        throw new IndexError(
          `PropertyIndexReader: no index store for '${options.path}'`,
          { code: 'E_INDEX_NO_STORE', context: { path: options.path } },
        );
      }
      return this._parseShard(
        await this._indexStore.decodeShard(options.handle),
        options.path,
      );
    }
    if (options.inMemory === undefined) {
      throw new IndexError(
        `PropertyIndexReader: missing shard '${options.path}'`,
        { code: 'E_INDEX_SHARD_MISSING', context: { path: options.path } },
      );
    }
    return this._parseShard(
      requireCodec(this._codec, 'PropertyIndexReader').decode(options.inMemory),
      options.path,
    );
  }

  private _parseShard(decoded: CodecValue, path: string): PropertyShard {
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
