import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import TrustError from '../../../../src/domain/errors/TrustError.ts';

// Mock @git-stunts/git-cas
const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

class MockContentAddressableStore {
  readManifest = mockReadManifest;
  restore = mockRestore;
  store = mockStore;
  createTree = mockCreateTree;
  constructor(opts: any) {}
}

vi.mock('@git-stunts/git-cas', () => ({
  default: MockContentAddressableStore,
  CborCodec: CborCodec,
}));

// Import after mock setup
const { default: GitTrustChainAdapter } = await import(
  '../../../../src/infrastructure/adapters/GitTrustChainAdapter.ts'
);
const { default: TrustChainPort } = await import(
  '../../../../src/ports/TrustChainPort.ts'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlumbing() {
  return {
    execute: vi.fn(),
  };
}

function makeCrypto() {
  return {
    hash: vi.fn().mockResolvedValue('expected-record-id-hash'),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    generateKey: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
  };
}

const GRAPH_NAME = 'test-graph';
const EXPECTED_TIP_SHA = 'a'.repeat(40);
const PARENT_SHA = 'b'.repeat(40);

const SAMPLE_RECORD_OBJ = {
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: 'expected-record-id-hash',
  issuerKeyId: 'key-1',
  issuedAt: new Date().toISOString(),
  prev: null,
  subject: { keyId: 'key-subject-1', publicKey: 'pubkey-1' },
  meta: { note: 'test' },
  signature: { alg: 'ed25519', sig: 'sig-1' },
};

const codec = new CborCodec();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitTrustChainAdapter', () => {
  let plumbing: ReturnType<typeof makePlumbing>;
  let crypto: ReturnType<typeof makeCrypto>;
  let adapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    plumbing = makePlumbing();
    crypto = makeCrypto();
    adapter = new GitTrustChainAdapter({
      plumbing,
      crypto,
    });
  });

  // -------------------------------------------------------------------------
  // Constructor & Initialization
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('extends TrustChainPort', () => {
      expect(adapter).toBeInstanceOf(TrustChainPort);
    });

    it('initializes CAS and CborCodec successfully with logger', async () => {
      const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as any;
      const withLogger = new GitTrustChainAdapter({ plumbing, crypto, logger });
      const cas = await (withLogger as any)._getCas();
      expect(cas).toBeInstanceOf(MockContentAddressableStore);

      const cbor = await (withLogger as any)._getCbor();
      expect(cbor).toBeInstanceOf(CborCodec);
    });
  });

  // -------------------------------------------------------------------------
  // readTip
  // -------------------------------------------------------------------------

  describe('readTip', () => {
    it('returns null if resolveRef returns null', async () => {
      plumbing.execute.mockRejectedValueOnce(new Error('ref not found'));
      expect(await adapter.readTip(GRAPH_NAME)).toBeNull();
    });

    it('resolves tipSha and recordId successfully via CAS restore', async () => {
      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\nparent ${PARENT_SHA}\n\ncommit message`;
        return '';
      });

      mockReadManifest.mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] });
      mockRestore.mockResolvedValueOnce({ buffer: codec.encode(SAMPLE_RECORD_OBJ) });

      const tip = await adapter.readTip(GRAPH_NAME);
      expect(tip).toEqual({
        tipSha: EXPECTED_TIP_SHA,
        recordId: 'expected-record-id-hash',
      });
    });

    it('throws E_LEGACY_SUBSTRATE_DISABLED if CAS restore fails and legacy policy is disabled', async () => {
      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\nparent ${PARENT_SHA}\n\ncommit message`;
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      await expect(adapter.readTip(GRAPH_NAME)).rejects.toThrow(
        /Legacy trust record blob reads require the substrate migration compatibility policy/
      );
    });

    it('falls back to ls-tree and cat-file blob if CAS restore fails and legacy policy is enabled', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        compatibilityPolicy: { legacyTrustRecordBlobReads: true } as any,
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\nparent ${PARENT_SHA}\n\ncommit message`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\trecord.cbor\n';
        if (args[0] === 'cat-file' && args[1] === 'blob') return codec.encode(SAMPLE_RECORD_OBJ).toString('binary');
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      const tip = await legacyAdapter.readTip(GRAPH_NAME);
      expect(tip).toEqual({
        tipSha: EXPECTED_TIP_SHA,
        recordId: 'expected-record-id-hash',
      });
    });

    it('returns tipSha with null recordId in fallback if record.cbor is missing from ls-tree', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        compatibilityPolicy: { legacyTrustRecordBlobReads: true } as any,
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\nparent ${PARENT_SHA}\n\ncommit message`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\tother-file.txt\n'; // missing record.cbor
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      expect(await legacyAdapter.readTip(GRAPH_NAME)).toEqual({
        tipSha: EXPECTED_TIP_SHA,
        recordId: null,
      });
    });

    it('returns tipSha with null recordId in fallback if cat-file blob throws', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        compatibilityPolicy: { legacyTrustRecordBlobReads: true } as any,
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\nparent ${PARENT_SHA}\n\ncommit message`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\trecord.cbor\n';
        if (args[0] === 'cat-file' && args[1] === 'blob') throw new Error('corrupted blob');
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      expect(await legacyAdapter.readTip(GRAPH_NAME)).toEqual({
        tipSha: EXPECTED_TIP_SHA,
        recordId: null,
      });
    });
  });

  // -------------------------------------------------------------------------
  // readRecords (Streaming)
  // -------------------------------------------------------------------------

  describe('readRecords', () => {
    it('returns empty async iterable if resolveRef returns null', async () => {
      plumbing.execute.mockRejectedValueOnce(new Error('ref not found'));
      const records: any[] = [];
      for await (const rec of adapter.readRecords(GRAPH_NAME)) {
        records.push(rec);
      }
      expect(records).toHaveLength(0);
    });

    it('walks commit parent chain backward and yields records oldest-first via CAS restore', async () => {
      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') {
          if (args[2] === EXPECTED_TIP_SHA) return `tree tree-sha-2\nparent ${PARENT_SHA}\n\ncommit 2`;
          if (args[2] === PARENT_SHA) return `tree tree-sha-1\n\ncommit 1`;
        }
        return '';
      });

      const record1Obj = { ...SAMPLE_RECORD_OBJ, recordId: 'expected-record-id-hash', issuerKeyId: 'key-parent' };
      const record2Obj = { ...SAMPLE_RECORD_OBJ, recordId: 'expected-record-id-hash', issuerKeyId: 'key-tip' };

      mockReadManifest
        .mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] })
        .mockResolvedValueOnce({ slug: 'manifest-2', chunks: [] });

      mockRestore
        .mockResolvedValueOnce({ buffer: codec.encode(record1Obj) }) // oldest first (PARENT_SHA)
        .mockResolvedValueOnce({ buffer: codec.encode(record2Obj) }); // tip (EXPECTED_TIP_SHA)

      const records: any[] = [];
      for await (const rec of adapter.readRecords(GRAPH_NAME)) {
        records.push(rec);
      }

      expect(records).toHaveLength(2);
      expect(records[0].issuerKeyId).toBe('key-parent');
      expect(records[1].issuerKeyId).toBe('key-tip');
    });

    it('throws TrustError E_TRUST_RECORD_ID_MISMATCH if recordId does not match expected hash', async () => {
      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\n\ncommit 1`;
        return '';
      });

      const mismatchObj = { ...SAMPLE_RECORD_OBJ, recordId: 'mismatched-id' };

      mockReadManifest.mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] });
      mockRestore.mockResolvedValueOnce({ buffer: codec.encode(mismatchObj) });

      await expect(async () => {
        for await (const rec of adapter.readRecords(GRAPH_NAME)) {}
      }).rejects.toThrow(/RecordId mismatch/);
    });

    it('falls back to raw blob decode if CAS restore fails and legacy policy is enabled', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        compatibilityPolicy: { legacyTrustRecordBlobReads: true } as any,
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\n\ncommit 1`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\trecord.cbor\n';
        if (args[0] === 'cat-file' && args[1] === 'blob') return codec.encode(SAMPLE_RECORD_OBJ).toString('binary');
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      const records: any[] = [];
      for await (const rec of legacyAdapter.readRecords(GRAPH_NAME)) {
        records.push(rec);
      }
      expect(records).toHaveLength(1);
      expect(records[0].recordId).toBe('expected-record-id-hash');
    });

    it('skips commit if fallback blob is missing', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        compatibilityPolicy: { legacyTrustRecordBlobReads: true } as any,
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\n\ncommit 1`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\tother.txt\n'; // missing record.cbor
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      const records: any[] = [];
      for await (const rec of legacyAdapter.readRecords(GRAPH_NAME)) {
        records.push(rec);
      }
      expect(records).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // persistRecord
  // -------------------------------------------------------------------------

  describe('persistRecord', () => {
    const sampleTrustRecord = TrustRecord.fromDecoded({
      schemaVersion: 1,
      recordType: 'KEY_ADD',
      recordId: 'expected-record-id-hash',
      issuerKeyId: 'key-1',
      issuedAt: new Date().toISOString(),
      prev: null,
      subject: { keyId: 'key-subject-1', publicKey: 'pubkey-1' },
      meta: { note: 'test' },
      signature: { alg: 'ed25519', sig: 'sig-1' },
      signaturePayload: new Uint8Array([1, 2, 3]),
    });

    it('persists record successfully, creates tree, creates commit, updates ref', async () => {
      mockStore.mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] });
      mockCreateTree.mockResolvedValueOnce('tree-oid-1');
      plumbing.execute
        .mockResolvedValueOnce('new-commit-sha') // commit-tree
        .mockResolvedValueOnce(''); // update-ref

      const commitSha = await adapter.persistRecord(GRAPH_NAME, sampleTrustRecord, PARENT_SHA);
      expect(commitSha).toBe('new-commit-sha');
      expect(plumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', 'tree-oid-1', '-m', 'trust: KEY_ADD expected-rec', '-p', PARENT_SHA],
      });
      expect(plumbing.execute).toHaveBeenCalledWith({
        args: ['update-ref', `refs/warp/${GRAPH_NAME}/trust/records`, 'new-commit-sha', PARENT_SHA],
      });
    });

    it('retries CAS update on transient failure and succeeds', async () => {
      mockStore.mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] });
      mockCreateTree.mockResolvedValueOnce('tree-oid-1');

      plumbing.execute
        .mockResolvedValueOnce('new-commit-sha') // commit-tree
        .mockRejectedValueOnce(new Error('lock error')) // update-ref attempt 1 fails
        .mockResolvedValueOnce(PARENT_SHA) // rev-parse verify returns expectedSha (transient)
        .mockResolvedValueOnce(''); // update-ref attempt 2 succeeds

      const commitSha = await adapter.persistRecord(GRAPH_NAME, sampleTrustRecord, PARENT_SHA);
      expect(commitSha).toBe('new-commit-sha');
      expect(plumbing.execute).toHaveBeenCalledTimes(4);
    });

    it('throws TrustError E_TRUST_CAS_EXHAUSTED on max transient CAS failures', async () => {
      mockStore.mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] });
      mockCreateTree.mockResolvedValueOnce('tree-oid-1');

      plumbing.execute
        .mockResolvedValueOnce('new-commit-sha') // commit-tree
        .mockRejectedValueOnce(new Error('lock error')) // attempt 1
        .mockResolvedValueOnce(PARENT_SHA)
        .mockRejectedValueOnce(new Error('lock error')) // attempt 2
        .mockResolvedValueOnce(PARENT_SHA)
        .mockRejectedValueOnce(new Error('lock error')) // attempt 3
        .mockResolvedValueOnce(PARENT_SHA);

      await expect(adapter.persistRecord(GRAPH_NAME, sampleTrustRecord, PARENT_SHA)).rejects.toThrow(
        /Trust CAS exhausted after 3 attempts/
      );
    });

    it('throws TrustError E_TRUST_CAS_CONFLICT on real CAS conflict (chain advanced)', async () => {
      mockStore.mockResolvedValueOnce({ slug: 'manifest-1', chunks: [] });
      mockCreateTree.mockResolvedValueOnce('tree-oid-1');

      const advancedSha = 'c'.repeat(40);

      plumbing.execute
        .mockResolvedValueOnce('new-commit-sha') // commit-tree
        .mockRejectedValueOnce(new Error('lock error')) // attempt 1 update-ref fails
        .mockResolvedValueOnce(advancedSha) // rev-parse verify returns advancedSha (real conflict)
        .mockResolvedValueOnce(`tree tree-sha-conflict\n\ncommit conflict`); // cat-file -p for _readRecordIdFromCommit

      mockReadManifest.mockResolvedValueOnce({ slug: 'manifest-conflict', chunks: [] });
      mockRestore.mockResolvedValueOnce({ buffer: codec.encode(SAMPLE_RECORD_OBJ) });

      await expect(adapter.persistRecord(GRAPH_NAME, sampleTrustRecord, PARENT_SHA)).rejects.toThrow(
        /Trust CAS conflict: chain advanced/
      );
    });
  });
});
