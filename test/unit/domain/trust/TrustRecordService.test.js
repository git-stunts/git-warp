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
    /** @param {string[]} entries - mktree-format lines */
    async writeTree(entries) {
      const oid = `tree-${++treeCounter}`;
      /** @type {Record<string, string>} */
      const parsed = {};
      for (const line of entries) {
        const match = line.match(/^\d+ blob ([^\t]+)\t(.+)$/);
        if (match) {
          parsed[match[2]] = match[1];
        }
      }
      trees.set(oid, parsed);
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
    /** @param {{ treeOid: string, parents?: string[], message: string }} opts */
    async commitNodeWithTree({ treeOid, parents = [], message }) {
      const oid = `commit-${++commitCounter}`;
      commits.set(oid, { tree: treeOid, parents, message });
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

  it('detects concurrent append via CAS conflict', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });

    // Simulate a concurrent append by mutating the ref after _readTip
    // but before _persistRecord's compareAndSwapRef.
    // We must seed a fake commit so _readTip can resolve the concurrent SHA.
    const fakeBlob = await persistence.writeBlob(
      Buffer.from(JSON.stringify({ ...KEY_ADD_2, recordId: 'fake'.repeat(16) })),
    );
    const fakeTree = await persistence.writeTree([`100644 blob ${fakeBlob}\trecord.cbor`]);
    const fakeSha = await persistence.commitNodeWithTree({
      treeOid: fakeTree,
      parents: [],
      message: 'trust: concurrent',
    });

    const origReadRef = persistence.readRef.bind(persistence);
    let callCount = 0;
    persistence.readRef = async (/** @type {*} */ ref) => {
      const result = await origReadRef(ref);
      callCount++;
      // After the first readRef in _readTip, sneak in a ref change
      if (callCount === 1) {
        persistence.refs.set(ref, fakeSha);
      }
      return result;
    };

    // B39: Now throws E_TRUST_CAS_CONFLICT (chain advanced) instead of raw CAS error
    await expect(
      service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true }),
    ).rejects.toThrow(/CAS conflict|CAS exhausted/);
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

  it('returns ok=true with empty records when no chain exists', async () => {
    const result = await service.readRecords('test-graph');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.records).toEqual([]);
  });

  it('returns ok=false when trust ref read fails', async () => {
    persistence.readRef = async () => {
      throw new Error('permission denied');
    };

    const result = await service.readRecords('test-graph');
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected readRecords to fail');
    }
    expect(result.error.message).toContain('Failed to read trust chain ref');
  });

  it('reads back appended records in order', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    await service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true });

    const result = await service.readRecords('test-graph');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    const records = result.records;
    expect(records).toHaveLength(2);
    expect(records[0].recordId).toBe(KEY_ADD_1.recordId);
    expect(records[1].recordId).toBe(KEY_ADD_2.recordId);
  });

  it('reads three records in chain order', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    await service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true });
    await service.appendRecord('test-graph', WRITER_BIND_ADD_ALICE, { skipSignatureVerify: true });

    const result = await service.readRecords('test-graph');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    const records = result.records;
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
      persistence: /** @type {*} */ (createMockPersistence()),
      codec: createMockCodec(),
    });
  });

  it('validates a correct chain', async () => {
    const records = [KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE];
    const result = await service.verifyChain(records);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects genesis with non-null prev (caught by recordId integrity)', async () => {
    // Changing prev changes content → recordId mismatch fires first
    const bad = { ...KEY_ADD_1, prev: 'a'.repeat(64) };
    const result = await service.verifyChain([bad]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].error).toContain('RecordId does not match');
  });

  it('detects broken prev-link (caught by recordId integrity)', async () => {
    // Changing prev changes content → recordId mismatch fires first
    const broken = { ...KEY_ADD_2, prev: '0'.repeat(64) };
    const result = await service.verifyChain([KEY_ADD_1, broken]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].error).toContain('RecordId does not match');
  });

  it('detects duplicate recordIds', async () => {
    const dup = { ...KEY_ADD_2, recordId: KEY_ADD_1.recordId };
    const result = await service.verifyChain([KEY_ADD_1, dup]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(/** @param {*} e */ (e) => e.error.includes('Duplicate recordId'))).toBe(true);
  });

  it('validates full golden chain (first 3)', async () => {
    const result = await service.verifyChain(GOLDEN_CHAIN.slice(0, 3));
    expect(result.valid).toBe(true);
  });

  it('validates full golden chain', async () => {
    const result = await service.verifyChain(GOLDEN_CHAIN);
    expect(result.valid).toBe(true);
  });
});
