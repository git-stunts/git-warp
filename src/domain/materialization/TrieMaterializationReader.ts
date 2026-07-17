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
    this.#store = options.store;
    this.#codec = options.codec;
    this.#geometry = options.geometry ?? TrieGeometry.default16way();
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
