import type CodecPort from '../../ports/CodecPort.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import MaterializationReadPort, {
  type MaterializationEdgeTarget,
} from '../../ports/MaterializationReadPort.ts';
import BundleHandle from '../storage/BundleHandle.ts';
import WarpError from '../errors/WarpError.ts';
import TrieCursor from '../orset/trie/TrieCursor.ts';
import TrieGeometry from '../orset/trie/TrieGeometry.ts';
import type TrieStorePort from '../orset/trie/TrieStorePort.ts';
import { decodeCurrentPropertyShard } from '../services/index/PropertyIndexReader.ts';
import type { PropValue } from '../types/PropValue.ts';
import {
  materializationPropertyShardKey,
  materializationPropertyShardPath,
  MATERIALIZATION_PROPERTY_SHARD_LIMITS,
} from './MaterializationPropertyProfile.ts';
import { encodeEdgeKey } from '../services/KeyCodec.ts';

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
    const cursor = this.#openLivenessRoot(nodeAliveRoot, 'node');
    return await cursor.contains(nodeId);
  }

  override async hasEdge(
    edgeAliveRoot: BundleHandle,
    edge: MaterializationEdgeTarget,
  ): Promise<boolean> {
    const cursor = this.#openLivenessRoot(edgeAliveRoot, 'edge');
    return await cursor.contains(encodeEdgeKey(edge.from, edge.to, edge.label));
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
    const encoded = await this.#indexStore.decodeShardAt(
      propertiesRoot,
      path,
      MATERIALIZATION_PROPERTY_SHARD_LIMITS,
    );
    if (encoded === null) {
      return null;
    }
    const shard = decodeCurrentPropertyShard(
      encoded,
      path,
      materializationPropertyShardKey,
    );
    return shard.get(nodeId) ?? null;
  }

  #openLivenessRoot(
    root: BundleHandle,
    kind: 'node' | 'edge',
  ): TrieCursor {
    if (!(root instanceof BundleHandle)) {
      throw new WarpError(
        `Materialization ${kind}-liveness root must be a BundleHandle`,
        'E_MATERIALIZATION_RESUME',
      );
    }
    return new TrieCursor({
      rootOid: root.toString(),
      store: this.#store,
      geometry: this.#geometry,
      codec: this.#codec,
    });
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
    || typeof indexStore.decodeShardAt !== 'function'
  ) {
    throw readerError('indexStore must provide exact shard read operations');
  }
  return indexStore;
}

function readerError(message: string): WarpError {
  return new WarpError(`Materialization reader ${message}`, 'E_MATERIALIZATION_RESUME');
}
