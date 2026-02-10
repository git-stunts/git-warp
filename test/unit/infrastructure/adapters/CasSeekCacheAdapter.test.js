import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @git-stunts/git-cas (dynamic import used by _initCas)
const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();
const mockCreateCbor = vi.fn(() => ({
  readManifest: mockReadManifest,
  restore: mockRestore,
  store: mockStore,
  createTree: mockCreateTree,
}));

vi.mock('@git-stunts/git-cas', () => ({
  default: {
    createCbor: mockCreateCbor,
  },
}));

// Import after mock setup
const { default: CasSeekCacheAdapter } = await import(
  '../../../../src/infrastructure/adapters/CasSeekCacheAdapter.js'
);
const { default: SeekCachePort } = await import(
  '../../../../src/ports/SeekCachePort.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal mock persistence port with vi.fn() stubs. */
function makePersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    readBlob: vi.fn().mockResolvedValue(Buffer.from('{}', 'utf8')),
    writeBlob: vi.fn().mockResolvedValue('blob-oid-1'),
    updateRef: vi.fn().mockResolvedValue(undefined),
    deleteRef: vi.fn().mockResolvedValue(undefined),
  };
}

function makePlumbing() {
  return {};
}

/** Builds a JSON index buffer for readBlob to return. */
function indexBuffer(entries = {}) {
  return Buffer.from(JSON.stringify({ schemaVersion: 1, entries }), 'utf8');
}

const GRAPH_NAME = 'test-graph';
const EXPECTED_REF = `refs/warp/${GRAPH_NAME}/seek-cache`;
const SAMPLE_KEY = 'v1:t42-abcdef0123456789';
const SAMPLE_BUFFER = Buffer.from('serialized-state-data');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CasSeekCacheAdapter', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let plumbing;
  /** @type {any} */
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = makePersistence();
    plumbing = makePlumbing();
    adapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
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
      expect(adapter._maxEntries).toBe(200);
    });

    it('respects custom maxEntries', () => {
      const custom = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 50,
      });
      expect(custom._maxEntries).toBe(50);
    });

    it('builds the correct ref path', () => {
      expect(adapter._ref).toBe(EXPECTED_REF);
    });

    it('initialises _casPromise to null', () => {
      expect(adapter._casPromise).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // _getCas — lazy CAS initialization
  // -------------------------------------------------------------------------

  describe('_getCas()', () => {
    it('creates CAS instance on first call', async () => {
      await adapter._getCas();
      expect(mockCreateCbor).toHaveBeenCalledWith({ plumbing });
    });

    it('caches the CAS promise across multiple calls', async () => {
      await adapter._getCas();
      await adapter._getCas();
      expect(mockCreateCbor).toHaveBeenCalledTimes(1);
    });

    it('resets cached promise on init error so next call retries', async () => {
      mockCreateCbor.mockImplementationOnce(() => {
        throw new Error('init failure');
      });

      await expect(adapter._getCas()).rejects.toThrow('init failure');
      expect(adapter._casPromise).toBeNull();

      // Second call should retry and succeed
      mockCreateCbor.mockReturnValueOnce({
        readManifest: mockReadManifest,
        restore: mockRestore,
        store: mockStore,
        createTree: mockCreateTree,
      });
      await expect(adapter._getCas()).resolves.toBeDefined();
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
      const stateBuffer = Buffer.from('restored-state');

      persistence.readRef.mockResolvedValue('index-oid');
      persistence.readBlob.mockResolvedValue(
        indexBuffer({ [SAMPLE_KEY]: { treeOid, createdAt: new Date().toISOString() } })
      );
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: stateBuffer });

      const result = await adapter.get(SAMPLE_KEY);

      expect(result).toBe(stateBuffer);
      expect(mockReadManifest).toHaveBeenCalledWith({ treeOid });
      expect(mockRestore).toHaveBeenCalledWith({ manifest });
    });

    it('updates lastAccessedAt on successful cache hit', async () => {
      const treeOid = 'tree-oid-abc';
      const manifest = { chunks: ['c1'] };
      const stateBuffer = Buffer.from('restored-state');
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
        persistence.writeBlob.mock.calls[0][0].toString('utf8')
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
        persistence.writeBlob.mock.calls[0][0].toString('utf8')
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
        persistence.writeBlob.mock.calls[0][0].toString('utf8')
      );
      expect(writtenJson.entries[existingKey]).toEqual(existingEntry);
      expect(writtenJson.entries[SAMPLE_KEY]).toBeDefined();
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
        persistence.writeBlob.mock.calls[0][0].toString('utf8')
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
        persistence.writeBlob.mock.calls[0][0].toString('utf8')
      );
      expect(writtenJson.entries[otherKey]).toBeDefined();
      expect(writtenJson.entries[SAMPLE_KEY]).toBeUndefined();
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
  // LRU eviction
  // -------------------------------------------------------------------------

  describe('LRU eviction (_enforceMaxEntries)', () => {
    it('does not evict when under maxEntries', () => {
      const smallAdapter = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 5,
      });

      const index = {
        schemaVersion: 1,
        entries: {
          'v1:t1-a': { createdAt: '2025-01-01T00:00:00Z' },
          'v1:t2-b': { createdAt: '2025-01-02T00:00:00Z' },
        },
      };

      const result = /** @type {any} */ (smallAdapter)._enforceMaxEntries(index);
      expect(Object.keys(result.entries)).toHaveLength(2);
    });

    it('evicts oldest entries when exceeding maxEntries', () => {
      const smallAdapter = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 2,
      });

      const index = {
        schemaVersion: 1,
        entries: {
          'v1:t1-oldest': { createdAt: '2025-01-01T00:00:00Z' },
          'v1:t2-middle': { createdAt: '2025-01-02T00:00:00Z' },
          'v1:t3-newest': { createdAt: '2025-01-03T00:00:00Z' },
          'v1:t4-latest': { createdAt: '2025-01-04T00:00:00Z' },
        },
      };

      const result = /** @type {any} */ (smallAdapter)._enforceMaxEntries(index);
      const remaining = Object.keys(result.entries);
      expect(remaining).toHaveLength(2);
      expect(remaining).toContain('v1:t3-newest');
      expect(remaining).toContain('v1:t4-latest');
      expect(remaining).not.toContain('v1:t1-oldest');
      expect(remaining).not.toContain('v1:t2-middle');
    });

    it('evicts exactly the overshoot count', () => {
      const smallAdapter = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 3,
      });

      const index = {
        schemaVersion: 1,
        entries: {
          'v1:t1-a': { createdAt: '2025-01-01T00:00:00Z' },
          'v1:t2-b': { createdAt: '2025-01-02T00:00:00Z' },
          'v1:t3-c': { createdAt: '2025-01-03T00:00:00Z' },
          'v1:t4-d': { createdAt: '2025-01-04T00:00:00Z' },
          'v1:t5-e': { createdAt: '2025-01-05T00:00:00Z' },
        },
      };

      const result = /** @type {any} */ (smallAdapter)._enforceMaxEntries(index);
      expect(Object.keys(result.entries)).toHaveLength(3);
    });

    it('prefers lastAccessedAt over createdAt for LRU ordering', () => {
      const smallAdapter = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 2,
      });

      const index = {
        schemaVersion: 1,
        entries: {
          // Oldest by creation but recently accessed
          'v1:t1-old-but-used': {
            createdAt: '2025-01-01T00:00:00Z',
            lastAccessedAt: '2025-01-10T00:00:00Z',
          },
          // Newer by creation but never accessed since
          'v1:t2-new-unused': {
            createdAt: '2025-01-05T00:00:00Z',
          },
          // Newest by creation, not accessed
          'v1:t3-newest': {
            createdAt: '2025-01-06T00:00:00Z',
          },
        },
      };

      const result = /** @type {any} */ (smallAdapter)._enforceMaxEntries(index);
      const remaining = Object.keys(result.entries);
      expect(remaining).toHaveLength(2);
      // The old-but-recently-used entry should survive (LRU)
      expect(remaining).toContain('v1:t1-old-but-used');
      expect(remaining).toContain('v1:t3-newest');
      expect(remaining).not.toContain('v1:t2-new-unused');
    });

    it('handles entries with missing createdAt gracefully', () => {
      const smallAdapter = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 1,
      });

      const index = {
        schemaVersion: 1,
        entries: {
          'v1:t1-nodate': {},
          'v1:t2-hasdate': { createdAt: '2025-06-01T00:00:00Z' },
        },
      };

      const result = /** @type {any} */ (smallAdapter)._enforceMaxEntries(index);
      expect(Object.keys(result.entries)).toHaveLength(1);
    });

    it('evicts via set() when maxEntries exceeded', async () => {
      const tinyAdapter = new CasSeekCacheAdapter({
        persistence,
        plumbing,
        graphName: GRAPH_NAME,
        maxEntries: 1,
      });

      const existing = {
        'v1:t1-old': {
          treeOid: 'old-tree',
          createdAt: '2025-01-01T00:00:00Z',
          ceiling: 1,
          frontierHash: 'old',
          sizeBytes: 10,
          codec: 'cbor-v1',
          schemaVersion: 1,
        },
      };

      persistence.readRef.mockResolvedValue('idx-oid');
      persistence.readBlob.mockResolvedValue(indexBuffer(existing));
      mockStore.mockResolvedValue({ chunks: [] });
      mockCreateTree.mockResolvedValue('new-tree');

      await tinyAdapter.set('v1:t99-newhash', Buffer.from('new'));

      const writtenJson = JSON.parse(
        persistence.writeBlob.mock.calls[0][0].toString('utf8')
      );
      expect(Object.keys(writtenJson.entries)).toHaveLength(1);
      expect(writtenJson.entries['v1:t99-newhash']).toBeDefined();
      expect(writtenJson.entries['v1:t1-old']).toBeUndefined();
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
      persistence.readBlob.mockResolvedValue(Buffer.from('not-json!!!'));
      const result = await adapter._readIndex();
      expect(result).toEqual({ schemaVersion: 1, entries: {} });
    });

    it('returns empty index when schemaVersion mismatches', async () => {
      persistence.readRef.mockResolvedValue('oid');
      persistence.readBlob.mockResolvedValue(
        Buffer.from(JSON.stringify({ schemaVersion: 999, entries: { x: {} } }))
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
      expect(JSON.parse(buf.toString('utf8'))).toEqual(index);
      expect(persistence.updateRef).toHaveBeenCalledWith(EXPECTED_REF, 'written-oid');
    });
  });
});
