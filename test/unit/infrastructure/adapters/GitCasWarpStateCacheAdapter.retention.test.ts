import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RootSetEntry,
  RootSetMutationResult,
  RootSetState,
} from '@git-stunts/git-cas';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

const INDEX_HEAD = 'd'.repeat(40);
const ROOT_HEAD = 'e'.repeat(40);
const NEXT_ROOT_HEAD = 'f'.repeat(40);
const PAYLOAD_TREE = 'a'.repeat(40);
const INDEX_BLOB = 'b'.repeat(40);
const events: string[] = [];
let rootEntries: RootSetEntry[] = [];

const mockRootRead = vi.fn(async (): Promise<RootSetState> => ({
  ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
  headOid: rootEntries.length === 0 ? null : ROOT_HEAD,
  treeOid: rootEntries.length === 0 ? null : ROOT_HEAD,
  entries: [...rootEntries],
}));
const mockRootMutate = vi.fn(async (
  mutator: (
    entries: ReadonlyArray<Readonly<RootSetEntry>>,
  ) => Iterable<RootSetEntry> | Promise<Iterable<RootSetEntry>>,
): Promise<RootSetMutationResult> => {
  events.push('root:prepare');
  rootEntries = Array.from(await mutator(rootEntries));
  return {
    changed: true,
    commitOid: NEXT_ROOT_HEAD,
    treeOid: NEXT_ROOT_HEAD,
    entries: [...rootEntries],
  };
});
const mockRootReplace = vi.fn(async (options: {
  entries: Iterable<RootSetEntry>;
  expectedHeadOid?: string | null;
}): Promise<RootSetMutationResult> => {
  events.push('root:cleanup');
  rootEntries = Array.from(options.entries);
  return {
    changed: true,
    commitOid: ROOT_HEAD,
    treeOid: ROOT_HEAD,
    entries: [...rootEntries],
  };
});
const mockRootDoctor = vi.fn(async () => ({
  healthy: true,
  ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
  headOid: rootEntries.length === 0 ? null : ROOT_HEAD,
  entries: [...rootEntries],
}));
const mockRootRepair = vi.fn(async (options: { entries: Iterable<RootSetEntry> }) => {
  rootEntries = Array.from(options.entries);
  return {
    repaired: true as const,
    commitOid: ROOT_HEAD,
    treeOid: ROOT_HEAD,
    entries: [...rootEntries],
  };
});
const mockOpenRootSet = vi.fn(() => ({
  read: mockRootRead,
  mutate: mockRootMutate,
  replace: mockRootReplace,
  doctor: mockRootDoctor,
  repair: mockRootRepair,
}));

class MockContentAddressableStore {
  readonly rootSets = { open: mockOpenRootSet };
}

class MockCborCodec {}

vi.mock('@git-stunts/git-cas', () => ({
  default: MockContentAddressableStore,
  CborCodec: MockCborCodec,
}));

const { GitCasWarpStateCacheAdapter } = await import(
  '../../../../src/infrastructure/adapters/GitCasWarpStateCacheAdapter.ts'
);

function encodedIndex(): Uint8Array {
  const payload = {
    schemaVersion: 1,
    snapshots: {
      'snapshot-a': {
        snapshotId: 'snapshot-a',
        coordinate: { frontier: { 'writer-1': 'c'.repeat(40) }, ceiling: 3 },
        retention: 'evictable',
        provenancePosture: 'full',
        stateHash: 'state-hash-a',
        payloadRef: PAYLOAD_TREE,
        createdAt: '2026-07-11T20:00:00.000Z',
      },
    },
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

function persistenceFixture() {
  return {
    readRef: vi.fn().mockResolvedValue(INDEX_HEAD),
    readBlob: vi.fn().mockResolvedValue(encodedIndex()),
    writeBlob: vi.fn(async () => {
      events.push('index:write');
      return INDEX_BLOB;
    }),
    compareAndSwapRef: vi.fn(async () => {
      events.push('index:publish');
    }),
    nodeExists: vi.fn().mockResolvedValue(true),
    readObjectType: vi.fn().mockResolvedValue('tree'),
  };
}

describe('GitCasWarpStateCacheAdapter root-set retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    rootEntries = [];
  });

  it('adopts legacy JSON-only payload refs before serving a cache read', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });

    const result = await adapter.getExact({
      frontier: new Map([['other-writer', '9'.repeat(40)]]),
      ceiling: 3,
    });

    expect(result).toBeNull();
    expect(mockOpenRootSet).toHaveBeenCalledWith({
      ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
    });
    expect(rootEntries).toEqual([
      { name: 'snapshot-a', oid: PAYLOAD_TREE, type: 'tree', retention: 'evictable' },
    ]);
  });

  it('checks legacy retention only once per adapter instance', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });
    const coordinate = {
      frontier: new Map([['other-writer', '9'.repeat(40)]]),
      ceiling: 3,
    };

    await adapter.getExact(coordinate);
    await adapter.getExact(coordinate);

    expect(mockRootRead).toHaveBeenCalledTimes(1);
    expect(mockRootMutate).toHaveBeenCalledTimes(1);
  });

  it('retries legacy adoption after a root-set read failure', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });
    const coordinate = {
      frontier: new Map([['other-writer', '9'.repeat(40)]]),
      ceiling: 3,
    };
    mockRootRead.mockRejectedValueOnce(new Error('root read failed'));

    await expect(adapter.getExact(coordinate)).rejects.toThrow(/root read failed/);
    await expect(adapter.getExact(coordinate)).resolves.toBeNull();

    expect(mockRootRead).toHaveBeenCalledTimes(2);
  });

  it('does not clear a newer adoption after an older attempt fails', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });
    let rejectRead: (reason?: unknown) => void = () => {
      throw new Error('root read rejection was not captured');
    };
    mockRootRead.mockImplementationOnce(async () => await new Promise<RootSetState>(
      (_resolve, reject) => { rejectRead = reject; },
    ));

    const pending = adapter.getExact({
      frontier: new Map([['other-writer', '9'.repeat(40)]]),
      ceiling: 3,
    });
    await vi.waitFor(() => expect(mockRootRead).toHaveBeenCalledOnce());
    const newerAdoption = Promise.resolve();
    Reflect.set(adapter, '_retentionAdoption', newerAdoption);
    rejectRead(new Error('older adoption failed'));

    await expect(pending).rejects.toThrow(/older adoption failed/);
    expect(Reflect.get(adapter, '_retentionAdoption')).toBe(newerAdoption);
  });

  it('publishes metadata-only index changes without another root-set generation', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });
    await adapter.getExact({
      frontier: new Map([['other-writer', '9'.repeat(40)]]),
      ceiling: 3,
    });

    await adapter.publishCheckpointHead('demo', 'snapshot-a');

    expect(mockRootMutate).toHaveBeenCalledTimes(1);
    expect(persistence.compareAndSwapRef).toHaveBeenCalledWith(
      'refs/warp/demo/state-cache',
      INDEX_BLOB,
      INDEX_HEAD,
    );
  });

  it('republishes roots when retention metadata changes', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });
    await adapter.getBestCompatiblePredecessor({
      frontier: new Map([['writer-1', '9'.repeat(40)]]),
      ceiling: null,
    });

    const pinned = await adapter.pin('snapshot-a');

    expect(pinned.retention).toBe('pinned');
    expect(mockRootMutate).toHaveBeenCalledTimes(2);
  });

  it('pre-anchors, compare-and-swaps the index head, then performs guarded cleanup', async () => {
    rootEntries = [
      { name: 'stale', oid: ROOT_HEAD, type: 'tree', retention: 'evictable' },
    ];
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });

    await adapter.pruneEvictable();

    expect(events).toEqual([
      'root:prepare',
      'index:write',
      'index:publish',
      'root:cleanup',
    ]);
    expect(persistence.compareAndSwapRef).toHaveBeenCalledWith(
      'refs/warp/demo/state-cache',
      INDEX_BLOB,
      INDEX_HEAD,
    );
    expect(mockRootReplace).toHaveBeenCalledWith({
      entries: [
        { name: 'snapshot-a', oid: PAYLOAD_TREE, type: 'tree', retention: 'evictable' },
      ],
      expectedHeadOid: NEXT_ROOT_HEAD,
    });
  });

  it('exposes retention inspection and repair through the cache port', async () => {
    const persistence = persistenceFixture();
    const adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      plumbing: {},
      graphName: 'demo',
      codec: new CborCodec(),
    });

    const inspection = await adapter.inspectRetention();
    const repair = await adapter.repairRetention();

    expect(inspection.unanchoredSnapshotIds).toEqual(['snapshot-a']);
    expect(repair.anchoredSnapshotIds).toEqual(['snapshot-a']);
    expect(repair.after.isHealthy()).toBe(true);
  });
});
