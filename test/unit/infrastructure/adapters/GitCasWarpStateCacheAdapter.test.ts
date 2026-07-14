import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

const ERROR_OBJECT_UPDATE_FAILURE = /index update failed after retries: error object failure/;
const SIMULATED_UPDATE_FAILURE = /index update failed after retries: simulated write failure/;
const MALFORMED_INDEX_ERROR = /malformed state-cache index/;
const UNSUPPORTED_SCHEMA_ERROR = /unsupported state-cache index schema/;
const INDEX_NOT_OBJECT_ERROR = /state-cache index must be an object/;
const BLOB_READ_FAILED_ERROR = /blob read failed/;
const SNAPSHOTS_NOT_OBJECT_ERROR = /snapshots must be an object/;
const CHECKPOINT_HEAD_NOT_STRING_ERROR = /checkpointHeadId must be a string/;
import CasContentEncryptionPolicy from '../../../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type {
  RootSetEntry,
  RootSetMutationResult,
  RootSetState,
} from '@git-stunts/git-cas';

const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockRestoreStream = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();
let mockRootEntries: RootSetEntry[] = [];
const mockRootRead = vi.fn(async (): Promise<RootSetState> => ({
  ref: 'refs/cas/rootsets/git-warp/test-graph/state-cache',
  headOid: mockRootEntries.length === 0 ? null : 'a'.repeat(40),
  treeOid: mockRootEntries.length === 0 ? null : 'a'.repeat(40),
  entries: [...mockRootEntries],
}));
const mockRootMutate = vi.fn(async (
  mutator: (
    entries: ReadonlyArray<Readonly<RootSetEntry>>,
  ) => Iterable<RootSetEntry> | Promise<Iterable<RootSetEntry>>,
): Promise<RootSetMutationResult> => {
  mockRootEntries = [...await mutator(mockRootEntries)];
  return {
    changed: true,
    commitOid: 'b'.repeat(40),
    treeOid: 'b'.repeat(40),
    entries: [...mockRootEntries],
  };
});
const mockRootReplace = vi.fn(async (options: {
  entries: Iterable<RootSetEntry>;
  expectedHeadOid?: string | null;
}): Promise<RootSetMutationResult> => {
  mockRootEntries = [...options.entries];
  return {
    changed: true,
    commitOid: 'c'.repeat(40),
    treeOid: 'c'.repeat(40),
    entries: [...mockRootEntries],
  };
});
const mockRootDoctor = vi.fn(async () => ({
  healthy: true,
  ref: 'refs/cas/rootsets/git-warp/test-graph/state-cache',
  entries: [...mockRootEntries],
}));
const mockRootRepair = vi.fn(async (options: { entries: Iterable<RootSetEntry> }) => {
  mockRootEntries = [...options.entries];
  return {
    repaired: true as const,
    commitOid: 'c'.repeat(40),
    treeOid: 'c'.repeat(40),
    entries: [...mockRootEntries],
  };
});
const mockOpenRootSet = vi.fn(async () => ({
  read: mockRootRead,
  mutate: mockRootMutate,
  replace: mockRootReplace,
  doctor: mockRootDoctor,
  repair: mockRootRepair,
}));

class MockContentAddressableStore {
  rootSets = { open: mockOpenRootSet };
  readManifest: any;
  restore: any;
  store: any;
  createTree: any;
  restoreStream: any;
  constructor() {
    this.readManifest = mockReadManifest;
    this.restore = mockRestore;
    this.store = mockStore;
    this.createTree = mockCreateTree;
    this.restoreStream = (options: any) => {
      const configured = mockRestoreStream(options);
      if (configured !== undefined) {
        return configured;
      }
      return (async function* () {
        const restored = await mockRestore(options);
        yield restored.buffer;
      })();
    };
  }
}

class MockCborCodec {}

vi.mock('@git-stunts/git-cas', () => ({
  default: MockContentAddressableStore,
  CborCodec: MockCborCodec,
}));

// Import after mock setup
const { GitCasWarpStateCacheAdapter } = await import(
  '../../../../src/infrastructure/adapters/GitCasWarpStateCacheAdapter.ts'
);
const { default: WarpStateCachePort } = await import(
  '../../../../src/ports/WarpStateCachePort.ts'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    readBlob: vi.fn().mockResolvedValue(new TextEncoder().encode('{}')),
    writeBlob: vi.fn().mockResolvedValue('blob-oid-1'),
    updateRef: vi.fn().mockResolvedValue(undefined),
    deleteRef: vi.fn().mockResolvedValue(undefined),
    compareAndSwapRef: vi.fn().mockResolvedValue(undefined),
    nodeExists: vi.fn().mockResolvedValue(true),
    readObjectType: vi.fn().mockResolvedValue('tree'),
  };
}

function indexBuffer(snapshots = {}, checkpointHeadId?: string, schemaVersion = 1) {
  return new TextEncoder().encode(JSON.stringify({ schemaVersion, checkpointHeadId, snapshots }));
}

function createGoldenState() {
  const nodeAlive = ORSet.empty();
  nodeAlive.add('user:alice', Dot.create('w1', 1));

  const edgeAlive = ORSet.empty();
  edgeAlive.add('user:alice\x00user:bob\x00knows', Dot.create('w1', 2));

  const prop = new Map() as any;
  prop.set('user:alice\x00name', {
    eventId: { lamport: 1, writerId: 'w1', patchSha: 'a'.repeat(40), opIndex: 0 },
    value: 'Alice',
  });

  const observedFrontier = VersionVector.empty();
  observedFrontier.set('w1', 2);

  const edgeBirthEvent = new Map() as any;
  edgeBirthEvent.set('user:alice\x00user:bob\x00knows', {
    lamport: 2, writerId: 'w1', patchSha: 'a'.repeat(40), opIndex: 1,
  });

  return new WarpState({ nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent });
}

const GRAPH_NAME = 'test-graph';
const EXPECTED_REF = `refs/warp/${GRAPH_NAME}/state-cache`;
const SAMPLE_SNAPSHOT_ID = 'snap-12345';
const SAMPLE_COORDINATE = {
  frontier: new Map([['w1', 'a'.repeat(40)]]),
  ceiling: 10,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitCasWarpStateCacheAdapter', () => {
  let persistence: ReturnType<typeof makePersistence>;
  let codec: CborCodec;
  let adapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRootEntries = [];
    persistence = makePersistence();
    codec = new CborCodec();
    adapter = new GitCasWarpStateCacheAdapter({
      persistence,
      cas: new MockContentAddressableStore(),
      graphName: GRAPH_NAME,
      codec,
    });
  });

  // -------------------------------------------------------------------------
  // Constructor & Initialization
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('extends WarpStateCachePort', () => {
      expect(adapter).toBeInstanceOf(WarpStateCachePort);
    });

    it('defaults maxEntries to 200', () => {
      expect(adapter._maxEntries).toBe(200);
    });

    it('respects custom maxEntries', () => {
      const custom = new GitCasWarpStateCacheAdapter({
        persistence, cas: new MockContentAddressableStore(), graphName: GRAPH_NAME, codec, maxEntries: 50,
      });
      expect((custom as any)._maxEntries).toBe(50);
    });

    it('builds the correct ref path', () => {
      expect(adapter._ref).toBe(EXPECTED_REF);
    });

    it('configures encryptionKey and contentEncryption when provided', () => {
      const key = new Uint8Array(32).fill(0xab);
      const encrypted = new GitCasWarpStateCacheAdapter({
        persistence, cas: new MockContentAddressableStore(), graphName: GRAPH_NAME, codec, encryptionKey: key,
      });
      expect((encrypted as any)._encryptionKey).toBe(key);
      expect((encrypted as any)._contentEncryption).toBeInstanceOf(CasContentEncryptionPolicy);
    });

    it('accepts explicit contentEncryption policy', () => {
      const policy = CasContentEncryptionPolicy.disabled();
      const custom = new GitCasWarpStateCacheAdapter({
        persistence, cas: new MockContentAddressableStore(), graphName: GRAPH_NAME, codec, contentEncryption: policy,
      });
      expect((custom as any)._contentEncryption).toBe(policy);
    });

  });

  // -------------------------------------------------------------------------
  // Index Reading & Mutations
  // -------------------------------------------------------------------------

  describe('_readIndex & _mutateIndex', () => {
    it('returns empty index when ref is missing or empty', async () => {
      persistence.readRef.mockResolvedValueOnce(null);
      const idx = await adapter._readIndex();
      expect(idx).toEqual({ schemaVersion: 1, snapshots: {} });

      persistence.readRef.mockResolvedValueOnce('');
      const idx2 = await adapter._readIndex();
      expect(idx2).toEqual({ schemaVersion: 1, snapshots: {} });
    });

    it('fails closed on unreadable or invalid persisted indexes', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValueOnce(new TextEncoder().encode('invalid-json'));
      await expect(adapter._readIndex()).rejects.toThrow(MALFORMED_INDEX_ERROR);

      persistence.readBlob.mockResolvedValueOnce(indexBuffer({}, undefined, 999));
      await expect(adapter._readIndex()).rejects.toThrow(UNSUPPORTED_SCHEMA_ERROR);

      persistence.readBlob.mockResolvedValueOnce(new TextEncoder().encode('null'));
      await expect(adapter._readIndex()).rejects.toThrow(INDEX_NOT_OBJECT_ERROR);

      persistence.readBlob.mockRejectedValueOnce(new Error('blob read failed'));
      await expect(adapter._readIndex()).rejects.toThrow(BLOB_READ_FAILED_ERROR);

      persistence.readBlob.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({
        schemaVersion: 1,
      })));
      expect(await adapter._readIndex()).toEqual({ schemaVersion: 1, snapshots: {} });

      persistence.readBlob.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({
        schemaVersion: 1,
        snapshots: 'invalid',
      })));
      await expect(adapter._readIndex()).rejects.toThrow(SNAPSHOTS_NOT_OBJECT_ERROR);

      persistence.readBlob.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({
        schemaVersion: 1,
        checkpointHeadId: 42,
        snapshots: {},
      })));
      await expect(adapter._readIndex()).rejects.toThrow(CHECKPOINT_HEAD_NOT_STRING_ERROR);
    });

    it('does not publish after a persisted index read fails', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockRejectedValue(new Error('blob read failed'));

      await expect(adapter._mutateIndex((idx: any) => idx)).rejects.toThrow(
        BLOB_READ_FAILED_ERROR,
      );

      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect(persistence.compareAndSwapRef).not.toHaveBeenCalled();
    });

    it('retries index update on failure and throws on max retries', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({}));
      persistence.writeBlob.mockRejectedValue('simulated write failure');

      await expect(adapter._mutateIndex((idx: any) => idx)).rejects.toThrow(
        SIMULATED_UPDATE_FAILURE,
      );
      expect(persistence.writeBlob).toHaveBeenCalledTimes(3);

      persistence.writeBlob.mockClear();
      persistence.writeBlob.mockRejectedValue(new Error('error object failure'));
      await expect(adapter._mutateIndex((idx: any) => idx)).rejects.toThrow(
        ERROR_OBJECT_UPDATE_FAILURE,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Put (Storing Snapshots)
  // -------------------------------------------------------------------------

  describe('put', () => {
    it('throws WarpError if snapshot has no state', async () => {
      const snapshotWithoutState = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: SAMPLE_COORDINATE,
        retention: 'evictable' as const,
        provenancePosture: 'complete' as const,
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      await expect(adapter.put(snapshotWithoutState)).rejects.toThrow(/Cannot cache snapshot without WarpState/);
    });

    it('stores snapshot with state successfully in CAS and prunes evictable if needed', async () => {
      const state = createGoldenState();
      const snapshot = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: SAMPLE_COORDINATE,
        retention: 'evictable' as const,
        provenancePosture: 'complete' as const,
        stateHash: 'hash-1',
        payloadRef: '',
        createdAt: new Date().toISOString(),
        state,
      };

      mockStore.mockResolvedValueOnce({ cid: 'cid-1' });
      mockCreateTree.mockResolvedValueOnce('new-tree-oid');
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({}));

      const result = await adapter.put(snapshot);
      expect(result.payloadRef).toBe('new-tree-oid');
      expect(persistence.writeBlob).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Pin
  // -------------------------------------------------------------------------

  describe('pin', () => {
    it('throws CacheError if snapshotId is not in index', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({}));
      await expect(adapter.pin('non-existent')).rejects.toThrow(/not found in state cache/);
    });

    it('pins existing snapshot successfully', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      const pinned = await adapter.pin(SAMPLE_SNAPSHOT_ID);
      expect(pinned.retention).toBe('pinned');
    });
  });

  // -------------------------------------------------------------------------
  // Publish & Resolve Checkpoint Head
  // -------------------------------------------------------------------------

  describe('publishCheckpointHead & resolveCheckpointHead', () => {
    it('publishes checkpoint head successfully', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({}));
      await adapter.publishCheckpointHead(GRAPH_NAME, SAMPLE_SNAPSHOT_ID);
      expect(persistence.writeBlob).toHaveBeenCalled();
    });

    it('returns null if checkpointHeadId is missing or snapshot not in index', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({}, undefined));
      expect(await adapter.resolveCheckpointHead(GRAPH_NAME)).toBeNull();

      persistence.readBlob.mockResolvedValue(indexBuffer({}, SAMPLE_SNAPSHOT_ID));
      expect(await adapter.resolveCheckpointHead(GRAPH_NAME)).toBeNull();
    });

    it.each([false, true])('resolves checkpoint head via restoreStream with split=%s', async (splitStream) => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob
        .mockResolvedValueOnce(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }, SAMPLE_SNAPSHOT_ID))
        .mockResolvedValue(indexBuffer({}, SAMPLE_SNAPSHOT_ID));

      const encodedState = codec.encode({
        version: 'full-v5',
        nodeAlive: {},
        edgeAlive: {},
        prop: [['user:alice\x00name', { eventId: { lamport: 1, writerId: 'w1', patchSha: 'a'.repeat(40), opIndex: 0 }, value: 'Alice' }]],
        observedFrontier: {},
        edgeBirthEvent: [['user:alice\x00knows', { lamport: 1, writerId: 'w1', patchSha: 'a'.repeat(40), opIndex: 0 }]],
      });

      mockReadManifest.mockResolvedValueOnce({ some: 'manifest' });
      mockRestoreStream.mockImplementationOnce(async function* () {
        if (splitStream) {
          const midpoint = Math.floor(encodedState.byteLength / 2);
          yield encodedState.slice(0, midpoint);
          yield encodedState.slice(midpoint);
        } else {
          yield encodedState;
        }
      });

      const resolved = await adapter.resolveCheckpointHead(GRAPH_NAME);
      expect(resolved).not.toBeNull();
      expect(resolved!.state).toBeInstanceOf(WarpState);
    });

    it('deletes checkpoint head and entry on CAS restore failure', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }, SAMPLE_SNAPSHOT_ID));

      mockReadManifest.mockRejectedValueOnce(new Error('Corrupted CAS object'));

      const resolved = await adapter.resolveCheckpointHead(GRAPH_NAME);
      expect(resolved).toBeNull();
      expect(persistence.writeBlob).toHaveBeenCalled();
    });

    it('throws encryption error directly without deleting on decryption failure', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }, SAMPLE_SNAPSHOT_ID));

      const err = new Error('vault passphrase verification failed') as any;
      err.code = 'ERR_CIPHER_AUTH_FAILED';
      mockReadManifest.mockRejectedValueOnce(err);

      await expect(adapter.resolveCheckpointHead(GRAPH_NAME)).rejects.toThrow(/vault passphrase verification failed/);
    });
  });

  // -------------------------------------------------------------------------
  // getExact & getBestCompatiblePredecessor
  // -------------------------------------------------------------------------

  describe('getExact & getBestCompatiblePredecessor', () => {
    it('returns null if no exact match found', async () => {
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({}));
      expect(await adapter.getExact(SAMPLE_COORDINATE)).toBeNull();
      expect(await adapter.getBestCompatiblePredecessor(SAMPLE_COORDINATE)).toBeNull();
    });

    it('resolves exact match successfully via standard restore', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      const encodedState = codec.encode({
        version: 'full-v5',
        nodeAlive: {},
        edgeAlive: {},
        prop: [],
        observedFrontier: {},
        edgeBirthLamport: [['user:alice\x00knows', 1]],
      });

      mockReadManifest.mockResolvedValueOnce({ some: 'manifest' });
      mockRestore.mockResolvedValueOnce({ buffer: encodedState });

      const match = await adapter.getExact(SAMPLE_COORDINATE);
      expect(match).not.toBeNull();
      expect(match!.state).toBeInstanceOf(WarpState);
    });

    it('deletes entry on CAS restore failure in getExact', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      mockReadManifest.mockRejectedValueOnce(new Error('Corrupted CAS object'));

      expect(await adapter.getExact(SAMPLE_COORDINATE)).toBeNull();
      expect(persistence.writeBlob).toHaveBeenCalled();
    });

    it('throws encryption error directly without deleting in getExact', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      const err = new Error('vault passphrase verification failed') as any;
      err.code = 'ERR_CIPHER_AUTH_FAILED';
      mockReadManifest.mockRejectedValueOnce(err);

      await expect(adapter.getExact(SAMPLE_COORDINATE)).rejects.toThrow(/vault passphrase verification failed/);
    });

    it('resolves best compatible predecessor successfully', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 5 }, // ceiling 5 <= 10
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      const encodedState = codec.encode({
        version: 'full-v5',
        nodeAlive: {},
        edgeAlive: {},
        prop: [],
        observedFrontier: {},
      });

      mockReadManifest.mockResolvedValueOnce({ some: 'manifest' });
      mockRestore.mockResolvedValueOnce({ buffer: encodedState });

      const match = await adapter.getBestCompatiblePredecessor(SAMPLE_COORDINATE);
      expect(match).not.toBeNull();
      expect(match!.state).toBeInstanceOf(WarpState);
    });

    it('deletes entry on CAS restore failure in getBestCompatiblePredecessor', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 5 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      mockReadManifest.mockRejectedValueOnce(new Error('Corrupted CAS object'));

      expect(await adapter.getBestCompatiblePredecessor(SAMPLE_COORDINATE)).toBeNull();
      expect(persistence.writeBlob).toHaveBeenCalled();
    });

    it('throws encryption error directly without deleting in getBestCompatiblePredecessor', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 5 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      const err = new Error('vault passphrase verification failed') as any;
      err.code = 'ERR_CIPHER_AUTH_FAILED';
      mockReadManifest.mockRejectedValueOnce(err);

      await expect(adapter.getBestCompatiblePredecessor(SAMPLE_COORDINATE)).rejects.toThrow(/vault passphrase verification failed/);
    });
  });

  // -------------------------------------------------------------------------
  // Prune Evictable
  // -------------------------------------------------------------------------

  describe('pruneEvictable', () => {
    it('prunes evictable snapshots successfully', async () => {
      const prunableAdapter = new GitCasWarpStateCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
        codec,
        maxEntries: 0,
      });
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      await prunableAdapter.pruneEvictable();

      expect(persistence.writeBlob).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases in Decoding State
  // -------------------------------------------------------------------------

  describe('decoding edge cases', () => {
    it('throws WarpError on unsupported full state version', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      const invalidVersionState = codec.encode({
        version: 'unsupported-v999',
      });

      mockReadManifest.mockResolvedValueOnce({ some: 'manifest' });
      mockRestore.mockResolvedValueOnce({ buffer: invalidVersionState });

      // getExact catches non-encryption errors and deletes the entry
      const match = await adapter.getExact(SAMPLE_COORDINATE);
      expect(match).toBeNull();
      expect(persistence.writeBlob).toHaveBeenCalled();
    });

    it('handles null/empty state buffer gracefully', async () => {
      const entry = {
        snapshotId: SAMPLE_SNAPSHOT_ID,
        coordinate: { frontier: { w1: 'a'.repeat(40) }, ceiling: 10 },
        retention: 'evictable',
        provenancePosture: 'complete',
        stateHash: 'hash-1',
        payloadRef: 'tree-1',
        createdAt: new Date().toISOString(),
      };
      persistence.readRef.mockResolvedValue('blob-1');
      persistence.readBlob.mockResolvedValue(indexBuffer({ [SAMPLE_SNAPSHOT_ID]: entry }));

      mockReadManifest.mockResolvedValueOnce({ some: 'manifest' });
      mockRestore.mockResolvedValueOnce({ buffer: null as any });

      const match = await adapter.getExact(SAMPLE_COORDINATE);
      expect(match).not.toBeNull();
      expect(match!.state).toBeInstanceOf(WarpState);
    });
  });
});
