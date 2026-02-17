/**
 * B15: Chain integration test.
 *
 * Tests the full cycle: append N records → read back → verify
 * prev-links + digests match golden fixtures.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import { verifyRecordId } from '../../../../src/domain/trust/TrustCanonical.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
  GOLDEN_CHAIN,
} from './fixtures/goldenRecords.js';

function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let counter = 0;

  return {
    /** @param {*} ref */
    async readRef(ref) { return refs.get(ref) ?? null; },
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
      const oid = `blob-${++counter}`;
      blobs.set(oid, data);
      return oid;
    },
    /** @param {*} oid */
    async readBlob(oid) {
      if (!blobs.has(oid)) throw new Error(`Blob not found: ${oid}`);
      return blobs.get(oid);
    },
    /** @param {*} entries */
    async writeTree(entries) {
      const oid = `tree-${++counter}`;
      trees.set(oid, { ...entries });
      return oid;
    },
    /** @param {*} oid */
    async readTreeOids(oid) {
      if (!trees.has(oid)) throw new Error(`Tree not found: ${oid}`);
      return trees.get(oid);
    },
    /** @param {*} sha */
    async getCommitTree(sha) {
      if (!commits.has(sha)) throw new Error(`Commit not found: ${sha}`);
      return commits.get(sha).tree;
    },
    /** @param {*} sha */
    async getNodeInfo(sha) {
      if (!commits.has(sha)) throw new Error(`Commit not found: ${sha}`);
      const c = commits.get(sha);
      return { parents: c.parents, message: c.message, date: null };
    },
    /** @param {{ tree: *, parents: *, message: * }} opts */
    async createCommit({ tree, parents, message }) {
      const oid = `commit-${++counter}`;
      commits.set(oid, { tree, parents, message });
      return oid;
    },
  };
}

function createMockCodec() {
  return {
    /** @param {*} value */
    encode(value) { return Buffer.from(JSON.stringify(value)); },
    /** @param {*} buf */
    decode(buf) { return JSON.parse(buf.toString()); },
  };
}

describe('Chain integration (B15)', () => {
  /** @type {*} */
  let service;

  beforeEach(() => {
    service = new TrustRecordService({
      persistence: createMockPersistence(),
      codec: createMockCodec(),
    });
  });

  it('appends full golden chain and reads back in order', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const records = await service.readRecords('test-graph');
    expect(records).toHaveLength(GOLDEN_CHAIN.length);

    for (let i = 0; i < records.length; i++) {
      expect(records[i].recordId).toBe(GOLDEN_CHAIN[i].recordId);
      expect(records[i].recordType).toBe(GOLDEN_CHAIN[i].recordType);
    }
  });

  it('read-back records pass recordId verification', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const records = await service.readRecords('test-graph');
    for (const record of records) {
      expect(verifyRecordId(record)).toBe(true);
    }
  });

  it('read-back chain passes verifyChain', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const records = await service.readRecords('test-graph');
    const result = service.verifyChain(records);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('prev-links form unbroken chain', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const records = await service.readRecords('test-graph');

    expect(records[0].prev).toBeNull();
    for (let i = 1; i < records.length; i++) {
      expect(records[i].prev).toBe(records[i - 1].recordId);
    }
  });

  it('recordIds match golden fixtures exactly', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const records = await service.readRecords('test-graph');
    const goldenIds = GOLDEN_CHAIN.map(/** @param {*} r */ (r) => r.recordId);
    const readIds = records.map(/** @param {*} r */ (r) => r.recordId);
    expect(readIds).toEqual(goldenIds);
  });
});
