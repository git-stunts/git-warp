import { PageHandle } from '@git-stunts/git-cas';
import { describe, expect, it } from 'vitest';
import MaterializationCoordinate
  from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot
  from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots
  from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasMaterializationCacheDiagnosticsAdapter, {
  type GitCasMaterializationCacheDiagnosticsFacade,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationCacheDiagnosticsAdapter.ts';
import GitCasMaterializationStoreAdapter
  from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import NodeCryptoAdapter
  from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter
  from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const DESCRIPTOR_PATH = 'meta/descriptor';
const ROOT_NAMES = Object.freeze([
  'adjacency',
  'edge-alive',
  'edge-births',
  'frontier',
  'node-alive',
  'properties',
  'provenance-support',
  'replay-basis',
  'roaring-indexes',
] as const);

describe('GitCasMaterializationCacheDiagnosticsAdapter', () => {
  it('composes git-cas evidence with WARP lane and coordinate meaning', async () => {
    const harness = await createHarness();
    const retained = await harness.store.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });

    const report = await harness.diagnostics.inspectCache();

    expect(report).toMatchObject({
      namespace: CACHE_NAMESPACE,
      ref: `refs/cas/caches/${CACHE_NAMESPACE}`,
      healthy: true,
      issues: [],
      entries: [{
        handle: retained.bundle.toString(),
        status: 'live',
        retention: 'evictable',
        collectible: true,
        stateHash: 'state-hash',
        coordinate: {
          ceiling: 12,
          frontier: [
            { writerId: 'writer-a', patchSha: 'patch-a' },
            { writerId: 'writer-b', patchSha: 'patch-b' },
          ],
        },
      }],
    });
    await harness.store.close();
  });

  it('removes unrecoverable lane entries without recreating bytes or other lanes', async () => {
    const history = new InMemoryGraphAdapter();
    const cas = new InMemoryGitCasFacade({
      history,
      storage: new InMemoryBlobStorageAdapter(),
    });
    const events = createLane(cas, 'events');
    const archive = createLane(cas, 'archive');
    const eventsRetained = await events.store.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(cas),
      stateHash: 'events-state',
    });
    await archive.store.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(cas),
      stateHash: 'archive-state',
    });
    const missingPage = new PageHandle({
      oid: 'f'.repeat(40),
      hashAlgorithm: 'sha1',
    });
    replaceDescriptor(cas, eventsRetained.bundle, missingPage.toString());

    const before = await events.diagnostics.inspectCache();
    const repair = await events.diagnostics.repairCache();
    const archiveAfter = await archive.diagnostics.inspectCache();

    expect(before.entries).toEqual([
      expect.objectContaining({
        status: 'missing',
        issue: expect.objectContaining({ code: 'HANDLE_TARGET_MISSING' }),
      }),
    ]);
    expect(repair.removedKeys).toEqual([before.entries[0]?.key]);
    expect(repair.after).toMatchObject({ healthy: true, entries: [] });
    expect(archiveAfter).toMatchObject({
      healthy: true,
      entries: [expect.objectContaining({
        status: 'live',
        stateHash: 'archive-state',
      })],
    });
    await expect(cas.pages.get({ handle: missingPage })).rejects.toMatchObject({
      code: 'HANDLE_TARGET_MISSING',
    });
    expect(cas.readCacheKeys(CACHE_NAMESPACE)).toHaveLength(1);
    await events.store.close();
    await archive.store.close();
  });

  it('reports and delegates expiry collection to git-cas sweep and repair', async () => {
    const harness = await createHarness();
    await harness.store.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });
    const cache = await harness.cas.caches.open({ namespace: CACHE_NAMESPACE });
    const [key] = harness.cas.readCacheKeys(CACHE_NAMESPACE);
    const [hit] = harness.cas.readCacheHits(CACHE_NAMESPACE);
    if (key === undefined || hit === undefined) {
      throw new Error('Expected retained cache fixture');
    }
    await cache.put(key, hit.handle, {
      retention: 'evictable',
      expiresAt: new Date(0),
    });

    const before = await harness.diagnostics.inspectCache();
    const repair = await harness.diagnostics.repairCache();

    expect(before.entries).toEqual([
      expect.objectContaining({
        key,
        status: 'expired',
        collectible: true,
      }),
    ]);
    expect(repair.removedKeys).toEqual([key]);
    expect(repair.after.entries).toEqual([]);
    expect(harness.cas.readCacheKeys(CACHE_NAMESPACE)).toEqual([]);
    await harness.store.close();
  });

  it('reports inspection failures without inventing cache state', async () => {
    const harness = await createHarness();
    const facade = withCache(harness.cas, (cache) => Object.freeze({
      ...cache,
      inspect: async () => await Promise.reject('inspection offline'),
    }));
    const diagnostics = createDiagnostics(facade, 'events');

    await expect(diagnostics.inspectCache()).resolves.toMatchObject({
      healthy: false,
      generation: null,
      entries: [],
      policy: null,
      issues: [{
        code: 'CACHE_DIAGNOSTIC_ERROR',
        message: 'inspection offline',
      }],
    });
    await harness.store.close();
  });

  it('reports a vanished cache hit and projects git-cas policy evidence', async () => {
    const harness = await createHarness();
    await harness.store.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });
    const facade = withCache(harness.cas, (cache) => Object.freeze({
      ...cache,
      get: async () => null,
      inspect: async (options) => Object.freeze({
        ...await cache.inspect(options),
        policy: Object.freeze({
          satisfied: false,
          entryCount: 1,
          logicalBytes: 42,
          pinnedEntries: 0,
          evictableEntries: 1,
          expiredEntries: 0,
          limits: Object.freeze({
            maxEntries: 10,
            maxBytes: 1024,
            accessResolutionMs: 60_000,
          }),
        }),
      }),
    }));
    const report = await createDiagnostics(facade, 'events').inspectCache();

    expect(report).toMatchObject({
      healthy: false,
      policy: {
        satisfied: false,
        entryCount: 1,
        logicalBytes: 42,
        maxEntries: 10,
        maxBytes: 1024,
      },
      entries: [{
        status: 'missing',
        issue: {
          code: 'CACHE_ENTRY_MISSING',
          message: 'git-cas could not resolve the retained entry',
        },
      }],
    });
    await harness.store.close();
  });

  it('separates descriptor mismatch from undecodable descriptor bytes', async () => {
    const harness = await createHarness();
    const retained = await harness.store.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    });
    replaceDescriptorBytes(
      harness.cas,
      retained.bundle,
      defaultCodec.encode(descriptor({ laneName: 'another-lane' })),
    );

    const mismatched = await harness.diagnostics.inspectCache();
    replaceDescriptorBytes(harness.cas, retained.bundle, new Uint8Array([0xff]));
    const malformed = await harness.diagnostics.inspectCache();

    expect(mismatched.entries).toEqual([
      expect.objectContaining({
        status: 'malformed',
        issue: expect.objectContaining({
          code: 'MATERIALIZATION_DESCRIPTOR_MISMATCH',
        }),
      }),
    ]);
    expect(malformed.entries).toEqual([
      expect.objectContaining({
        status: 'malformed',
        issue: expect.objectContaining({
          code: expect.not.stringMatching(/MISSING/),
        }),
      }),
    ]);
    await harness.store.close();
  });
});

type LaneHarness = Readonly<{
  cas: InMemoryGitCasFacade;
  store: GitCasMaterializationStoreAdapter;
  diagnostics: GitCasMaterializationCacheDiagnosticsAdapter;
}>;

async function createHarness(): Promise<LaneHarness> {
  const history = new InMemoryGraphAdapter();
  const cas = new InMemoryGitCasFacade({
    history,
    storage: new InMemoryBlobStorageAdapter(),
  });
  return createLane(cas, 'events');
}

function createLane(cas: InMemoryGitCasFacade, laneName: string): LaneHarness {
  const options = {
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName,
  };
  return Object.freeze({
    cas,
    store: new GitCasMaterializationStoreAdapter(options),
    diagnostics: new GitCasMaterializationCacheDiagnosticsAdapter({
      ...options,
      wallClockMs: () => 1,
    }),
  });
}

function createDiagnostics(
  cas: GitCasMaterializationCacheDiagnosticsFacade,
  laneName: string,
): GitCasMaterializationCacheDiagnosticsAdapter {
  return new GitCasMaterializationCacheDiagnosticsAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName,
    wallClockMs: () => 1,
  });
}

type DiagnosticsCache = Awaited<ReturnType<
  GitCasMaterializationCacheDiagnosticsFacade['caches']['open']
>>;

function withCache(
  cas: InMemoryGitCasFacade,
  rewrite: (cache: DiagnosticsCache) => DiagnosticsCache,
): GitCasMaterializationCacheDiagnosticsFacade {
  return {
    bundles: cas.bundles,
    pages: cas.pages,
    caches: {
      open: async (options) => rewrite(await cas.caches.open(options)),
    },
  };
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<MaterializationRoots> {
  const handles = new Map<typeof ROOT_NAMES[number], BundleHandle>();
  for (const [index, name] of ROOT_NAMES.entries()) {
    const page = await cas.pages.put({ source: new Uint8Array([index]) });
    const bundle = await cas.bundles.putOrdered({
      members: [['root', page.handle]],
    });
    handles.set(name, new BundleHandle(bundle.handle.toString()));
  }
  const root = (name: typeof ROOT_NAMES[number]): MaterializationRoot => {
    const handle = handles.get(name);
    if (handle === undefined) {
      throw new Error(`Missing ${name} root fixture`);
    }
    return MaterializationRoot.retained(handle);
  };
  return new MaterializationRoots({
    adjacency: root('adjacency'),
    edgeAlive: root('edge-alive'),
    edgeBirths: root('edge-births'),
    frontier: root('frontier'),
    nodeAlive: root('node-alive'),
    properties: root('properties'),
    provenanceSupport: root('provenance-support'),
    replayBasis: root('replay-basis'),
    roaringIndexes: root('roaring-indexes'),
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

function replaceDescriptor(
  cas: InMemoryGitCasFacade,
  bundle: BundleHandle,
  replacement: string,
): void {
  const members = cas.readBundleMembers(bundle.toString());
  cas.replaceBundleMembers(bundle.toString(), members.map(([path, handle]) => [
    path,
    path === DESCRIPTOR_PATH ? replacement : handle,
  ]));
}

function replaceDescriptorBytes(
  cas: InMemoryGitCasFacade,
  bundle: BundleHandle,
  bytes: Uint8Array,
): void {
  const descriptorHandle = cas.readBundleMembers(bundle.toString())
    .find(([path]) => path === DESCRIPTOR_PATH)?.[1];
  if (descriptorHandle === undefined) {
    throw new Error('Expected retained descriptor fixture');
  }
  cas.replaceStoredPage(descriptorHandle, bytes);
}

function descriptor(
  overrides: Readonly<Record<string, object | string | number | null>> = {},
): object {
  return {
    schemaVersion: 5,
    laneName: 'events',
    stateHash: 'state-hash',
    roots: ROOT_NAMES.map((name) => [name, 'retained']),
    coordinate: {
      ceiling: 12,
      frontier: [['writer-a', 'patch-a'], ['writer-b', 'patch-b']],
    },
    ...overrides,
  };
}
