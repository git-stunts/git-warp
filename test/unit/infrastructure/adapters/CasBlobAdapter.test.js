import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @git-stunts/git-cas (dynamic import used by _initCas)
const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

/** Captures constructor args for assertion. @type {any} */
let lastConstructorArgs = {};

class MockContentAddressableStore {
  constructor(/** @type {any} */ opts) {
    lastConstructorArgs = opts;
    this.readManifest = mockReadManifest;
    this.restore = mockRestore;
    this.store = mockStore;
    this.createTree = mockCreateTree;
  }
}

class MockCborCodec {}

vi.mock('@git-stunts/git-cas', () => ({
  default: MockContentAddressableStore,
  CborCodec: MockCborCodec,
}));

// Import after mock setup
const { default: CasBlobAdapter } = await import(
  '../../../../src/infrastructure/adapters/CasBlobAdapter.js'
);
const { default: BlobStoragePort } = await import(
  '../../../../src/ports/BlobStoragePort.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePersistence() {
  return {
    readBlob: vi.fn().mockResolvedValue(Buffer.from('raw-blob-data')),
    writeBlob: vi.fn().mockResolvedValue('blob-oid-1'),
  };
}

function makePlumbing() {
  return {};
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CasBlobAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastConstructorArgs = {};
  });

  it('extends BlobStoragePort', () => {
    const adapter = new CasBlobAdapter({
      plumbing: makePlumbing(),
      persistence: makePersistence(),
    });
    expect(adapter).toBeInstanceOf(BlobStoragePort);
  });

  describe('store()', () => {
    it('stores string content via CAS and returns tree OID', async () => {
      const manifest = { chunks: ['chunk1'] };
      mockStore.mockResolvedValue(manifest);
      mockCreateTree.mockResolvedValue('tree-oid-abc');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      const oid = await adapter.store('hello world', { slug: 'test/node1' });

      expect(oid).toBe('tree-oid-abc');
      expect(mockStore).toHaveBeenCalledOnce();
      expect(mockCreateTree).toHaveBeenCalledWith({ manifest });
    });

    it('stores Uint8Array content via CAS', async () => {
      const manifest = { chunks: ['chunk1'] };
      mockStore.mockResolvedValue(manifest);
      mockCreateTree.mockResolvedValue('tree-oid-123');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      const buf = new Uint8Array([1, 2, 3]);
      const oid = await adapter.store(buf);

      expect(oid).toBe('tree-oid-123');
      expect(mockStore).toHaveBeenCalledOnce();
    });

    it('generates a default slug when none provided', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      await adapter.store('data');

      const storeCall = mockStore.mock.calls[0][0];
      expect(storeCall.slug).toMatch(/^blob-/);
    });

    it('passes encryptionKey to CAS store when configured', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const encKey = Buffer.from('0'.repeat(64), 'hex');
      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      await adapter.store('secret data');

      const storeCall = mockStore.mock.calls[0][0];
      expect(storeCall.encryptionKey).toBe(encKey);
    });

    it('does not include encryptionKey when not configured', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      await adapter.store('plain data');

      const storeCall = mockStore.mock.calls[0][0];
      expect(storeCall.encryptionKey).toBeUndefined();
    });
  });

  describe('retrieve()', () => {
    it('retrieves content via CAS when manifest exists', async () => {
      const manifest = { chunks: ['chunk1'] };
      const contentBuf = Buffer.from('restored content');
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: contentBuf });

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      const result = await adapter.retrieve('tree-oid-abc');

      expect(result).toBe(contentBuf);
      expect(mockReadManifest).toHaveBeenCalledWith({ treeOid: 'tree-oid-abc' });
      expect(mockRestore).toHaveBeenCalledWith({ manifest });
    });

    it('passes encryptionKey to CAS restore when configured', async () => {
      const manifest = { chunks: ['chunk1'] };
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: Buffer.from('decrypted') });

      const encKey = Buffer.from('0'.repeat(64), 'hex');
      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      await adapter.retrieve('tree-oid');

      expect(mockRestore).toHaveBeenCalledWith({ manifest, encryptionKey: encKey });
    });

    it('falls back to raw Git blob when CAS readManifest fails', async () => {
      const rawBuf = Buffer.from('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockRejectedValue(new Error('not a CAS tree'));

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('raw-blob-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('falls back to raw Git blob when CAS restore fails', async () => {
      const rawBuf = Buffer.from('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestore.mockRejectedValue(new Error('corrupt manifest'));

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('bad-tree-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('bad-tree-oid');
    });
  });

  describe('CAS initialization', () => {
    it('lazily initializes CAS on first store() call', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      // CAS not yet initialized
      expect(lastConstructorArgs).toEqual({});

      await adapter.store('data');

      // CAS initialized with correct options
      expect(lastConstructorArgs.chunking).toEqual({ strategy: 'cdc' });
    });

    it('reuses CAS instance across multiple calls', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      await adapter.store('data1');
      const firstArgs = { ...lastConstructorArgs };
      await adapter.store('data2');

      // Same instance (constructor called only once)
      expect(lastConstructorArgs).toEqual(firstArgs);
    });

    it('configures observability bridge when logger is provided', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        logger: makeLogger(),
      });

      await adapter.store('data');

      expect(lastConstructorArgs.observability).toBeDefined();
    });

    it('does not configure observability when no logger', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      await adapter.store('data');

      expect(lastConstructorArgs.observability).toBeUndefined();
    });
  });
});
