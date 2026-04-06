/**
 * TrustRecordService unit tests.
 *
 * Tests appendRecord, readRecords, and verifyChain using an
 * in-memory persistence mock.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.js';
import TrustError from '../../../../src/domain/errors/TrustError.js';
import { createJsonCodec, createTrustRecordPersistence } from '../../../helpers/trustTestUtils.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  GOLDEN_CHAIN,
} from './fixtures/goldenRecords.js';


describe('TrustRecordService.appendRecord', () => {
  /** @type {*} */
  let persistence;
  /** @type {*} */
  let service;

  beforeEach(() => {
    persistence = createTrustRecordPersistence();
    service = new TrustRecordService({
      persistence,
      codec: createJsonCodec(),
    });
  });

  it('appends genesis record (prev=null)', async () => {
    const result = await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
    expect(result.ref).toBe('refs/warp/test-graph/trust/records');
  });

  it('verifies the signature envelope when skipSignatureVerify is omitted', async () => {
    const result = await service.appendRecord('test-graph', KEY_ADD_1);

    expect(result.commitSha).toMatch(/^commit-/);
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
    persistence = createTrustRecordPersistence();
    service = new TrustRecordService({
      persistence,
      codec: createJsonCodec(),
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

  it('returns ok=true when the trust ref is missing by typed persistence error', async () => {
    persistence.readRef = async () => {
      throw new PersistenceError('ref missing', PersistenceError.E_REF_NOT_FOUND);
    };

    const result = await service.readRecords('test-graph');

    expect(result).toEqual({ ok: true, records: [] });
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

  it('stops cleanly when a trust commit tree has no record blob', async () => {
    const tree = await persistence.writeTree([]);
    const commit = await persistence.commitNodeWithTree({
      treeOid: tree,
      parents: [],
      message: 'trust: empty',
    });

    const result = await service.readRecords('test-graph', { tip: commit });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.records).toEqual([]);
  });

  it('wraps non-Error read failures into an Error result', async () => {
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    persistence.getNodeInfo = async () => {
      throw 'boom';
    };

    const result = await service.readRecords('test-graph');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected readRecords to fail');
    }
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('boom');
  });
});

describe('TrustRecordService.verifyChain', () => {
  /** @type {*} */
  let service;

  beforeEach(() => {
    service = new TrustRecordService({
      persistence: /** @type {*} */ (createTrustRecordPersistence()),
      codec: createJsonCodec(),
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

  it('skips null records without introducing chain errors', async () => {
    const result = await service.verifyChain([null]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports schema validation errors directly', async () => {
    const result = await service.verifyChain([{ nope: true }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.error).toContain('Schema:');
  });
});

describe('TrustRecordService private helpers', () => {
  /** @type {*} */
  let persistence;
  /** @type {*} */
  let service;

  beforeEach(() => {
    persistence = createTrustRecordPersistence();
    service = new TrustRecordService({
      persistence,
      codec: createJsonCodec(),
    });
  });

  it('throws when the signature envelope is missing', () => {
    expect(() => service._verifySignatureEnvelope({ ...KEY_ADD_1, signature: undefined })).toThrow(TrustError);
  });

  it('returns null tip info when ref reads fail', async () => {
    const ref = 'refs/warp/test-graph/trust/records';
    persistence.readRef = async () => {
      throw new Error('ref read failed');
    };

    const result = await service._readTip(ref);

    expect(result).toEqual({ tipSha: null, recordId: null });
  });

  it('returns null recordId when the tip commit has no record blob', async () => {
    const tree = await persistence.writeTree([]);
    const commit = await persistence.commitNodeWithTree({
      treeOid: tree,
      parents: [],
      message: 'trust: empty',
    });
    const ref = 'refs/warp/test-graph/trust/records';
    persistence.refs.set(ref, commit);

    const result = await service._readTip(ref);

    expect(result).toEqual({ tipSha: commit, recordId: null });
  });
});

describe('TrustRecordService.appendRecordWithRetry', () => {
  /** @type {*} */
  let persistence;
  /** @type {*} */
  let service;

  beforeEach(() => {
    persistence = createTrustRecordPersistence();
    service = new TrustRecordService({
      persistence,
      codec: createJsonCodec(),
    });
  });

  it('rethrows non-CAS failures without retrying', async () => {
    await expect(
      service.appendRecordWithRetry('test-graph', { schemaVersion: 99 }),
    ).rejects.toThrow('schema validation failed');
  });
});
