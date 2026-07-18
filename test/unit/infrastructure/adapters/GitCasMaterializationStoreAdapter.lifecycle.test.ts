import { describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasMaterializationStoreAdapter, {
  type GitCasMaterializationFacade,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import { materializationCoordinateData } from '../../../../src/infrastructure/adapters/GitCasMaterializationDescriptor.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const ROOT_COUNT = 8;

describe('GitCasMaterializationStoreAdapter legacy lifecycle', () => {
  it('keeps the matching v2 cache anchor until the v3 profile is retained', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);
    const retained = await harness.adapter.retain({ coordinate, roots, stateHash: 'state-hash' });
    const cache = await harness.cas.caches.open({ namespace: CACHE_NAMESPACE });
    const v3Key = requireSingleCacheKey(harness.cas);
    const v2Key = await cacheKeyForSchema(coordinate, 2);
    await cache.put(v2Key, retained.bundle.toString());
    await cache.remove(v3Key);

    await expect(harness.adapter.acquireExact(coordinate)).resolves.toBeNull();
    expect(harness.cas.readCacheKeys(CACHE_NAMESPACE)).toEqual([v2Key]);

    await harness.adapter.retain({ coordinate, roots, stateHash: 'replacement-state-hash' });
    expect(requireSingleCacheKey(harness.cas)).toMatch(/^v3:[0-9a-f]{64}$/u);
  });

  it('removes the matching v2 cache anchor after direct v3 retention', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);
    const retained = await harness.adapter.retain({ coordinate, roots, stateHash: 'state-hash' });
    const cache = await harness.cas.caches.open({ namespace: CACHE_NAMESPACE });
    const v3Key = requireSingleCacheKey(harness.cas);
    const v2Key = await cacheKeyForSchema(coordinate, 2);
    await cache.put(v2Key, retained.bundle.toString());
    await cache.remove(v3Key);

    const replacement = await harness.adapter.retain({
      coordinate,
      roots,
      stateHash: 'replacement-state-hash',
    });
    const acquisition = await harness.adapter.acquireExact(coordinate);

    expect(harness.cas.readCacheKeys(CACHE_NAMESPACE)).toEqual([
      expect.stringMatching(/^v3:[0-9a-f]{64}$/u),
    ]);
    expect(replacement.retention.root.generation)
      .toBe(acquisition?.materialization.retention.root.generation);
    await acquisition?.release();
  });

  it('keeps the v2 anchor when the exact v3 target cannot be acquired', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);
    const original = await harness.adapter.retain({ coordinate, roots, stateHash: 'state-hash' });
    const cache = await harness.cas.caches.open({ namespace: CACHE_NAMESPACE });
    const v3Key = requireSingleCacheKey(harness.cas);
    const v2Key = await cacheKeyForSchema(coordinate, 2);
    await cache.put(v2Key, original.bundle.toString());
    await cache.remove(v3Key);

    await expect(adapterFor(withoutCacheAcquisition(harness.cas)).retain({
      coordinate,
      roots,
      stateHash: 'replacement-state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('before legacy cleanup'),
    });

    expect(harness.cas.readCacheKeys(CACHE_NAMESPACE)).toContain(v2Key);
  });
});

async function createHarness(): Promise<Readonly<{
  adapter: GitCasMaterializationStoreAdapter;
  cas: InMemoryGitCasFacade;
}>> {
  const cas = new InMemoryGitCasFacade({
    history: new InMemoryGraphAdapter(),
    storage: new InMemoryBlobStorageAdapter(),
  });
  return Object.freeze({ cas, adapter: adapterFor(cas) });
}

function adapterFor(cas: GitCasMaterializationFacade): GitCasMaterializationStoreAdapter {
  return new GitCasMaterializationStoreAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'events',
  });
}

function withoutCacheAcquisition(cas: InMemoryGitCasFacade): GitCasMaterializationFacade {
  return {
    bundles: cas.bundles,
    pages: cas.pages,
    caches: {
      open: async (options) => {
        const cache = await cas.caches.open(options);
        return {
          ref: cache.ref,
          acquire: async () => null,
          put: async (key, handle, entryOptions) => await cache.put(key, handle, entryOptions),
          remove: async (key) => await cache.remove(key),
        };
      },
    },
    workspaces: cas.workspaces,
  };
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<MaterializationRoots> {
  const handles: BundleHandle[] = [];
  for (let index = 0; index < ROOT_COUNT; index += 1) {
    const page = await cas.pages.put({ source: new Uint8Array([index]) });
    const bundle = await cas.bundles.putOrdered({ members: [['root', page.handle]] });
    handles.push(new BundleHandle(bundle.handle.toString()));
  }
  return rootsFromHandles(handles);
}

function rootsFromHandles(handles: readonly BundleHandle[]): MaterializationRoots {
  const root = (index: number): MaterializationRoot => {
    const handle = handles[index];
    if (handle === undefined) {
      throw new Error('Root fixture did not create every materialization root');
    }
    return MaterializationRoot.retained(handle);
  };
  return new MaterializationRoots({
    adjacency: root(0),
    edgeAlive: root(1),
    edgeBirths: root(2),
    frontier: root(3),
    nodeAlive: root(4),
    properties: root(5),
    provenanceSupport: root(6),
    roaringIndexes: root(7),
  });
}

function exactCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([
      ['writer-a', 'patch-a'],
      ['writer-b', 'patch-b'],
    ]),
    ceiling: 12,
  });
}

async function cacheKeyForSchema(
  coordinate: MaterializationCoordinate,
  schemaVersion: number,
): Promise<string> {
  const encoded = defaultCodec.encode({
    schemaVersion,
    laneName: 'events',
    coordinate: materializationCoordinateData(coordinate),
  });
  return `v${String(schemaVersion)}:${await new NodeCryptoAdapter().hash('sha256', encoded)}`;
}

function requireSingleCacheKey(cas: InMemoryGitCasFacade): string {
  const keys = cas.readCacheKeys(CACHE_NAMESPACE);
  const key = keys[0];
  if (keys.length !== 1 || key === undefined) {
    throw new Error('Expected exactly one materialization cache key');
  }
  return key;
}
