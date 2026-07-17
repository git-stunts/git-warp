import type CodecPort from '../../ports/CodecPort.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import MaterializationReadPort from '../../ports/MaterializationReadPort.ts';
import BundleHandle from '../storage/BundleHandle.ts';
import WarpError from '../errors/WarpError.ts';
import PageCache from '../orset/trie/PageCache.ts';
import TrieCursor from '../orset/trie/TrieCursor.ts';
import TrieGeometry from '../orset/trie/TrieGeometry.ts';
import type TrieStorePort from '../orset/trie/TrieStorePort.ts';
import { decodeCurrentPropertyShard } from '../services/index/PropertyIndexReader.ts';
import type { PropValue } from '../types/PropValue.ts';
import {
  materializationPropertyShardKey,
  materializationPropertyShardPath,
  MATERIALIZATION_PROPERTY_SHARD_READ_LIMITS,
} from './MaterializationPropertyProfile.ts';

const MAX_RESIDENT_READ_PAGES = 256;

/** Reads retained liveness roots without reconstructing a complete WarpState. */
export default class TrieMaterializationReader extends MaterializationReadPort {
  readonly #store: TrieStorePort;
  readonly #codec: CodecPort;
  readonly #geometry: TrieGeometry;
  readonly #indexStore: IndexStorePort | null;

  constructor(options: {
    readonly store: TrieStorePort;
    readonly codec: CodecPort;
    readonly geometry?: TrieGeometry;
    readonly indexStore?: IndexStorePort;
  }) {
    super();
    requireOptions(options);
    this.#store = requireStore(options.store);
    this.#codec = requireCodec(options.codec);
    this.#geometry = options.geometry === undefined
      ? TrieGeometry.default16way()
      : requireGeometry(options.geometry);
    this.#indexStore = options.indexStore === undefined
      ? null
      : requireIndexStore(options.indexStore);
    Object.freeze(this);
  }

  override async hasNode(nodeAliveRoot: BundleHandle, nodeId: string): Promise<boolean> {
    if (!(nodeAliveRoot instanceof BundleHandle)) {
      throw new WarpError(
        'Materialization node-liveness root must be a BundleHandle',
        'E_MATERIALIZATION_RESUME'
      );
    }
    const cursor = new TrieCursor({
      rootOid: nodeAliveRoot.toString(),
      store: this.#store,
      geometry: this.#geometry,
      codec: this.#codec,
      pageCache: new PageCache({ maxResident: MAX_RESIDENT_READ_PAGES }),
    });
    return await cursor.contains(nodeId);
  }

  override async getNodeProperties(
    propertiesRoot: BundleHandle,
    nodeId: string,
  ): Promise<Readonly<Record<string, PropValue>> | null | undefined> {
    if (!(propertiesRoot instanceof BundleHandle)) {
      throw readerError('properties root must be a BundleHandle');
    }
    if (this.#indexStore === null) {
      return undefined;
    }
    const path = materializationPropertyShardPath(nodeId);
    const handle = await this.#indexStore.readShardHandle(propertiesRoot, path);
    if (handle === null) {
      return null;
    }
    const shard = decodeCurrentPropertyShard(
      await this.#indexStore.decodeShard(handle, MATERIALIZATION_PROPERTY_SHARD_READ_LIMITS),
      path,
      materializationPropertyShardKey,
    );
    return shard.get(nodeId) ?? null;
  }
}

function requireOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw readerError('options must be an object');
  }
}

function requireStore(store: TrieStorePort): TrieStorePort {
  if (
    store === null
    || typeof store !== 'object'
    || !hasTrieOperations(store)
  ) {
    throw readerError('store must provide trie read/write operations');
  }
  return store;
}

function hasTrieOperations(store: TrieStorePort): boolean {
  return typeof store.readLeaf === 'function'
    && typeof store.readBranch === 'function'
    && typeof store.writeLeaf === 'function'
    && typeof store.writeBranch === 'function';
}

function requireCodec(codec: CodecPort): CodecPort {
  if (
    codec === null
    || typeof codec !== 'object'
    || typeof codec.encode !== 'function'
    || typeof codec.decode !== 'function'
  ) {
    throw readerError('codec must provide encode/decode operations');
  }
  return codec;
}

function requireGeometry(geometry: TrieGeometry): TrieGeometry {
  if (!(geometry instanceof TrieGeometry)) {
    throw readerError('geometry must be a TrieGeometry instance');
  }
  return geometry;
}

function requireIndexStore(indexStore: IndexStorePort): IndexStorePort {
  if (
    indexStore === null
    || typeof indexStore !== 'object'
    || typeof indexStore.readShardHandle !== 'function'
    || typeof indexStore.decodeShard !== 'function'
  ) {
    throw readerError('indexStore must provide exact shard read operations');
  }
  return indexStore;
}

function readerError(message: string): WarpError {
  return new WarpError(`Materialization reader ${message}`, 'E_MATERIALIZATION_RESUME');
}
