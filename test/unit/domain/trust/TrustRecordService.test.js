/**
 * TrustRecordService unit tests.
 *
 * Tests appendRecord, readRecords, and verifyChain using an
 * in-memory persistence mock.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  GOLDEN_CHAIN,
} from './fixtures/goldenRecords.js';

/**
 * Minimal in-memory persistence mock for trust record tests.
 * Implements only the methods TrustRecordService needs.
 */
function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let blobCounter = 0;
  let treeCounter = 0;
  let commitCounter = 0;

  return {
    refs,
    /** @param {*} ref */
    async readRef(ref) {
      return refs.get(ref) ?? null;
    },
    /** @param {*} ref @param {*} newOid @param {*} expectedOid */
    async compareAndSwapRef(ref, newOid, expectedOid) {
      const current = refs.get(ref) ?? null;
      if (current !== expectedOid) {
        throw new Error(`CAS failure: expected ${expectedOid}, found ${current}`);
      }
      refs.set(ref, newOid);
    },
    /** @param {*} data */
    async writeBlob(data) {
      const oid = `blob-${++blobCounter}`;
      blobs.set(oid, data);
      return oid;
    },
    /** @param {*} oid */
    async readBlob(oid) {
      const data = blobs.get(oid);
      if (!data) throw new Error(`Blob not found: ${oid}`);
      return data;
    },
    /** @param {*} entries */
    async writeTree(entries) {
      const oid = `tree-${++treeCounter}`;
      trees.set(oid, { ...entries });
      return oid;
    },
    /** @param {*} oid */
    async readTreeOids(oid) {
      const tree = trees.get(oid);
      if (!tree) throw new Error(`Tree not found: ${oid}`);
      return tree;
    },
    /** @param {*} sha */
    async getCommitTree(sha) {
      const commit = commits.get(sha);
      if (!commit) throw new Error(`Commit not found: ${sha}`);
      return commit.tree;
    },
    /** @param {*} sha */
    async getNodeInfo(sha) {
      const commit = commits.get(sha);
      if (!commit) throw new Error(`Commit not found: ${sha}`);
      return { parents: commit.parents, message: commit.message, date: null };
    },
    /** @param {{ tree: *, parents: *, message: * }} opts */
    async createCommit({ tree, parents, message }) {
      const oid = `commit-${++commitCounter}`;
      commits.set(oid, { tree, parents, message });
      return oid;
    },
  };
}

function createMockCodec() {
  return {
    /** @param {*} value */
    encode(value) {
      return Buffer.from(JSON.stringify(value));
    },
    /** @param {*} buf */
    decode(buf) {
      return JSON.parse(buf.toString());
    },
  };
}

describe('TrustRecordService.appendRecord', () => {
  /** @type {*} */
  let persistence;
  /** @type {*} */
  let service;

  beforeEach(() => {
    persistence = createMockPersistence();
    service = new TrustRecordService({
      persistence,
      codec: createMockCodec(),
    });
  });

  it('appends genesis record (prev=null)', async () => {
    const result = await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
    expect(result.ref).toBe('refs/warp/test-graph/trust/records');
  });

  it('appends second record after genesis', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    const result = await service.appendRecord('test-graph', KEY_ADD_2, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
  });

  it('rejects record with invalid schema', async () => {
    await expect(
      service.appendRecord('test-graph', { schemaVersion: 99 }),
    ).rejects.toThrow('schema validation failed');
  });

  it('rejects record with mismatched recordId', async () => {
    const tampered = { ...KEY_ADD_1, recordId: '0'.repeat(64) };
    await expect(
      service.appendRecord('test-graph', tampered, { skipSignatureVerify: true }),
    ).rejects.toThrow('recordId does not match');
  });

  it('rejects record with wrong prev-link', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    // KEY_ADD_2 has correct prev, but skip it and try WRITER_BIND_ADD_ALICE
    // whose prev points to KEY_ADD_2's recordId, not KEY_ADD_1's
    await expect(
      service.appendRecord('test-graph', WRITER_BIND_ADD_ALICE, { skipSignatureVerify: true }),
    ).rejects.toThrow('Prev-link mismatch');
  });

  it('detects concurrent append via CAS failure', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });

    // Simulate a concurrent append by mutating the ref after _readTip
    // but before _persistRecord's compareAndSwapRef
    const origReadRef = persistence.readRef.bind(persistence);
    let callCount = 0;
    persistence.readRef = async (/** @type {*} */ ref) => {
      const result = await origReadRef(ref);
      callCount++;
      // After the first readRef in _readTip, sneak in a ref change
      if (callCount === 1) {
        persistence.refs.set(ref, 'concurrent-commit-sha');
      }
      return result;
    };

    await expect(
      service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true }),
    ).rejects.toThrow('CAS failure');
  });
});

describe('TrustRecordService.readRecords', () => {
  /** @type {*} */
  let persistence;
  /** @type {*} */
  let service;

  beforeEach(() => {
    persistence = createMockPersistence();
    service = new TrustRecordService({
      persistence,
      codec: createMockCodec(),
    });
  });

  it('returns empty array when no chain exists', async () => {
    const records = await service.readRecords('test-graph');
    expect(records).toEqual([]);
  });

  it('reads back appended records in order', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    await service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true });

    const records = await service.readRecords('test-graph');
    expect(records).toHaveLength(2);
    expect(records[0].recordId).toBe(KEY_ADD_1.recordId);
    expect(records[1].recordId).toBe(KEY_ADD_2.recordId);
  });

  it('reads three records in chain order', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    await service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true });
    await service.appendRecord('test-graph', WRITER_BIND_ADD_ALICE, { skipSignatureVerify: true });

    const records = await service.readRecords('test-graph');
    expect(records).toHaveLength(3);
    expect(records[0].recordType).toBe('KEY_ADD');
    expect(records[1].recordType).toBe('KEY_ADD');
    expect(records[2].recordType).toBe('WRITER_BIND_ADD');
  });
});

describe('TrustRecordService.verifyChain', () => {
  /** @type {*} */
  let service;

  beforeEach(() => {
    service = new TrustRecordService({
      persistence: createMockPersistence(),
      codec: createMockCodec(),
    });
  });

  it('validates a correct chain', () => {
    const records = [KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE];
    const result = service.verifyChain(records);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects genesis with non-null prev (caught by recordId integrity)', () => {
    // Changing prev changes content → recordId mismatch fires first
    const bad = { ...KEY_ADD_1, prev: 'a'.repeat(64) };
    const result = service.verifyChain([bad]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].error).toContain('RecordId does not match');
  });

  it('detects broken prev-link (caught by recordId integrity)', () => {
    // Changing prev changes content → recordId mismatch fires first
    const broken = { ...KEY_ADD_2, prev: '0'.repeat(64) };
    const result = service.verifyChain([KEY_ADD_1, broken]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].error).toContain('RecordId does not match');
  });

  it('detects duplicate recordIds', () => {
    const dup = { ...KEY_ADD_2, recordId: KEY_ADD_1.recordId };
    const result = service.verifyChain([KEY_ADD_1, dup]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(/** @param {*} e */ (e) => e.error.includes('Duplicate recordId'))).toBe(true);
  });

  it('validates full golden chain (first 3)', () => {
    const result = service.verifyChain(GOLDEN_CHAIN.slice(0, 3));
    expect(result.valid).toBe(true);
  });

  it('validates full golden chain', () => {
    const result = service.verifyChain(GOLDEN_CHAIN);
    expect(result.valid).toBe(true);
  });
});
