import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockRestoreStream = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

class MockContentAddressableStore {
  readManifest: typeof mockReadManifest;
  restore: typeof mockRestore;
  restoreStream: typeof mockRestoreStream;
  store: typeof mockStore;
  createTree: typeof mockCreateTree;
  constructor() {
    this.readManifest = mockReadManifest;
    this.restore = mockRestore;
    this.restoreStream = mockRestoreStream;
    this.store = mockStore;
    this.createTree = mockCreateTree;
  }
}

const { default: CasBlobAdapter } = await import(
  '../../../../src/infrastructure/adapters/CasBlobAdapter.ts'
);
const { default: BlobStoragePort } = await import(
  '../../../../src/ports/BlobStoragePort.ts'
);
const { default: PersistenceError } = await import(
  '../../../../src/domain/errors/PersistenceError.ts'
);
const { default: CasContentEncryptionPolicy } = await import(
  '../../../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts'
);
const { V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY } = await import(
  '../../../../scripts/migrations/v17.0.0/SubstrateMigrationCompatibilityPolicy.ts'
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CasBlobAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extends BlobStoragePort', () => {
    const adapter = new CasBlobAdapter({
      cas: new MockContentAddressableStore(),
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
        cas: new MockContentAddressableStore(),
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
        cas: new MockContentAddressableStore(),
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
        cas: new MockContentAddressableStore(),
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
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      await adapter.store('secret data');

      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.encryptionKey).toEqual(encKey);
      expect(storeCall.encryptionKey).not.toBe(encKey);
    });

    it('passes vault-backed encryption policy to CAS store when configured', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const encKey = new Uint8Array(32).fill(9);
      const contentEncryption = CasContentEncryptionPolicy.fromResolvedVaultKey({
        encryptionKey: encKey,
        scheme: 'framed',
        frameBytes: 65536,
        vault: {
          vaultSlug: 'graphs/team/content',
          keyId: 'content-key-1',
          verification: 'verified',
          rotationEpoch: 1,
          encryptionCount: 1,
          encryptionCountLimit: 100,
          privacyMode: true,
        },
      });
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
        contentEncryption,
      });

      await adapter.store('secret data');

      expect(mockStore).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptionKey: encKey,
          encryption: { scheme: 'framed', frameBytes: 65536 },
        }),
      );
      expect(mockStore.mock.calls[0]?.[0].encryptionKey).not.toBe(encKey);
    });

    it('does not include encryptionKey when not configured', async () => {
      mockStore.mockResolvedValue({});
      mockCreateTree.mockResolvedValue('tree-oid');

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });

      await adapter.store('plain data');

      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.encryptionKey).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('checks the injected CAS manifest store', async () => {
      mockReadManifest.mockResolvedValue({ chunks: [] });
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });

      await expect(adapter.has('tree-oid')).resolves.toBe(true);
      expect(mockReadManifest).toHaveBeenCalledWith({ treeOid: 'tree-oid' });
    });

    it('returns false when the injected CAS rejects the object', async () => {
      mockReadManifest.mockRejectedValue(new Error('missing manifest'));
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });

      await expect(adapter.has('missing-oid')).resolves.toBe(false);
    });
  });

  describe('retrieve()', () => {
    it('retrieves content via CAS when manifest exists', async () => {
      const manifest = { chunks: ['chunk1'] };
      const contentBuf = new TextEncoder().encode('restored content');
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: contentBuf });

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });

      const result = await adapter.retrieve('tree-oid-abc');

      expect(result).toBe(contentBuf);
      expect(mockReadManifest).toHaveBeenCalledWith({ treeOid: 'tree-oid-abc' });
      expect(mockRestore).toHaveBeenCalledWith({ manifest });
    });

    it('normalizes Buffer subclasses returned by git-cas', async () => {
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestore.mockResolvedValue({ buffer: Buffer.from('restored content') });
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });

      const result = await adapter.retrieve('tree-oid');

      expect(result.constructor).toBe(Uint8Array);
      expect(new TextDecoder().decode(result)).toBe('restored content');
    });

    it('passes encryptionKey to CAS restore when configured', async () => {
      const manifest = { chunks: ['chunk1'] };
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockResolvedValue({ buffer: new TextEncoder().encode('decrypted') });

      const encKey = new Uint8Array(32);
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      await adapter.retrieve('tree-oid');

      expect(mockRestore).toHaveBeenCalledWith({ manifest, encryptionKey: encKey });
    });

    it('probes but rejects raw Git blob fallback by default', async () => {
      const persistence = makePersistence();
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      await expect(adapter.retrieve('raw-blob-oid')).rejects.toMatchObject({
        code: 'E_LEGACY_SUBSTRATE_DISABLED',
      });
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('returns E_MISSING_OBJECT for missing content OIDs by default', async () => {
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(null);
      mockReadManifest.mockRejectedValue(new Error('not a tree object'));

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      await expect(adapter.retrieve('ghost-oid'))
        .rejects.toMatchObject({
          code: PersistenceError.E_MISSING_OBJECT,
          message: 'Missing Git object: ghost-oid',
        });
      expect(persistence.readBlob).toHaveBeenCalledWith('ghost-oid');
    });

    it('falls back to raw Git blob when CAS readManifest throws MANIFEST_NOT_FOUND under migration policy', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
      });

      const result = await adapter.retrieve('raw-blob-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('falls back to raw Git blob when CAS readManifest throws GIT_ERROR under migration policy', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      const casErr = Object.assign(new Error('Failed to read tree'), { code: 'GIT_ERROR' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
      });

      const result = await adapter.retrieve('raw-blob-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('raw-blob-oid');
    });

    it('falls back to raw Git blob on message-based legacy errors under migration policy', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestore.mockRejectedValue(new Error('not a tree object'));

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
      });

      const result = await adapter.retrieve('bad-tree-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('bad-tree-oid');
    });

    it('falls back to raw Git blob on "bad object" message under migration policy', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockRejectedValue(new Error('bad object abc123'));

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
      });

      const result = await adapter.retrieve('bad-obj-oid');

      expect(result).toBe(rawBuf);
      expect(persistence.readBlob).toHaveBeenCalledWith('bad-obj-oid');
    });

    it('falls back to raw Git blob on "does not exist" message under migration policy', async () => {
      const rawBuf = new TextEncoder().encode('legacy raw blob');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      mockReadManifest.mockRejectedValue(new Error('path does not exist'));

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
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
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
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
        cas: new MockContentAddressableStore(),
        persistence,
      });

      await expect(adapter.retrieve('enc-oid')).rejects.toThrow('decryption failed');
      expect(persistence.readBlob).not.toHaveBeenCalled();
    });

    it('surfaces legacy git-cas encryption scheme errors with migration guidance', async () => {
      const persistence = makePersistence();
      const casErr = Object.assign(new Error('Legacy encryption scheme "whole-v1" is no longer supported'), {
        code: 'LEGACY_SCHEME',
      });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      await expect(adapter.retrieve('enc-legacy-oid')).rejects.toMatchObject({
        code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
      });
      expect(persistence.readBlob).not.toHaveBeenCalled();
    });

    it('surfaces wrong vault passphrase errors without deleting or falling back', async () => {
      const manifest = { chunks: ['chunk1'] };
      const persistence = makePersistence();
      const casErr = Object.assign(new Error('Vault passphrase verification failed'), {
        code: 'INTEGRITY_ERROR',
      });
      mockReadManifest.mockResolvedValue(manifest);
      mockRestore.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      await expect(adapter.retrieve('enc-oid')).rejects.toMatchObject({
        code: 'E_CAS_VAULT_PASSPHRASE_FAILED',
      });
      expect(persistence.readBlob).not.toHaveBeenCalled();
    });
  });

  describe('storeStream()', () => {
    it('stores content from an async iterable via CAS and returns tree OID', async () => {
      const manifest = { chunks: ['chunk1', 'chunk2'] };
      mockStore.mockResolvedValue(manifest);
      mockCreateTree.mockResolvedValue('tree-oid-stream');

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
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
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
        encryptionKey: encKey,
      });

      async function* source() {
        yield new Uint8Array([1]);
      }

      await adapter.storeStream(source());

      const storeCall = (mockStore.mock.calls[0] as any)[0];
      expect(storeCall.encryptionKey).toEqual(encKey);
      expect(storeCall.encryptionKey).not.toBe(encKey);
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
        cas: new MockContentAddressableStore(),
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

    it('can be cancelled before the CAS stream is opened', async () => {
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });
      const iterator = adapter.retrieveStream('tree-oid')[Symbol.asyncIterator]();

      await expect(iterator.return?.()).resolves.toMatchObject({ done: true });
      expect(mockReadManifest).not.toHaveBeenCalled();
    });

    it('delegates cancellation to an opened CAS stream', async () => {
      let cancelled = false;
      mockReadManifest.mockResolvedValue({ chunks: [] });
      mockRestoreStream.mockReturnValue((async function* () {
        try {
          yield new Uint8Array([1]);
        } finally {
          cancelled = true;
        }
      })());
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence: makePersistence(),
      });
      const iterator = adapter.retrieveStream('tree-oid')[Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toMatchObject({ done: false });
      await expect(iterator.return?.()).resolves.toMatchObject({ done: true });
      expect(cancelled).toBe(true);
    });

    it('maps git-cas encryption failures without probing legacy blobs', async () => {
      const persistence = makePersistence();
      mockReadManifest.mockRejectedValue(Object.assign(
        new Error('Legacy encryption scheme is unsupported'),
        { code: 'LEGACY_SCHEME' },
      ));
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      const iterator = adapter.retrieveStream('encrypted-oid')[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toMatchObject({
        code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
      });
      expect(persistence.readBlob).not.toHaveBeenCalled();
    });

    it('rethrows non-legacy CAS stream failures', async () => {
      const persistence = makePersistence();
      const failure = new Error('CAS unavailable');
      mockReadManifest.mockRejectedValue(failure);
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      const iterator = adapter.retrieveStream('tree-oid')[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toBe(failure);
      expect(persistence.readBlob).not.toHaveBeenCalled();
    });

    it('maps a legacy probe missing-object failure to E_MISSING_OBJECT', async () => {
      const persistence = makePersistence();
      persistence.readBlob.mockRejectedValue(new PersistenceError(
        'missing',
        PersistenceError.E_MISSING_OBJECT,
      ));
      mockReadManifest.mockRejectedValue(Object.assign(
        new Error('No manifest entry'),
        { code: 'MANIFEST_NOT_FOUND' },
      ));
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      const iterator = adapter.retrieveStream('missing-oid')[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toMatchObject({
        code: PersistenceError.E_MISSING_OBJECT,
      });
    });

    it('preserves unexpected legacy probe failures', async () => {
      const persistence = makePersistence();
      const failure = new Error('Git transport failed');
      persistence.readBlob.mockRejectedValue(failure);
      mockReadManifest.mockRejectedValue(Object.assign(
        new Error('No manifest entry'),
        { code: 'MANIFEST_NOT_FOUND' },
      ));
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
      });

      const iterator = adapter.retrieveStream('legacy-oid')[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toBe(failure);
    });

    it('falls back to single-chunk yield for legacy raw Git blobs under migration policy', async () => {
      const rawBuf = new TextEncoder().encode('legacy blob content');
      const persistence = makePersistence();
      persistence.readBlob.mockResolvedValue(rawBuf);
      const casErr = Object.assign(new Error('No manifest entry'), { code: 'MANIFEST_NOT_FOUND' });
      mockReadManifest.mockRejectedValue(casErr);

      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
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

    it('closes a legacy single-chunk stream deterministically', async () => {
      const persistence = makePersistence();
      mockReadManifest.mockRejectedValue(Object.assign(
        new Error('No manifest entry'),
        { code: 'MANIFEST_NOT_FOUND' },
      ));
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
      });
      const iterator = adapter.retrieveStream('raw-blob-oid')[Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toMatchObject({ done: false });
      await expect(iterator.return?.()).resolves.toMatchObject({ done: true });
      await expect(iterator.next()).resolves.toMatchObject({ done: true });
    });

    it('passes encryptionKey to CAS restoreStream when configured', async () => {
      const manifest = { chunks: ['chunk1'] };
      mockReadManifest.mockResolvedValue(manifest);
      mockRestoreStream.mockReturnValue((async function* () {
        yield new Uint8Array([1]);
      })());

      const encKey = new Uint8Array(32);
      const adapter = new CasBlobAdapter({
        cas: new MockContentAddressableStore(),
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
        cas: new MockContentAddressableStore(),
        persistence,
        compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
      });

      const stream = adapter.retrieveStream('ghost-oid');
      await expect(async () => {
        for await (const _ of stream) { /* drain */ }
      }).rejects.toMatchObject({
        code: PersistenceError.E_MISSING_OBJECT,
      });
    });
  });

});
