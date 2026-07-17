import type CodecPort from '../../ports/CodecPort.ts';
import MaterializationReadPort from '../../ports/MaterializationReadPort.ts';
import BundleHandle from '../storage/BundleHandle.ts';
import WarpError from '../errors/WarpError.ts';
import PageCache from '../orset/trie/PageCache.ts';
import TrieCursor from '../orset/trie/TrieCursor.ts';
import TrieGeometry from '../orset/trie/TrieGeometry.ts';
import type TrieStorePort from '../orset/trie/TrieStorePort.ts';

const MAX_RESIDENT_READ_PAGES = 256;

/** Reads retained liveness roots without reconstructing a complete WarpState. */
export default class TrieMaterializationReader extends MaterializationReadPort {
  readonly #store: TrieStorePort;
  readonly #codec: CodecPort;
  readonly #geometry: TrieGeometry;

  constructor(options: {
    readonly store: TrieStorePort;
    readonly codec: CodecPort;
    readonly geometry?: TrieGeometry;
  }) {
    super();
    requireOptions(options);
    this.#store = requireStore(options.store);
    this.#codec = requireCodec(options.codec);
    this.#geometry = options.geometry === undefined
      ? TrieGeometry.default16way()
      : requireGeometry(options.geometry);
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

function readerError(message: string): WarpError {
  return new WarpError(`Materialization reader ${message}`, 'E_MATERIALIZATION_RESUME');
}
