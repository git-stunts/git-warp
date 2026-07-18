import { describe, expect, it } from 'vitest';
import type { CacheStoreResult } from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../../../src/domain/materialization/MaterializationHandle.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasMaterializationStoreAdapter, {
  type GitCasMaterializationFacade,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const ROOT_PATHS = Object.freeze([
  'roots/adjacency',
  'roots/edge-alive',
  'roots/edge-births',
  'roots/frontier',
  'roots/node-alive',
  'roots/properties',
  'roots/provenance-support',
  'roots/roaring-indexes',
]);

describe('GitCasMaterializationStoreAdapter', () => {
  it('retains deterministic roots and reuses the exact-coordinate lease', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);

    const retained = await harness.adapter.retain({
      coordinate,
      roots,
      stateHash: 'state-hash',
    });
    const acquisition = await harness.adapter.acquireExact(new MaterializationCoordinate({
      frontier: new Map([
        ['writer-b', 'patch-b'],
        ['writer-a', 'patch-a'],
      ]),
      ceiling: 12,
    }));
    const resolved = acquisition?.materialization ?? null;

    expect(retained.laneName).toBe('events');
    expect(retained.retention).toMatchObject({
      policy: 'evictable',
      reachability: 'anchored',
      root: {
        kind: 'cache-set',
        namespace: CACHE_NAMESPACE,
      },
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.bundle.equals(retained.bundle)).toBe(true);
    expect(resolved?.coordinate.equals(coordinate)).toBe(true);
    expect(resolved?.stateHash).toBe('state-hash');
    expect(resolved?.roots.entries().map(([name, root]) => rootSignature(name, root)))
      .toEqual(roots.entries().map(([name, root]) => rootSignature(name, root)));
    expect(resolved?.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
    });

    const members = harness.cas.readBundleMembers(retained.bundle.toString());
    expect(members.map(([path]) => path)).toEqual(['meta/descriptor', ...ROOT_PATHS]);
    const cacheKeys = harness.cas.readCacheKeys(CACHE_NAMESPACE);
    expect(cacheKeys).toHaveLength(1);
    expect(cacheKeys[0]).toMatch(/^v3:[0-9a-f]{64}$/u);
    expect(cacheKeys[0]?.length).toBeLessThan(1024);
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(1);
    await acquisition?.release();
    await acquisition?.release();
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(1);
    const repeated = await harness.adapter.acquireExact(coordinate);
    expect(repeated?.materialization.bundle.equals(retained.bundle)).toBe(true);
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(1);
    await repeated?.release();
    await harness.adapter.close();
    await harness.adapter.close();
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(0);
  });

  it('retires a replaced coordinate after its in-flight reader releases', async () => {
    const harness = await createHarness();
    const firstCoordinate = exactCoordinate();
    const secondCoordinate = new MaterializationCoordinate({
      frontier: new Map([
        ['writer-a', 'patch-next'],
        ['writer-b', 'patch-b'],
      ]),
      ceiling: 13,
    });
    const roots = await createRoots(harness.cas);
    await harness.adapter.retain({ coordinate: firstCoordinate, roots, stateHash: 'first' });
    await harness.adapter.retain({ coordinate: secondCoordinate, roots, stateHash: 'second' });

    const first = await harness.adapter.acquireExact(firstCoordinate);
    const second = await harness.adapter.acquireExact(secondCoordinate);
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(2);

    await first?.release();
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(1);
    await second?.release();
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(1);
    await harness.adapter.close();
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(0);
  });

  it('returns null for a coordinate with no retained materialization', async () => {
    const harness = await createHarness();
    expect(await harness.adapter.acquireExact(exactCoordinate())).toBeNull();
  });

  it('promotes terminal roots and releases the git-cas workspace', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);
    const workspace = await harness.adapter.openWorkspace(coordinate);

    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);

    const promoted = await workspace.promote({
      coordinate,
      roots,
      stateHash: 'promoted-state-hash',
    });
    await workspace.release();

    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);
    expect(harness.cas.readCacheKeys(CACHE_NAMESPACE)).toHaveLength(1);
    expect((await acquireReleaseAndClose(harness.adapter, coordinate))?.bundle.equals(promoted.bundle))
      .toBe(true);
  });

  it('removes an in-progress coordinate after mismatched promotion fails', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const workspace = await harness.adapter.openWorkspace(exactCoordinate());
    await workspace.checkpoint({
      nodeAliveRoot: roots.nodeAlive.handle?.toString() ?? null,
      edgeAliveRoot: null,
    });
    expect(harness.cas.readActiveWorkspaceCount()).toBe(1);

    await expect(workspace.promote({
      coordinate: new MaterializationCoordinate({
        frontier: new Map([['writer-c', 'patch-c']]),
        ceiling: 13,
      }),
      roots,
      stateHash: 'wrong-coordinate',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('does not match'),
    });
    await workspace.release();

    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);
    expect(harness.cas.readCacheKeys(CACHE_NAMESPACE)).toEqual([]);
  });

  it('round-trips partial roots without inventing bundles for empty or unavailable state', async () => {
    const harness = await createHarness();
    const page = await harness.cas.pages.put({ source: new Uint8Array([1]) });
    const nodeBundle = await harness.cas.bundles.putOrdered({
      members: [['root', page.handle]],
    });
    const roots = partialRoots(new BundleHandle(nodeBundle.handle.toString()));

    const retained = await harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots,
      stateHash: 'partial-state-hash',
    });
    const resolved = await acquireReleaseAndClose(harness.adapter, exactCoordinate());

    expect(harness.cas.readBundleMembers(retained.bundle.toString()).map(([path]) => path))
      .toEqual(['meta/descriptor', 'roots/node-alive']);
    expect(resolved?.roots.nodeAlive.status).toBe('retained');
    expect(resolved?.roots.nodeAlive.handle?.toString()).toBe(nodeBundle.handle.toString());
    expect(resolved?.roots.edgeAlive.status).toBe('empty');
    expect(resolved?.roots.properties.status).toBe('empty');
  });

  it('round-trips an unbounded live coordinate with a null ceiling', async () => {
    const harness = await createHarness();
    const coordinate = new MaterializationCoordinate({ frontier: new Map(), ceiling: null });
    await harness.adapter.retain({
      coordinate,
      roots: await createRoots(harness.cas),
      stateHash: 'empty-state-hash',
    });
    expect((await acquireReleaseAndClose(harness.adapter, coordinate))?.coordinate.ceiling).toBeNull();
  });

  it('fails closed when git-cas declines materialization retention', async () => {
    const harness = await createHarness();
    const facade = withCacheResult(harness.cas, (stored) => Object.freeze({
      ...stored,
      accepted: false,
      hit: null,
      witness: null,
    }));
    const adapter = adapterFor(facade);

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('did not retain'),
    });
  });

  it('fails closed when git-cas reports an unexpected retained target', async () => {
    const harness = await createHarness();
    const page = await harness.cas.pages.put({ source: new Uint8Array([1]) });
    const baseCache = await harness.cas.caches.open({ namespace: CACHE_NAMESPACE });
    const unexpected = await baseCache.put('unexpected', page.handle);
    if (unexpected.hit === null) {
      throw new Error('Expected the test cache to retain its unexpected target');
    }
    const unexpectedHit = unexpected.hit;
    const facade = withCacheResult(harness.cas, (stored) => Object.freeze({
      ...stored,
      hit: unexpectedHit,
    }));
    const adapter = adapterFor(facade);

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('unexpected materialization handle'),
    });
  });

  it('rejects a cache entry whose target is not a bundle', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    await harness.adapter.retain({
      coordinate,
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });
    const cacheKey = requireSingleCacheKey(harness.cas);
    const page = await harness.cas.pages.put({ source: new Uint8Array([1]) });
    const cache = await harness.cas.caches.open({ namespace: CACHE_NAMESPACE });
    await cache.put(cacheKey, page.handle);

    await expect(harness.adapter.acquireExact(coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('does not reference a materialization bundle'),
    });
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(0);
  });

  it.each([
    ['missing descriptor', (members: readonly [string, string][]) =>
      members.filter(([path]) => path !== 'meta/descriptor')],
    ['bundle descriptor', (members: readonly [string, string][]) => {
      const root = requireMember(members, 'roots/adjacency');
      return replaceMember(members, 'meta/descriptor', root);
    }],
    ['missing root', (members: readonly [string, string][]) =>
      members.filter(([path]) => path !== 'roots/properties')],
    ['unexpected member path', (members: readonly [string, string][]) =>
      renameMember(members, 'roots/properties', 'unexpected')],
    ['unknown root', (members: readonly [string, string][]) =>
      renameMember(members, 'roots/properties', 'roots/unknown')],
    ['duplicate descriptor', (members: readonly [string, string][]) =>
      renameMember(members, 'roots/properties', 'meta/descriptor')],
    ['duplicate root', (members: readonly [string, string][]) =>
      renameMember(members, 'roots/properties', 'roots/adjacency')],
    ['too many members', (members: readonly [string, string][]) => [
      ...members,
      memberEntry('roots/unknown', requireMember(members, 'roots/adjacency')),
    ]],
  ])('rejects a materialization bundle with a %s', async (_case, mutate) => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const retained = await harness.adapter.retain({
      coordinate,
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });
    const members = harness.cas.readBundleMembers(retained.bundle.toString());
    harness.cas.replaceBundleMembers(retained.bundle.toString(), mutate(members));

    await expect(harness.adapter.acquireExact(coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
    });
  });

  it('rejects a materialization root member that is not a bundle', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const retained = await harness.adapter.retain({
      coordinate,
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });
    const page = await harness.cas.pages.put({ source: new Uint8Array([1]) });
    const members = harness.cas.readBundleMembers(retained.bundle.toString());
    harness.cas.replaceBundleMembers(
      retained.bundle.toString(),
      replaceMember(members, 'roots/edge-alive', page.handle.toString()),
    );

    await expect(harness.adapter.acquireExact(coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('edge-alive root bundle'),
    });
  });

  it.each([
    ['non-object descriptor', null, 'descriptor must be an object'],
    ['schema', { schemaVersion: 2 }, 'schema is unsupported'],
    [
      'coordinate object',
      descriptor({ coordinate: null }),
      'descriptor.coordinate must be an object',
    ],
    [
      'frontier collection',
      descriptor({ coordinate: { ceiling: 12, frontier: {} } }),
      'frontier must be an array',
    ],
    [
      'frontier tuple',
      descriptor({ coordinate: { ceiling: 12, frontier: [['writer-a']] } }),
      'invalid frontier entry',
    ],
    [
      'frontier writer',
      descriptor({ coordinate: { ceiling: 12, frontier: [['', 'patch-a']] } }),
      'writerId must be a non-empty string',
    ],
    [
      'frontier patch',
      descriptor({ coordinate: { ceiling: 12, frontier: [['writer-a', '']] } }),
      'patchSha must be a non-empty string',
    ],
    [
      'duplicate writer',
      descriptor({
        coordinate: {
          ceiling: 12,
          frontier: [['writer-a', 'patch-a'], ['writer-a', 'patch-b']],
        },
      }),
      'duplicate frontier writer',
    ],
    [
      'ceiling',
      descriptor({ coordinate: { ceiling: -1, frontier: [] } }),
      'coordinate ceiling is invalid',
    ],
    ['root status collection', descriptor({ roots: {} }), 'roots must be an array'],
    [
      'root status tuple',
      descriptor({ roots: [['adjacency']] }),
      'invalid root status entry',
    ],
    [
      'root status name',
      descriptor({ roots: replaceRootStatusName(rootStatusFixture(), 'adjacency', 'unknown') }),
      'unknown root status name',
    ],
    [
      'root status value',
      descriptor({ roots: replaceRootStatus(rootStatusFixture(), 'adjacency', 'missing') }),
      'invalid adjacency root status',
    ],
    [
      'duplicate root status',
      descriptor({ roots: [...rootStatusFixture(), ['adjacency', 'retained']] }),
      'duplicate adjacency root status',
    ],
    [
      'missing root status',
      descriptor({ roots: rootStatusFixture().filter(([name]) => name !== 'adjacency') }),
      'no adjacency root status',
    ],
    [
      'unavailable current property root',
      descriptor({ roots: replaceRootStatus(rootStatusFixture(), 'properties', 'unavailable') }),
      'requires a property root',
    ],
    ['lane', descriptor({ laneName: '' }), 'laneName must be a non-empty string'],
    ['state hash', descriptor({ stateHash: '' }), 'stateHash must be a non-empty string'],
  ])('rejects an invalid %s', async (_case, value, message) => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, value);
    await expect(harness.adapter.acquireExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining(message),
    });
  });

  it('rejects a descriptor for another lane', async () => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, descriptor({ laneName: 'other' }));
    await expect(harness.adapter.acquireExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('belongs to another lane'),
    });
  });

  it('rejects a descriptor coordinate that does not match the cache key', async () => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, descriptor({
      coordinate: { ceiling: 99, frontier: [] },
    }));
    await expect(harness.adapter.acquireExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('does not match its cache key'),
    });
  });

  it('rejects a bundle member whose descriptor marks that root empty', async () => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, descriptor({
      roots: replaceRootStatus(rootStatusFixture(), 'edge-alive', 'empty'),
    }));
    await expect(harness.adapter.acquireExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('unexpected edge-alive root bundle'),
    });
  });

  it('enforces the descriptor page read bound', async () => {
    const harness = await retainedHarness();
    const descriptorHandle = requireMember(
      harness.cas.readBundleMembers(harness.retainedBundle.toString()),
      'meta/descriptor',
    );
    harness.cas.replaceStoredPage(descriptorHandle, new Uint8Array(1024 * 1024 + 1));
    await expect(harness.adapter.acquireExact(harness.coordinate)).rejects.toMatchObject({
      code: 'PAGE_TOO_LARGE',
    });
  });

  it('validates adapter dependencies and retain request identities', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);

    expect(() => Reflect.construct(GitCasMaterializationStoreAdapter, [null]))
      .toThrowError(/adapter options/u);
    for (const field of ['cas', 'codec', 'crypto']) {
      const options = adapterOptions(harness.cas);
      Reflect.set(options, field, null);
      expect(() => Reflect.construct(GitCasMaterializationStoreAdapter, [options]))
        .toThrowError(new RegExp(`${field} dependency`, 'u'));
    }
    expect(() => new GitCasMaterializationStoreAdapter({
      ...adapterOptions(harness.cas),
      laneName: '',
    })).toThrowError(/laneName/u);

    await expect(Reflect.apply(harness.adapter.retain, harness.adapter, [null]))
      .rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
    await expect(Reflect.apply(harness.adapter.retain, harness.adapter, [{
      coordinate: { frontier: new Map(), ceiling: null },
      roots,
      stateHash: 'state-hash',
    }])).rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
    await expect(Reflect.apply(harness.adapter.retain, harness.adapter, [{
      coordinate: exactCoordinate(),
      roots: roots.entries(),
      stateHash: 'state-hash',
    }])).rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
    await expect(harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots,
      stateHash: '',
    })).rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
    const nodeAlive = roots.nodeAlive.handle;
    if (nodeAlive === null) {
      throw new Error('Expected retained node-alive test root');
    }
    await expect(harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots: unavailablePropertyRoots(nodeAlive),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('requires a property root'),
    });
    await expect(Reflect.apply(harness.adapter.acquireExact, harness.adapter, [{
      frontier: new Map(),
      ceiling: null,
    }])).rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
  });

  it('rejects descriptors that exceed the write bound', async () => {
    const harness = await createHarness('x'.repeat(1024 * 1024 + 1));
    await expect(harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('exceeds its byte limit'),
    });
  });
});

type Harness = Readonly<{
  adapter: GitCasMaterializationStoreAdapter;
  cas: InMemoryGitCasFacade;
}>;

type RetainedHarness = Harness & Readonly<{
  coordinate: MaterializationCoordinate;
  retainedBundle: BundleHandle;
}>;

async function acquireReleaseAndClose(
  adapter: GitCasMaterializationStoreAdapter,
  coordinate: MaterializationCoordinate,
): Promise<MaterializationHandle | null> {
  const acquisition = await adapter.acquireExact(coordinate);
  if (acquisition === null) {
    await adapter.close();
    return null;
  }
  try {
    return acquisition.materialization;
  } finally {
    await acquisition.release();
    await adapter.close();
  }
}

async function createHarness(laneName = 'events'): Promise<Harness> {
  const history = new InMemoryGraphAdapter();
  const cas = new InMemoryGitCasFacade({
    history,
    storage: new InMemoryBlobStorageAdapter(),
  });
  return Object.freeze({
    cas,
    adapter: new GitCasMaterializationStoreAdapter({
      ...adapterOptions(cas),
      laneName,
    }),
  });
}

function adapterOptions(cas: InMemoryGitCasFacade): {
  cas: InMemoryGitCasFacade;
  codec: typeof defaultCodec;
  crypto: NodeCryptoAdapter;
  laneName: string;
} {
  return {
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'events',
  };
}

function adapterFor(cas: GitCasMaterializationFacade): GitCasMaterializationStoreAdapter {
  return new GitCasMaterializationStoreAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'events',
  });
}

function withCacheResult(
  cas: InMemoryGitCasFacade,
  rewrite: (stored: CacheStoreResult) => CacheStoreResult,
): GitCasMaterializationFacade {
  return {
    bundles: cas.bundles,
    pages: cas.pages,
    caches: {
      open: async (options) => {
        const cache = await cas.caches.open(options);
        return {
          ref: cache.ref,
          acquire: async (key) => await cache.acquire(key),
          put: async (key, handle, entryOptions) => rewrite(
            await cache.put(key, handle, entryOptions),
          ),
          remove: async (key) => await cache.remove(key),
        };
      },
    },
    workspaces: cas.workspaces,
  };
}

async function retainedHarness(): Promise<RetainedHarness> {
  const harness = await createHarness();
  const coordinate = exactCoordinate();
  const retained = await harness.adapter.retain({
    coordinate,
    roots: await createRoots(harness.cas),
    stateHash: 'state-hash',
  });
  return Object.freeze({
    ...harness,
    coordinate,
    retainedBundle: retained.bundle,
  });
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<MaterializationRoots> {
  const handles: BundleHandle[] = [];
  for (let index = 0; index < ROOT_PATHS.length; index += 1) {
    const page = await cas.pages.put({ source: new Uint8Array([index]) });
    const bundle = await cas.bundles.putOrdered({
      members: [['root', page.handle]],
    });
    handles.push(new BundleHandle(bundle.handle.toString()));
  }
  const [
    adjacency,
    edgeAlive,
    edgeBirths,
    frontier,
    nodeAlive,
    properties,
    provenanceSupport,
    roaringIndexes,
  ] = handles;
  if (
    adjacency === undefined || edgeAlive === undefined || edgeBirths === undefined ||
    frontier === undefined || nodeAlive === undefined || properties === undefined ||
    provenanceSupport === undefined || roaringIndexes === undefined
  ) {
    throw new Error('Root fixture did not create every materialization root');
  }
  return new MaterializationRoots({
    adjacency: MaterializationRoot.retained(adjacency),
    edgeAlive: MaterializationRoot.retained(edgeAlive),
    edgeBirths: MaterializationRoot.retained(edgeBirths),
    frontier: MaterializationRoot.retained(frontier),
    nodeAlive: MaterializationRoot.retained(nodeAlive),
    properties: MaterializationRoot.retained(properties),
    provenanceSupport: MaterializationRoot.retained(provenanceSupport),
    roaringIndexes: MaterializationRoot.retained(roaringIndexes),
  });
}

function rootSignature(
  name: string,
  root: MaterializationRoot,
): readonly [string, string, string | null] {
  return [name, root.status, root.handle?.toString() ?? null];
}

function partialRoots(nodeAlive: BundleHandle): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: MaterializationRoot.empty(),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: MaterializationRoot.retained(nodeAlive),
    properties: MaterializationRoot.empty(),
    provenanceSupport: MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}

function unavailablePropertyRoots(nodeAlive: BundleHandle): MaterializationRoots {
  const roots = partialRoots(nodeAlive);
  return new MaterializationRoots({
    adjacency: roots.adjacency,
    edgeAlive: roots.edgeAlive,
    edgeBirths: roots.edgeBirths,
    frontier: roots.frontier,
    nodeAlive: roots.nodeAlive,
    properties: MaterializationRoot.unavailable(),
    provenanceSupport: roots.provenanceSupport,
    roaringIndexes: roots.roaringIndexes,
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

function descriptor(overrides: Record<string, object | string | number | null> = {}): object {
  return {
    schemaVersion: 3,
    laneName: 'events',
    stateHash: 'state-hash',
    roots: rootStatusFixture(),
    coordinate: {
      ceiling: 12,
      frontier: [['writer-a', 'patch-a'], ['writer-b', 'patch-b']],
    },
    ...overrides,
  };
}

function rootStatusFixture(): string[][] {
  return ROOT_PATHS.map((path) => [path.slice('roots/'.length), 'retained']);
}

function replaceRootStatus(
  roots: readonly string[][],
  target: string,
  status: string,
): string[][] {
  return roots.map(([name, current]) => [name ?? '', name === target ? status : current ?? '']);
}

function replaceRootStatusName(
  roots: readonly string[][],
  target: string,
  replacement: string,
): string[][] {
  return roots.map(([name, status]) => [name === target ? replacement : name ?? '', status ?? '']);
}

function replaceDescriptor(harness: RetainedHarness, value: object | null): void {
  const descriptorHandle = requireMember(
    harness.cas.readBundleMembers(harness.retainedBundle.toString()),
    'meta/descriptor',
  );
  harness.cas.replaceStoredPage(descriptorHandle, defaultCodec.encode(value));
}

function requireSingleCacheKey(cas: InMemoryGitCasFacade): string {
  const keys = cas.readCacheKeys(CACHE_NAMESPACE);
  const key = keys[0];
  if (keys.length !== 1 || key === undefined) {
    throw new Error('Expected exactly one materialization cache key');
  }
  return key;
}

function requireMember(members: readonly [string, string][], path: string): string {
  const member = members.find(([candidate]) => candidate === path);
  if (member === undefined) {
    throw new Error(`Expected materialization member ${path}`);
  }
  return member[1];
}

function replaceMember(
  members: readonly [string, string][],
  path: string,
  handle: string,
): readonly [string, string][] {
  return members.map(([candidate, existing]) => [
    candidate,
    candidate === path ? handle : existing,
  ]);
}

function renameMember(
  members: readonly [string, string][],
  path: string,
  replacement: string,
): readonly [string, string][] {
  return members.map(([candidate, handle]) => memberEntry(
    candidate === path ? replacement : candidate,
    handle,
  ));
}

function memberEntry(path: string, handle: string): [string, string] {
  return [path, handle];
}
