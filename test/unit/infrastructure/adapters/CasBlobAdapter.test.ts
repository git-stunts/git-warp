import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @git-stunts/git-cas (dynamic import used by _initCas)
const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockRestoreStream = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

/** Captures constructor args for assertion. @type {any} */
let lastConstructorArgs = {};

class MockContentAddressableStore {
  readManifest: typeof mockReadManifest;
  restore: typeof mockRestore;
  restoreStream: typeof mockRestoreStream;
  store: typeof mockStore;
  createTree: typeof mockCreateTree;
  constructor(/** @type {any} */ opts) {
    lastConstructorArgs = opts;
    this.readManifest = mockReadManifest;
    this.restore = mockRestore;
    this.restoreStream = mockRestoreStream;
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
  '../../../../src/infrastructure/adapters/CasBlobAdapter.ts'
);
const { default: BlobStoragePort } = await import(
  '../../../../src/ports/BlobStoragePort.ts'
);
const { default: PersistenceError } = await import(
  '../../../../src/domain/errors/PersistenceError.ts'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePersistence() {
  return {
    readBlob: vi.fn().mockResolvedValue(new TextEncoder().encode('raw-blob-data')),
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

      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.slug).toMatch(/^blob-/);
    });

    it('passes encryptionKey to CAS store when configured', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const encKey = new Uint8Array(32);
      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      await adapter.store('secret data');

      const storeCall = (mockStore.mock.calls[0] as any)[0];
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

      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.encryptionKey).toBeUndefined();
    });
  });

  describe('retrieve()', () => {
    it('retrieves content via CAS when manifest exists', async () => {
      const manifest = { chunks: ['chunk1'] };
      const contentBuf = new TextEncoder().encode('restored content');
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
      mockRestore.mockResolvedValue({ buffer: new TextEncoder().encode('decrypted') });

      const encKey = new Uint8Array(32);
      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      await adapter.retrieve('tree-oid');

      expect(mockRestore).toHaveBeenCalledWith({ manifest, encryptionKey: encKey });
    });

    it('falls back to raw Git blob when CAS readManifest throws MANIFEST_NOT_FOUND', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('raw-blob-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('falls back to raw Git blob when CAS readManifest throws GIT_ERROR', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      const casErr = Object.assign(new Error('Failed to read tree'), { code: 'GIT_ERROR' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('raw-blob-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('falls back to raw Git blob on message-based legacy errors (no .code)', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestore.mockRejectedValue(new Error('not a tree object'));

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('bad-tree-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('bad-tree-oid');
    });

    it('falls back to raw Git blob on "bad object" message (no .code)', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockRejectedValue(new Error('bad object abc123'));

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('bad-obj-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('bad-obj-oid');
    });

    it('falls back to raw Git blob on "does not exist" message (no .code)', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockRejectedValue(new Error('path does not exist'));

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const result = await adapter.retrieve('missing-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('missing-oid');
    });

    it('throws E_MISSING_OBJECT when legacy fallback readBlob returns null', async () => {
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(null);
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      await expect(adapter.retrieve('ghost-oid'))
        .rejects.toMatchObject({
          code: PersistenceError.E_MISSING_OBJECT,
          message: 'Missing Git object: ghost-oid',
        });
      expect(persistence.readBlob).toHaveBeenCalledWith('ghost-oid');
    });

    it('rethrows non-legacy CAS errors', async () => {
      const persistence = makePersistence();
      const casErr = Object.assign(new Error('decryption failed'), { code: 'INTEGRITY_ERROR' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      await expect(adapter.retrieve('enc-oid')).rejects.toThrow('decryption failed');
      expect(persistence.readBlob).not.toHaveBeenCalled();
    });
  });

  describe('storeStream()', () => {
    it('stores content from an async iterable via CAS and returns tree OID', async () => {
      const manifest = { chunks: ['chunk1', 'chunk2'] };
      mockStore.mockResolvedValue(manifest);
      mockCreateTree.mockResolvedValue('tree-oid-stream');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      async function* source() {
        yield new TextEncoder().encode('hello ');
        yield new TextEncoder().encode('world');
      }

      const oid = await adapter.storeStream(source(), { slug: 'test/streamed' });

      expect(oid).toBe('tree-oid-stream');
      expect(mockStore).toHaveBeenCalledOnce();
      expect(mockCreateTree).toHaveBeenCalledWith({ manifest });
      // The source passed to CAS store should be the async iterable (or wrapped)
      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.slug).toBe('test/streamed');
    });

    it('passes encryptionKey to CAS store when configured', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const encKey = new Uint8Array(32);
      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      async function* source() {
        yield new Uint8Array([1]);
      }

      await adapter.storeStream(source());

      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.encryptionKey).toBe(encKey);
    });
  });

  describe('retrieveStream()', () => {
    it('retrieves content as an async iterable via CAS restoreStream', async () => {
      const manifest = { chunks: ['chunk1'] };
      const chunk1 = new TextEncoder().encode('hello ');
      const chunk2 = new TextEncoder().encode('world');

      mockReadManifest.mockResolvedValue(manifest);
      mockRestoreStream.mockReturnValue((async function* () {
        yield chunk1;
        yield chunk2;
      })());

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      const stream = adapter.retrieveStream('tree-oid-abc');
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      const result = new Uint8Array(chunks.reduce((n, c) => n + (c as any).byteLength, 0));
      let offset = 0;
      for (const c of chunks) {
        result.set(c, offset);
        offset += (c as any).byteLength;
      }
      expect(new TextDecoder().decode(result)).toBe('hello world');
    });

    it('falls back to single-chunk yield for legacy raw Git blobs', async () => {
      const rawBuf = new TextEncoder().encode('legacy blob content');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const stream = adapter.retrieveStream('raw-blob-oid');
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('passes encryptionKey to CAS restoreStream when configured', async () => {
      const manifest = { chunks: ['chunk1'] };
      mockReadManifest.mockResolvedValue(manifest);
      mockRestoreStream.mockReturnValue((async function* () {
        yield new Uint8Array([1]);
      })());

      const encKey = new Uint8Array(32);
      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      const stream = adapter.retrieveStream('tree-oid');
      for await (const _ of stream) { /* drain */ }

      expect(mockRestoreStream).toHaveBeenCalledWith(
        expect.objectContaining({ manifest, encryptionKey: encKey }),
      );
    });

    it('throws E_MISSING_OBJECT when legacy fallback readBlob returns null', async () => {
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(null);
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence,
      });

      const stream = adapter.retrieveStream('ghost-oid');
      await expect(async () => {
        for await (const _ of stream) { /* drain */ }
      }).rejects.toMatchObject({
        code: PersistenceError.E_MISSING_OBJECT,
      });
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
      expect((lastConstructorArgs as any).chunking).toEqual({ strategy: 'cdc' });
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

      expect((lastConstructorArgs as any).observability).toBeDefined();
    });

    it('does not configure observability when no logger', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        plumbing: makePlumbing(),
        persistence: makePersistence(),
      });

      await adapter.store('data');

      expect((lastConstructorArgs as any).observability).toBeUndefined();
    });
  });
});
