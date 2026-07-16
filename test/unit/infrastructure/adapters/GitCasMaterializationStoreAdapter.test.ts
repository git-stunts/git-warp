import { describe, expect, it } from 'vitest';
import type { CacheStoreResult } from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
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
  it('retains deterministic independent roots and resolves the exact coordinate', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);

    const retained = await harness.adapter.retain({
      coordinate,
      roots,
      stateHash: 'state-hash',
    });
    const resolved = await harness.adapter.findExact(new MaterializationCoordinate({
      frontier: new Map([
        ['writer-b', 'patch-b'],
        ['writer-a', 'patch-a'],
      ]),
      ceiling: 12,
    }));

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
    expect(resolved?.roots.entries().map(([name, handle]) => [name, handle.toString()]))
      .toEqual(roots.entries().map(([name, handle]) => [name, handle.toString()]));

    const members = harness.cas.readBundleMembers(retained.bundle.toString());
    expect(members.map(([path]) => path)).toEqual(['meta/descriptor', ...ROOT_PATHS]);
    const cacheKeys = harness.cas.readCacheKeys(CACHE_NAMESPACE);
    expect(cacheKeys).toHaveLength(1);
    expect(cacheKeys[0]).toMatch(/^v1:[0-9a-f]{64}$/u);
    expect(cacheKeys[0]?.length).toBeLessThan(1024);
  });

  it('returns null for a coordinate with no retained materialization', async () => {
    const harness = await createHarness();
    expect(await harness.adapter.findExact(exactCoordinate())).toBeNull();
  });

  it('round-trips an unbounded live coordinate with a null ceiling', async () => {
    const harness = await createHarness();
    const coordinate = new MaterializationCoordinate({ frontier: new Map(), ceiling: null });
    await harness.adapter.retain({
      coordinate,
      roots: await createRoots(harness.cas),
      stateHash: 'empty-state-hash',
    });
    expect((await harness.adapter.findExact(coordinate))?.coordinate.ceiling).toBeNull();
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

    await expect(harness.adapter.findExact(coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('does not reference a materialization bundle'),
    });
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

    await expect(harness.adapter.findExact(coordinate)).rejects.toMatchObject({
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

    await expect(harness.adapter.findExact(coordinate)).rejects.toMatchObject({
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
    ['lane', descriptor({ laneName: '' }), 'laneName must be a non-empty string'],
    ['state hash', descriptor({ stateHash: '' }), 'stateHash must be a non-empty string'],
  ])('rejects an invalid %s', async (_case, value, message) => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, value);
    await expect(harness.adapter.findExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining(message),
    });
  });

  it('rejects a descriptor for another lane', async () => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, descriptor({ laneName: 'other' }));
    await expect(harness.adapter.findExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('belongs to another lane'),
    });
  });

  it('rejects a descriptor coordinate that does not match the cache key', async () => {
    const harness = await retainedHarness();
    replaceDescriptor(harness, descriptor({
      coordinate: { ceiling: 99, frontier: [] },
    }));
    await expect(harness.adapter.findExact(harness.coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('does not match its cache key'),
    });
  });

  it('enforces the descriptor page read bound', async () => {
    const harness = await retainedHarness();
    const descriptorHandle = requireMember(
      harness.cas.readBundleMembers(harness.retainedBundle.toString()),
      'meta/descriptor',
    );
    harness.cas.replaceStoredPage(descriptorHandle, new Uint8Array(1024 * 1024 + 1));
    await expect(harness.adapter.findExact(harness.coordinate)).rejects.toMatchObject({
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
    await expect(Reflect.apply(harness.adapter.findExact, harness.adapter, [{
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
          get: async (key) => await cache.get(key),
          put: async (key, handle, entryOptions) => rewrite(
            await cache.put(key, handle, entryOptions),
          ),
        };
      },
    },
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
    adjacency,
    edgeAlive,
    edgeBirths,
    frontier,
    nodeAlive,
    properties,
    provenanceSupport,
    roaringIndexes,
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
    schemaVersion: 1,
    laneName: 'events',
    stateHash: 'state-hash',
    coordinate: {
      ceiling: 12,
      frontier: [['writer-a', 'patch-a'], ['writer-b', 'patch-b']],
    },
    ...overrides,
  };
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
