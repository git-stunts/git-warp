import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CborCodec } from '@git-stunts/git-cas';
import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import GitTrustChainAdapter from '../../../../src/infrastructure/adapters/GitTrustChainAdapter.ts';
import SubstrateCompatibilityPolicy from '../../../../src/infrastructure/adapters/SubstrateCompatibilityPolicy.ts';
import CryptoPort from '../../../../src/ports/CryptoPort.ts';
import TrustChainPort from '../../../../src/ports/TrustChainPort.ts';

const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

class MockContentAddressableStore {
  readManifest = mockReadManifest;
  restore = mockRestore;
  store = mockStore;
  createTree = mockCreateTree;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlumbing() {
  return {
    execute: vi.fn(),
  };
}

class TestCrypto extends CryptoPort {
  hash(_algorithm: string, _data: string | Uint8Array): Promise<string> {
    return Promise.resolve('expected-record-id-hash');
  }

  hmac(
    _algorithm: string,
    _key: string | Uint8Array,
    _data: string | Uint8Array,
  ): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array());
  }

  timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length;
  }
}

function makeCrypto(): CryptoPort {
  return new TestCrypto();
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
  let adapter: GitTrustChainAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    plumbing = makePlumbing();
    crypto = makeCrypto();
    adapter = new GitTrustChainAdapter({
      plumbing,
      crypto,
      cas: new MockContentAddressableStore(),
      cbor: codec,
    });
  });

  // -------------------------------------------------------------------------
  // Constructor & Initialization
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('extends TrustChainPort', () => {
      expect(adapter).toBeInstanceOf(TrustChainPort);
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
        cas: new MockContentAddressableStore(),
        cbor: codec,
        compatibilityPolicy: new SubstrateCompatibilityPolicy({
          legacyTrustRecordBlobReads: true,
        }),
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\nparent ${PARENT_SHA}\n\ncommit message`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\trecord.cbor\n';
        if (args[0] === 'cat-file' && args[1] === 'blob') return Buffer.from(codec.encode(SAMPLE_RECORD_OBJ)).toString('binary');
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
        cas: new MockContentAddressableStore(),
        cbor: codec,
        compatibilityPolicy: new SubstrateCompatibilityPolicy({
          legacyTrustRecordBlobReads: true,
        }),
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

    it('ignores blank and malformed legacy tree records', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        cas: new MockContentAddressableStore(),
        cbor: codec,
        compatibilityPolicy: new SubstrateCompatibilityPolicy({
          legacyTrustRecordBlobReads: true,
        }),
      });
      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\n\ncommit message`;
        if (args[0] === 'ls-tree') {
          return 'malformed legacy row\n\n100644 blob blob-oid-1\tother-file.txt\n';
        }
        return '';
      });
      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      await expect(legacyAdapter.readTip(GRAPH_NAME)).resolves.toEqual({
        tipSha: EXPECTED_TIP_SHA,
        recordId: null,
      });
    });

    it('returns tipSha with null recordId in fallback if cat-file blob throws', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        cas: new MockContentAddressableStore(),
        cbor: codec,
        compatibilityPolicy: new SubstrateCompatibilityPolicy({
          legacyTrustRecordBlobReads: true,
        }),
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
      const records: TrustRecord[] = [];
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

      const records: TrustRecord[] = [];
      for await (const rec of adapter.readRecords(GRAPH_NAME)) {
        records.push(rec);
      }

      expect(records).toHaveLength(2);
      expect(records[0]?.issuerKeyId).toBe('key-parent');
      expect(records[1]?.issuerKeyId).toBe('key-tip');
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
        for await (const rec of adapter.readRecords(GRAPH_NAME)) {
          expect(rec).toBeDefined();
        }
      }).rejects.toThrow(/RecordId mismatch/);
    });

    it('falls back to raw blob decode if CAS restore fails and legacy policy is enabled', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        cas: new MockContentAddressableStore(),
        cbor: codec,
        compatibilityPolicy: new SubstrateCompatibilityPolicy({
          legacyTrustRecordBlobReads: true,
        }),
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\n\ncommit 1`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\trecord.cbor\n';
        if (args[0] === 'cat-file' && args[1] === 'blob') return Buffer.from(codec.encode(SAMPLE_RECORD_OBJ)).toString('binary');
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      const records: TrustRecord[] = [];
      for await (const rec of legacyAdapter.readRecords(GRAPH_NAME)) {
        records.push(rec);
      }
      expect(records).toHaveLength(1);
      expect(records[0]?.recordId).toBe('expected-record-id-hash');
    });

    it('skips commit if fallback blob is missing', async () => {
      const legacyAdapter = new GitTrustChainAdapter({
        plumbing,
        crypto,
        cas: new MockContentAddressableStore(),
        cbor: codec,
        compatibilityPolicy: new SubstrateCompatibilityPolicy({
          legacyTrustRecordBlobReads: true,
        }),
      });

      plumbing.execute.mockImplementation(async ({ args }) => {
        if (args[0] === 'rev-parse') return EXPECTED_TIP_SHA;
        if (args[0] === 'cat-file' && args[1] === '-p') return `tree tree-sha-1\n\ncommit 1`;
        if (args[0] === 'ls-tree') return '100644 blob blob-oid-1\tother.txt\n'; // missing record.cbor
        return '';
      });

      mockReadManifest.mockRejectedValueOnce(new Error('manifest not found'));

      const records: TrustRecord[] = [];
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
