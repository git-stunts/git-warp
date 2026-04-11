/**
 * B39 — Trust CAS retry tests.
 *
 * Verifies TrustRecordService._persistRecord() retry behavior:
 * - Transient CAS failures (ref unchanged): retry succeeds
 * - Transient CAS exhausted: E_TRUST_CAS_EXHAUSTED after N attempts
 * - Real concurrent append (ref changed): E_TRUST_CAS_CONFLICT with new tip info
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import { createJsonCodec, createTrustRecordPersistence } from '../../../helpers/trustTestUtils.js';
import { KEY_ADD_1, KEY_ADD_2 } from './fixtures/goldenRecords.ts';

describe('B39 — Trust CAS retry', () => {
  /** @type {ReturnType<typeof createTrustRecordPersistence>} */
  let persistence;
  /** @type {TrustRecordService} */
  let service;

  beforeEach(() => {
    persistence = createTrustRecordPersistence();
    service = new TrustRecordService({
      persistence: /** @type {*} */ (persistence),
      codec: createJsonCodec(),
    });
  });

  it('succeeds on first CAS attempt (no retry needed)', async () => {
    const result = await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
  });

  it('retries on transient CAS failure and succeeds', async () => {
    const origCas = persistence.compareAndSwapRef.bind(persistence);
    let casCallCount = 0;

    persistence.compareAndSwapRef = async (/** @type {*} */ ref, /** @type {*} */ newOid, /** @type {*} */ expectedOid) => {
      casCallCount++;
      if (casCallCount === 1) {
        // First CAS: transient failure (ref unchanged, so _readTip returns same value)
        throw new Error('CAS failure: lock contention');
      }
      // Second CAS: succeeds
      return origCas(ref, newOid, expectedOid);
    };

    const result = await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
    expect(casCallCount).toBe(2);
  });

  it('throws E_TRUST_CAS_EXHAUSTED after 3 transient failures', async () => {
    let casCallCount = 0;

    persistence.compareAndSwapRef = async () => {
      casCallCount++;
      // Always fail — ref unchanged (transient)
      throw new Error('CAS failure: lock contention');
    };

    await expect(
      service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true }),
    ).rejects.toThrow(/CAS exhausted/);

    try {
      await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    } catch (err) {
      expect(/** @type {*} */ (err).code).toBe('E_TRUST_CAS_EXHAUSTED');
    }

    // Should have attempted CAS 3 times (MAX_CAS_ATTEMPTS)
    // First call: 3 attempts, second call: 3 more
    expect(casCallCount).toBe(6);
  });

  it('throws E_TRUST_CAS_CONFLICT when chain advances during append', async () => {
    // Append genesis successfully
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });

    const ref = 'refs/warp/test-graph/trust/records';
    const origCas = persistence.compareAndSwapRef.bind(persistence);
    let casCallCount = 0;

    persistence.compareAndSwapRef = async (/** @type {*} */ r, /** @type {*} */ newOid, /** @type {*} */ expectedOid) => {
      casCallCount++;
      if (casCallCount === 1) {
        // Simulate a concurrent append: advance the ref to a new commit
        // before the CAS check runs
        const currentTip = persistence.refs.get(ref);
        if (!currentTip) {
          throw new Error('expected trust ref to be present before concurrent append simulation');
        }
        const concurrentBlob = await persistence.writeBlob(
          Buffer.from(JSON.stringify({ recordId: 'concurrent-record-id', prev: KEY_ADD_1.recordId })),
        );
        const concurrentTree = await persistence.writeTree([
          `100644 blob ${concurrentBlob}\trecord.cbor`,
        ]);
        const concurrentCommit = await persistence.commitNodeWithTree({
          treeOid: concurrentTree,
          parents: [currentTip],
          message: 'trust: concurrent',
        });
        persistence.refs.set(ref, concurrentCommit);

        throw new Error('CAS failure: ref changed');
      }
      return origCas(r, newOid, expectedOid);
    };

    try {
      await service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(/** @type {*} */ (err).code).toBe('E_TRUST_CAS_CONFLICT');
      expect(/** @type {*} */ (err).context.actualTipRecordId).toBe('concurrent-record-id');
      expect(/** @type {*} */ (err).context.actualTipSha).toMatch(/^commit-/);
    }
  });
});
