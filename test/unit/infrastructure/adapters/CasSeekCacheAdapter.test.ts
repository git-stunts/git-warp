import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockRestoreStream = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

class MockContentAddressableStore {
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

const { default: CasSeekCacheAdapter } = await import(
  '../../../../src/infrastructure/adapters/CasSeekCacheAdapter.ts'
);
const { default: SeekCachePort } = await import(
  '../../../../src/ports/SeekCachePort.ts'
);
const { default: CasContentEncryptionPolicy } = await import(
  '../../../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal mock persistence port with vi.fn() stubs. */
function makePersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    readBlob: vi.fn().mockResolvedValue(new TextEncoder().encode('{}')),
    writeBlob: vi.fn().mockResolvedValue('blob-oid-1'),
    updateRef: vi.fn().mockResolvedValue(undefined),
    deleteRef: vi.fn().mockResolvedValue(undefined),
  };
}

/** Builds a JSON index buffer for readBlob to return. */
function indexBuffer(entries = {}) {
  return new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, entries }));
}

const GRAPH_NAME = 'test-graph';
const EXPECTED_REF = `refs/warp/${GRAPH_NAME}/seek-cache`;
const SAMPLE_KEY = 'v1:t42-abcdef0123456789';
const SAMPLE_BUFFER = new TextEncoder().encode('serialized-state-data');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CasSeekCacheAdapter', () => {
    let persistence;
    let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = makePersistence();
    adapter = new CasSeekCacheAdapter({
      persistence,
      cas: new MockContentAddressableStore(),
      graphName: GRAPH_NAME,
    });
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('extends SeekCachePort', () => {
      expect(adapter).toBeInstanceOf(SeekCachePort);
    });

    it('defaults maxEntries to 200', () => {
      expect((adapter as any)._maxEntries).toBe(200);
    });

    it('respects custom maxEntries', () => {
      const custom = new CasSeekCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
        maxEntries: 50,
      });
      expect((custom as any)._maxEntries).toBe(50);
    });

    it('builds the correct ref path', () => {
      expect(adapter._ref).toBe(EXPECTED_REF);
    });

    it('stores encryptionKey when provided', () => {
      const key = new Uint8Array(32).fill(0xab);
      const encrypted = new CasSeekCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
        encryptionKey: key,
      });
      expect((encrypted as any)._encryptionKey).toBe(key);
    });

    it('defaults encryptionKey to undefined', () => {
      expect((adapter as any)._encryptionKey).toBeUndefined();
    });

  });

  // -------------------------------------------------------------------------
  // _parseKey
  // -------------------------------------------------------------------------

  describe('_parseKey()', () => {
    it('extracts ceiling and frontierHash from v1 key', () => {
      const result = adapter._parseKey('v1:t42-abcdef0123456789');
      expect(result).toEqual({ ceiling: 42, frontierHash: 'abcdef0123456789' });
    });

    it('handles large ceiling values', () => {
      const result = adapter._parseKey('v1:t99999-deadbeef');
      expect(result).toEqual({ ceiling: 99999, frontierHash: 'deadbeef' });
    });

    it('handles ceiling of zero', () => {
      const result = adapter._parseKey('v1:t0-abc123');
      expect(result).toEqual({ ceiling: 0, frontierHash: 'abc123' });
    });

    it('handles long frontierHash with dashes', () => {
      const result = adapter._parseKey('v1:t7-aa-bb-cc');
      expect(result).toEqual({ ceiling: 7, frontierHash: 'aa-bb-cc' });
    });
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------

  describe('get()', () => {
    it('returns null on cache miss (key not in index)', async () => {
      persistence.readRef.mockResolvedValue(null);
      const result = await adapter.get(SAMPLE_KEY);
      expect(result).toBeNull();
    });

    it('returns buffer on cache hit', async () => {
      const treeOid = 'tree-oid-abc';
      const manifest = { chunks: ['c1'] };
      const stateBuffer = new TextEncoder().encode('restored-state');

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: stateBuffer });

      const result = await adapter.get(SAMPLE_KEY);

      expect(result).toEqual({ buffer: stateBuffer });
      expect(mockReadManifest).toHaveBeenCalledWith({ treeOid });
      expect(mockRestore).toHaveBeenCalledWith({ manifest });
    });

    it('returns retained index tree metadata on a cache hit', async () => {
      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(indexBuffer({
        [SAMPLE_KEY]: {
          treeOid: 'tree-oid',
          indexTreeOid: 'index-tree-oid',
          createdAt: new Date().toISOString(),
        },
      }));
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestore.mockResolvedValue({ buffer: SAMPLE_BUFFER });

      await expect(adapter.get(SAMPLE_KEY)).resolves.toEqual({
        buffer: SAMPLE_BUFFER,
        indexTreeOid: 'index-tree-oid',
      });
    });

    it('updates lastAccessedAt on successful cache hit', async () => {
      const treeOid = 'tree-oid-abc';
      const manifest = { chunks: ['c1'] };
      const stateBuffer = new TextEncoder().encode('restored-state');
      const originalEntry = {
        treeOid,
        createdAt: '2025-01-01T00:00:00Z',
      };

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: originalEntry })
      );
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: stateBuffer });

      await adapter.get(SAMPLE_KEY);

      // Verify index was written back with lastAccessedAt
      expect(persistence.writeBlob).toHaveBeenCalled();
      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      expect(writtenJson.entries[SAMPLE_KEY].lastAccessedAt).toBeDefined();
      expect(writtenJson.entries[SAMPLE_KEY].createdAt).toBe('2025-01-01T00:00:00Z');
    });

    it('self-heals on corrupted/GC-d blob by removing the dead entry', async () => {
      const treeOid = 'dead-tree-oid';

      persistence.readRef.mockResolvedValue('index-oid');
      // First readBlob call returns index with the dead entry
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockRejectedValue(new Error('object not found'));

      const result = await adapter.get(SAMPLE_KEY);

      expect(result).toBeNull();
      // Verify it attempted to mutate the index to remove the dead entry
      expect(persistence.writeBlob).toHaveBeenCalled();
      expect(persistence.updateRef).toHaveBeenCalled();
    });

    it('self-heals when restore fails', async () => {
      const treeOid = 'bad-tree';
      const manifest = { chunks: ['c1'] };

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockRejectedValue(new Error('corrupt chunk'));

      const result = await adapter.get(SAMPLE_KEY);
      expect(result).toBeNull();
    });

    it('preserves encryption failures instead of deleting the cache entry', async () => {
      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(indexBuffer({
        [SAMPLE_KEY]: { treeOid: 'encrypted-tree', createdAt: new Date().toISOString() },
      }));
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestore.mockRejectedValue(Object.assign(
        new Error('Vault passphrase verification failed'),
        { code: 'INTEGRITY_ERROR' },
      ));

      await expect(adapter.get(SAMPLE_KEY)).rejects.toMatchObject({
        code: 'E_CAS_VAULT_PASSPHRASE_FAILED',
      });
      expect(persistence.writeBlob).not.toHaveBeenCalled();
    });

    it('passes encryptionKey to cas.restore when configured', async () => {
      const encKey = new Uint8Array(32).fill(0xab);
      const encAdapter = new CasSeekCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
        encryptionKey: encKey,
      });
      const treeOid = 'tree-oid-enc';
      const manifest = { chunks: ['c1'] };
      const stateBuffer = new TextEncoder().encode('encrypted-state');

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: stateBuffer });

      await encAdapter.get(SAMPLE_KEY);

      expect(mockRestore).toHaveBeenCalledWith({
        manifest,
        encryptionKey: encKey,
      });
    });

    it('does not pass encryptionKey to cas.restore when not configured', async () => {
      const treeOid = 'tree-oid-plain';
      const manifest = { chunks: ['c1'] };

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: new TextEncoder().encode('plain') });

      await adapter.get(SAMPLE_KEY);

      expect(mockRestore).toHaveBeenCalledWith({ manifest });
    });

    it('uses restoreStream() when available, concatenating chunks', async () => {
      const streamAdapter = new CasSeekCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
      });

      const treeOid = 'tree-stream';
      const manifest = { chunks: ['c1', 'c2'] };
      const chunk1 = new TextEncoder().encode('hello-');
      const chunk2 = new TextEncoder().encode('world');

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockResolvedValue(manifest);
      // restoreStream returns an async iterable of chunks
      mockRestoreStream.mockReturnValue((async function* () {
        yield chunk1;
        yield chunk2;
      })());

      const result = await streamAdapter.get(SAMPLE_KEY);

      expect(result).not.toBeNull();
      expect(new TextDecoder().decode((result!).buffer)).toBe('hello-world');
      expect(mockRestoreStream).toHaveBeenCalledWith({ manifest });
      // Should NOT fall back to cas.restore()
      expect(mockRestore).not.toHaveBeenCalled();
    });

  });

  // -------------------------------------------------------------------------
  // set()
  // -------------------------------------------------------------------------

  describe('set()', () => {
    it('stores buffer via CAS and updates the index', async () => {
      const manifest = { chunks: ['c1'] };
      const treeOid = 'new-tree-oid';

      mockStore.mockResolvedValue(manifest);
      mockCreateTree.mockResolvedValue(treeOid);
      persistence.readRef.mockResolvedValue(null);

      await adapter.set(SAMPLE_KEY, SAMPLE_BUFFER);

      // CAS store
      expect(mockStore).toHaveBeenCalledWith(
        expect.objectContaining({ slug: SAMPLE_KEY, filename: 'state.cbor' })
      );
      expect(mockCreateTree).toHaveBeenCalledWith({ manifest });

      // Index updated
      expect(persistence.writeBlob).toHaveBeenCalled();
      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      const entry = writtenJson.entries[SAMPLE_KEY];
      expect(entry.treeOid).toBe(treeOid);
      expect(entry.ceiling).toBe(42);
      expect(entry.frontierHash).toBe('abcdef0123456789');
      expect(entry.sizeBytes).toBe(SAMPLE_BUFFER.length);
      expect(entry.codec).toBe('cbor-v1');
      expect(entry.schemaVersion).toBe(1);
      expect(entry.createdAt).toBeDefined();
    });

    it('stores prototype-like keys as data properties', async () => {
      const protoKey = '__proto__';
      const treeOid = 'proto-tree-oid';

      mockStore.mockResolvedValue({ chunks: [] });
      mockCreateTree.mockResolvedValue(treeOid);
      persistence.readRef.mockResolvedValue(null);

      await adapter.set(protoKey, SAMPLE_BUFFER);

      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      expect(Object.hasOwn(writtenJson.entries, protoKey)).toBe(true);
      expect(writtenJson.entries[protoKey].treeOid).toBe(treeOid);
    });

    it('preserves existing entries in the index', async () => {
      const existingKey = 'v1:t10-existinghash';
      const existingEntry = {
        treeOid: 'existing-tree',
        createdAt: '2025-01-01T00:00:00.000Z',
        ceiling: 10,
        frontierHash: 'existinghash',
        sizeBytes: 100,
        codec: 'cbor-v1',
        schemaVersion: 1,
      };

      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [existingKey]: existingEntry })
      );
      mockStore.mockResolvedValue({ chunks: [] });
      mockCreateTree.mockResolvedValue('new-tree');

      await adapter.set(SAMPLE_KEY, SAMPLE_BUFFER);

      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      expect(writtenJson.entries[existingKey]).toEqual(existingEntry);
      expect(writtenJson.entries[SAMPLE_KEY]).toBeDefined();
    });

    it('passes encryptionKey to cas.store when configured', async () => {
      const encKey = new Uint8Array(32).fill(0xab);
      const encAdapter = new CasSeekCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
        encryptionKey: encKey,
      });

      mockStore.mockResolvedValue({ chunks: [] });
      mockCreateTree.mockResolvedValue('enc-tree');
      persistence.readRef.mockResolvedValue(null);

      await encAdapter.set(SAMPLE_KEY, SAMPLE_BUFFER);

      expect(mockStore).toHaveBeenCalledWith(
        expect.objectContaining({ encryptionKey: encKey })
      );
    });

    it('does not pass encryptionKey to cas.store when not configured', async () => {
      mockStore.mockResolvedValue({ chunks: [] });
      mockCreateTree.mockResolvedValue('plain-tree');
      persistence.readRef.mockResolvedValue(null);

      await adapter.set(SAMPLE_KEY, SAMPLE_BUFFER);

      const storeArg = (mockStore.mock.calls[0] as any[])[0];
      expect(storeArg.encryptionKey).toBeUndefined();
    });

    it('stores index metadata with an explicit content-encryption policy', async () => {
      const contentEncryption = CasContentEncryptionPolicy.fromResolvedVaultKey({
        encryptionKey: new Uint8Array(32).fill(7),
        scheme: 'framed',
        frameBytes: 65536,
        vault: {
          vaultSlug: 'graphs/test/seek-cache',
          keyId: 'seek-key-1',
          verification: 'verified',
          rotationEpoch: 1,
          encryptionCount: 1,
          encryptionCountLimit: 100,
          privacyMode: true,
        },
      });
      const encrypted = new CasSeekCacheAdapter({
        persistence,
        cas: new MockContentAddressableStore(),
        graphName: GRAPH_NAME,
        contentEncryption,
      });
      mockStore.mockResolvedValue({ chunks: [] });
      mockCreateTree.mockResolvedValue('encrypted-tree');
      persistence.readRef.mockResolvedValue(null);

      await encrypted.set(SAMPLE_KEY, SAMPLE_BUFFER, { indexTreeOid: 'logical-index-tree' });

      expect(mockStore).toHaveBeenCalledWith(expect.objectContaining({
        encryption: { scheme: 'framed', frameBytes: 65536 },
      }));
      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      expect(writtenJson.entries[SAMPLE_KEY].indexTreeOid).toBe('logical-index-tree');
    });
  });

  // -------------------------------------------------------------------------
  // has()
  // -------------------------------------------------------------------------

  describe('has()', () => {
    it('returns false when index is empty', async () => {
      persistence.readRef.mockResolvedValue(null);
      expect(await adapter.has(SAMPLE_KEY)).toBe(false);
    });

    it('returns true when key exists in the index', async () => {
      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid: 't1' } })
      );
      expect(await adapter.has(SAMPLE_KEY)).toBe(true);
    });

    it('returns false for a different key', async () => {
      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ 'v1:t99-otherhash': { treeOid: 't1' } })
      );
      expect(await adapter.has(SAMPLE_KEY)).toBe(false);
    });

    it('does not treat inherited object names as cache hits', async () => {
      persistence.readRef.mockResolvedValue(null);
      expect(await adapter.has('toString')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // keys()
  // -------------------------------------------------------------------------

  describe('keys()', () => {
    it('returns empty array when index is empty', async () => {
      persistence.readRef.mockResolvedValue(null);
      expect(await adapter.keys()).toEqual([]);
    });

    it('returns all keys from the index', async () => {
      const entries = {
        'v1:t1-aaa': { treeOid: 't1' },
        'v1:t2-bbb': { treeOid: 't2' },
        'v1:t3-ccc': { treeOid: 't3' },
      };
      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(indexBuffer(entries));

      const result = await adapter.keys();
      expect(result).toEqual(expect.arrayContaining(['v1:t1-aaa', 'v1:t2-bbb', 'v1:t3-ccc']));
      expect(result).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('returns true when key existed and was removed', async () => {
      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid: 't1' } })
      );

      const result = await adapter.delete(SAMPLE_KEY);
      expect(result).toBe(true);

      // Verify the written index no longer contains the key
      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      expect(writtenJson.entries[SAMPLE_KEY]).toBeUndefined();
    });

    it('returns false when key did not exist', async () => {
      persistence.readRef.mockResolvedValue(null);

      const result = await adapter.delete(SAMPLE_KEY);
      expect(result).toBe(false);
    });

    it('preserves other entries when deleting one', async () => {
      const otherKey = 'v1:t5-otherhash';
      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({
          [SAMPLE_KEY]: { treeOid: 't1' },
          [otherKey]: { treeOid: 't2' },
        })
      );

      await adapter.delete(SAMPLE_KEY);

      const writtenJson = JSON.parse(
        new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
      );
      expect(writtenJson.entries[otherKey]).toBeDefined();
      expect(writtenJson.entries[SAMPLE_KEY]).toBeUndefined();
    });

    it('returns false when deleting an inherited object name', async () => {
      persistence.readRef.mockResolvedValue(null);

      const result = await adapter.delete('toString');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  describe('clear()', () => {
    it('deletes the index ref', async () => {
      await adapter.clear();
      expect(persistence.deleteRef).toHaveBeenCalledWith(EXPECTED_REF);
    });

    it('swallows error when ref does not exist', async () => {
      persistence.deleteRef.mockRejectedValue(new Error('ref not found'));
      await expect(adapter.clear()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Retry logic (_mutateIndex)
  // -------------------------------------------------------------------------

  describe('retry logic (_mutateIndex)', () => {
    it('succeeds on first attempt when no error', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('oid');

      await adapter._mutateIndex((/** @type {any} */ idx) => idx);
      expect(persistence.writeBlob).toHaveBeenCalledTimes(1);
    });

    it('retries on transient write failure and succeeds', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob
        .mockRejectedValueOnce(new Error('lock contention'))
        .mockResolvedValueOnce('oid-ok');

      await adapter._mutateIndex((/** @type {any} */ idx) => idx);
      expect(persistence.writeBlob).toHaveBeenCalledTimes(2);
    });

    it('retries up to MAX_CAS_RETRIES (3) then throws', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockRejectedValue(new Error('persistent failure'));

      await expect(adapter._mutateIndex((/** @type {any} */ idx) => idx)).rejects.toThrow(
        /index update failed after retries/
      );
      expect(persistence.writeBlob).toHaveBeenCalledTimes(3);
    });

    it('re-reads the index on each retry attempt', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce('oid');

      await adapter._mutateIndex((/** @type {any} */ idx) => idx);
      // 3 attempts means 3 readRef calls (one per fresh read)
      expect(persistence.readRef).toHaveBeenCalledTimes(3);
    });

    it('returns the mutated index on success', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('oid');

      const result = await adapter._mutateIndex((/** @type {any} */ idx) => {
        idx.entries['test'] = { treeOid: 'x' };
        return idx;
      });
      expect(result.entries['test']).toEqual({ treeOid: 'x' });
    });
  });

  // -------------------------------------------------------------------------
  // _readIndex edge cases
  // -------------------------------------------------------------------------

  describe('_readIndex()', () => {
    it('returns empty index when ref does not exist', async () => {
      persistence.readRef.mockResolvedValue(null);
      const result = await adapter._readIndex();
      expect(result).toEqual({ schemaVersion: 1, entries: {} });
    });

    it('returns empty index when blob is invalid JSON', async () => {
      persistence.readRef.mockResolvedValue('oid');
      persistence.readBlob.mockResolvedValue(new TextEncoder().encode('not-json!!!'));
      const result = await adapter._readIndex();
      expect(result).toEqual({ schemaVersion: 1, entries: {} });
    });

    it('returns empty index when schemaVersion mismatches', async () => {
      persistence.readRef.mockResolvedValue('oid');
      persistence.readBlob.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({ schemaVersion: 999, entries: { x: {} } }))
      );
      const result = await adapter._readIndex();
      expect(result).toEqual({ schemaVersion: 1, entries: {} });
    });

    it('returns parsed index when valid', async () => {
      const entries = { 'v1:t1-abc': { treeOid: 't1' } };
      persistence.readRef.mockResolvedValue('oid');
      persistence.readBlob.mockResolvedValue(indexBuffer(entries));

      const result = await adapter._readIndex();
      expect(result).toEqual({ schemaVersion: 1, entries });
    });

    it('normalizes non-object index entries to an empty index', async () => {
      persistence.readRef.mockResolvedValue('oid');
      persistence.readBlob.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, entries: null }))
      );

      await expect(adapter._readIndex()).resolves.toEqual({ schemaVersion: 1, entries: {} });
    });

    it('returns empty index when readBlob throws', async () => {
      persistence.readRef.mockResolvedValue('oid');
      persistence.readBlob.mockRejectedValue(new Error('blob missing'));

      const result = await adapter._readIndex();
      expect(result).toEqual({ schemaVersion: 1, entries: {} });
    });
  });

  // -------------------------------------------------------------------------
  // _writeIndex
  // -------------------------------------------------------------------------

  describe('_writeIndex()', () => {
    it('serialises index to JSON, writes blob, and updates ref', async () => {
      const index = { schemaVersion: 1, entries: { k: { treeOid: 'x' } } };
      persistence.writeBlob.mockResolvedValue('written-oid');

      await adapter._writeIndex(index);

      expect(persistence.writeBlob).toHaveBeenCalledTimes(1);
      const buf = persistence.writeBlob.mock.calls[0][0];
      expect(JSON.parse(new TextDecoder().decode(buf))).toEqual(index);
      expect(persistence.updateRef).toHaveBeenCalledWith(EXPECTED_REF, 'written-oid');
    });
  });
});
