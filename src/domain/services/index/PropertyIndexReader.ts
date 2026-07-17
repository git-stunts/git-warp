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

export type IndexedPropertyBag = { [key: string]: PropValue };
type PropertyShard = ReadonlyMap<string, IndexedPropertyBag>;
type PropertyShardSchemaVersion = 1 | 2;
export type DecodedPropertyShardArtifact = Readonly<{
  readonly schemaVersion: PropertyShardSchemaVersion;
  readonly entries: PropertyShard;
}>;
type PropertyShardDecodeContext = {
  readonly data: Map<string, IndexedPropertyBag>;
  readonly path: string;
  readonly schemaVersion: PropertyShardSchemaVersion;
};
type PropertyShardPayload = Readonly<{
  readonly schemaVersion: PropertyShardSchemaVersion;
  readonly entries: ReadonlyArray<CodecValue>;
}>;
type PropertyShardKeyResolver = (
  nodeId: string,
  schemaVersion: PropertyShardSchemaVersion,
) => string;

function isIndexedPropertyBag(value: CodecValue): value is IndexedPropertyBag {
  if (!isCodecRecord(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, entry]) => isValidPropertyKey(key) && isPropValue(entry),
  );
}

function isValidPropertyKey(value: string): boolean {
  return value.length > 0 && !value.includes('\0');
}

/** Validates one decoded property shard without retaining it beyond the caller. */
export function decodePropertyShard(
  decoded: CodecValue,
  path: string,
  shardKeyForNode: PropertyShardKeyResolver = computeShardKey,
): PropertyShard {
  return decodeRoutedPropertyShardArtifact(decoded, path, shardKeyForNode).entries;
}

/** Validates one current-profile property shard and requires schema v2. */
export function decodeCurrentPropertyShard(
  decoded: CodecValue,
  path: string,
  shardKeyForNode: PropertyShardKeyResolver,
): PropertyShard {
  const artifact = decodeRoutedPropertyShardArtifact(decoded, path, shardKeyForNode);
  if (artifact.schemaVersion !== 2) {
    throw malformedPropertyShard(path, 'retained property root requires current schema');
  }
  return artifact.entries;
}

/** Decodes one property artifact and validates its physical routing profile. */
export function decodeRoutedPropertyShardArtifact(
  decoded: CodecValue,
  path: string,
  shardKeyForNode: PropertyShardKeyResolver = computeShardKey,
): DecodedPropertyShardArtifact {
  const artifact = decodePropertyShardArtifact(decoded, path);
  validatePropertyShardRouting(artifact, path, shardKeyForNode);
  return artifact;
}

function validatePropertyShardRouting(
  artifact: DecodedPropertyShardArtifact,
  path: string,
  shardKeyForNode: PropertyShardKeyResolver,
): void {
  for (const nodeId of artifact.entries.keys()) {
    if (path !== `props_${shardKeyForNode(nodeId, artifact.schemaVersion)}.cbor`) {
      throw malformedPropertyShard(path, 'node entry belongs to another shard');
    }
  }
}

/** Decodes a property artifact without assuming a specific physical routing profile. */
export function decodePropertyShardArtifact(
  decoded: CodecValue,
  path: string,
): DecodedPropertyShardArtifact {
  const payload = decodePropertyShardPayload(decoded, path);
  const data = new Map<string, IndexedPropertyBag>();
  const context = { data, path, schemaVersion: payload.schemaVersion };
  for (const entry of payload.entries) {
    addPropertyShardEntry(context, entry);
  }
  return Object.freeze({ schemaVersion: payload.schemaVersion, entries: data });
}

function decodePropertyShardPayload(decoded: CodecValue, path: string): PropertyShardPayload {
  if (Array.isArray(decoded)) {
    return Object.freeze({ schemaVersion: 1, entries: decoded });
  }
  return decodeCurrentPropertyShardPayload(decoded, path);
}

function decodeCurrentPropertyShardPayload(
  decoded: CodecValue,
  path: string,
): PropertyShardPayload {
  if (!isCodecRecord(decoded)) {
    throw malformedPropertyShard(path, 'expected a legacy entry array or current schema envelope');
  }
  if (!hasPropertyShardEnvelopeKeys(decoded)) {
    throw malformedPropertyShard(path, 'invalid current property shard envelope');
  }
  const { entries, schemaVersion } = decoded;
  if (schemaVersion !== 2) {
    throw malformedPropertyShard(path, 'unsupported property shard schema version');
  }
  if (!Array.isArray(entries)) {
    throw malformedPropertyShard(path, 'current property shard entries must be an array');
  }
  return Object.freeze({ schemaVersion: 2, entries });
}

function hasPropertyShardEnvelopeKeys(
  decoded: { readonly [key: string]: CodecValue },
): boolean {
  const keys = Object.keys(decoded).sort();
  return keys.length === 2 && keys[0] === 'entries' && keys[1] === 'schemaVersion';
}

function isCodecRecord(
  value: CodecValue,
): value is { readonly [key: string]: CodecValue } {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (isNonRecordCodecValue(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonRecordCodecValue(value: object): boolean {
  return Array.isArray(value) || value instanceof Uint8Array || value instanceof Date;
}

function addPropertyShardEntry(
  context: PropertyShardDecodeContext,
  candidate: CodecValue,
): void {
  const [nodeId, bag] = decodePropertyShardEntry(candidate, context.path);
  if (context.data.has(nodeId)) {
    throw malformedPropertyShard(context.path, 'duplicate node entry');
  }
  context.data.set(nodeId, decodePropertyBag(bag, context.path, context.schemaVersion));
}

function decodePropertyShardEntry(
  candidate: CodecValue,
  path: string,
): readonly [string, CodecValue] {
  if (!isPropertyShardTuple(candidate) || !isValidNodeId(candidate[0])) {
    throw malformedPropertyShard(path, 'invalid node entry');
  }
  return [candidate[0], candidate[1]];
}

function isPropertyShardTuple(
  candidate: CodecValue,
): candidate is [string, CodecValue] {
  return Array.isArray(candidate)
    && candidate.length === 2
    && typeof candidate[0] === 'string';
}

function isValidNodeId(nodeId: string): boolean {
  return nodeId.length > 0 && !nodeId.includes('\0');
}

function decodePropertyBag(
  candidate: CodecValue,
  path: string,
  schemaVersion: PropertyShardSchemaVersion,
): IndexedPropertyBag {
  if (schemaVersion === 1) {
    if (!isIndexedPropertyBag(candidate)) {
      throw malformedPropertyShard(path, 'legacy property bag must be an object');
    }
    return createPropertyBag(Object.entries(candidate), path);
  }
  if (!Array.isArray(candidate)) {
    throw malformedPropertyShard(path, 'current property bag must be an entry array');
  }
  return decodePropertyBagEntries(candidate, path);
}

function decodePropertyBagEntries(
  entries: CodecValue[],
  path: string,
): IndexedPropertyBag {
  return createPropertyBag(entries, path);
}

function createPropertyBag(
  entries: ReadonlyArray<CodecValue | readonly [string, PropValue]>,
  path: string,
): IndexedPropertyBag {
  const bag: IndexedPropertyBag = {};
  Reflect.setPrototypeOf(bag, null);
  for (const candidate of entries) {
    addPropertyBagEntry(bag, candidate, path);
  }
  return Object.freeze(bag);
}

function addPropertyBagEntry(
  bag: IndexedPropertyBag,
  candidate: CodecValue,
  path: string,
): void {
  if (!isDecodedPropertyBagEntry(candidate)) {
    throw malformedPropertyShard(path, 'invalid property entry');
  }
  const [key, value] = candidate;
  if (Object.hasOwn(bag, key)) {
    throw malformedPropertyShard(path, 'duplicate property entry');
  }
  Object.defineProperty(bag, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function isDecodedPropertyBagEntry(
  candidate: CodecValue,
): candidate is [string, PropValue] {
  return Array.isArray(candidate)
    && candidate.length === 2
    && typeof candidate[0] === 'string'
    && isValidPropertyKey(candidate[0])
    && isPropValue(candidate[1]);
}

function malformedPropertyShard(path: string, reason: string): IndexError {
  return new IndexError(`PropertyIndexReader: invalid shard '${path}' (${reason})`, {
    code: 'E_INDEX_SHARD_MALFORMED',
    context: { path, reason },
  });
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

  /** Configures opaque shard handles for lazy loading. */
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
    return shard.get(nodeId) ?? null;
  }

  /**
   * Returns a single property value, or undefined.
   */
  async getProperty(nodeId: string, key: string): Promise<PropValue | undefined> {
    const props = await this.getNodeProps(nodeId);
    if (!props) {
      return undefined;
    }
    return Object.hasOwn(props, key) ? props[key] : undefined;
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
    const data = decodePropertyShard(decoded, path);
    this._cache.set(path, data);
    return data;
  }
}
