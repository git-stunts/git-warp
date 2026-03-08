/**
 * Phase 3, Invariant 3 — CAS convergence tests for appendRecordWithRetry.
 *
 * Tests 10-13: verify that the higher-level retry loop converges
 * under CAS conflicts, exhausts predictably, handles concurrent
 * appenders, and preserves chain integrity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import TrustError from '../../../../src/domain/errors/TrustError.js';
import { computeRecordId } from '../../../../src/domain/trust/TrustCanonical.js';
import { KEY_ADD_1, KEY_ADD_2 } from './fixtures/goldenRecords.js';

// ── Mock factories ─────────────────────────────────────────────────────────

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
    blobs,
    trees,
    commits,
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
      if (!data) {
        throw new Error(`Blob not found: ${oid}`);
      }
      return data;
    },
    /** @param {string[]} entries */
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
      if (!tree) {
        throw new Error(`Tree not found: ${oid}`);
      }
      return tree;
    },
    /** @param {*} sha */
    async getCommitTree(sha) {
      const commit = commits.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
      return commit.tree;
    },
    /** @param {*} sha */
    async getNodeInfo(sha) {
      const commit = commits.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Invariant 3 — CAS convergence (appendRecordWithRetry)', () => {
  /** @type {ReturnType<typeof createMockPersistence>} */
  let persistence;
  /** @type {TrustRecordService} */
  let service;

  beforeEach(() => {
    persistence = createMockPersistence();
    service = new TrustRecordService({
      persistence: /** @type {*} */ (persistence),
      codec: createMockCodec(),
    });
  });

  // ── Test 10: CAS conflict retry succeeds ────────────────────────────────

  it('retries on CAS conflict and succeeds with rebuilt prev (test 10)', async () => {
    // Seed genesis record so the chain has a tip
    await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });

    // appendRecord will be called by appendRecordWithRetry.
    // First call: throw E_TRUST_CAS_CONFLICT with context pointing to a new tip.
    // Second call: succeed normally.
    let appendCallCount = 0;
    const origAppendRecord = service.appendRecord.bind(service);
    const newTipRecordId = 'aaaa'.repeat(16);

    vi.spyOn(service, 'appendRecord').mockImplementation(
      async (graphName, record, options) => {
        appendCallCount++;
        if (appendCallCount === 1) {
          throw new TrustError(
            'Trust CAS conflict: chain advanced',
            {
              code: 'E_TRUST_CAS_CONFLICT',
              context: {
                expectedTipSha: 'commit-old',
                actualTipSha: 'commit-new',
                actualTipRecordId: newTipRecordId,
              },
            },
          );
        }
        // Second call: succeed — verify the record was rebuilt with new prev
        expect(record.prev).toBe(newTipRecordId);
        return { commitSha: 'commit-success', ref: 'refs/warp/test-graph/trust/records' };
      },
    );

    const result = await service.appendRecordWithRetry('test-graph', KEY_ADD_2, {
      skipSignatureVerify: true,
    });

    expect(result.commitSha).toBe('commit-success');
    expect(result.attempts).toBe(2);
    expect(appendCallCount).toBe(2);
  });

  // ── Test 11: CAS exhaustion fails predictably ───────────────────────────

  it('throws E_TRUST_CAS_EXHAUSTED after maxRetries+1 attempts (test 11)', async () => {
    const maxRetries = 2;
    let appendCallCount = 0;

    vi.spyOn(service, 'appendRecord').mockImplementation(async () => {
      appendCallCount++;
      throw new TrustError(
        'Trust CAS conflict: chain advanced',
        {
          code: 'E_TRUST_CAS_CONFLICT',
          context: {
            expectedTipSha: `commit-expected-${appendCallCount}`,
            actualTipSha: `commit-actual-${appendCallCount}`,
            actualTipRecordId: `tip-record-${appendCallCount}`,
          },
        },
      );
    });

    try {
      await service.appendRecordWithRetry('test-graph', KEY_ADD_1, {
        maxRetries,
        skipSignatureVerify: true,
      });
      expect.fail('Should have thrown E_TRUST_CAS_EXHAUSTED');
    } catch (err) {
      expect(err).toBeInstanceOf(TrustError);
      expect(/** @type {TrustError} */ (err).code).toBe('E_TRUST_CAS_EXHAUSTED');
    }

    // maxRetries=2 means: 1 initial + 2 retries = 3 total attempts
    expect(appendCallCount).toBe(maxRetries + 1);
  });

  // ── Test 12: Two concurrent appenders ───────────────────────────────────

  it('two concurrent appenders both eventually succeed (test 12)', async () => {
    // Track the shared chain state. Both appenders target the same chain.
    // First attempt for each: CAS conflict. Second attempt: succeed.
    /** @type {any[]} */
    const committed = [];
    let appendCallCount = 0;

    vi.spyOn(service, 'appendRecord').mockImplementation(async (_graphName, record) => {
      appendCallCount++;
      const callNum = appendCallCount;

      // First two calls (one from each concurrent appender) fail with CAS conflict
      if (callNum <= 2) {
        throw new TrustError(
          'Trust CAS conflict: chain advanced',
          {
            code: 'E_TRUST_CAS_CONFLICT',
            context: {
              expectedTipSha: 'commit-stale',
              actualTipSha: `commit-tip-${callNum}`,
              actualTipRecordId: `fresh-tip-${callNum}`,
            },
          },
        );
      }

      // Subsequent calls succeed
      const sha = `commit-ok-${callNum}`;
      committed.push({ sha, recordPrev: record.prev });
      return { commitSha: sha, ref: 'refs/warp/test-graph/trust/records' };
    });

    const recordA = { ...KEY_ADD_1 };
    const recordB = { ...KEY_ADD_1 };

    const [resultA, resultB] = await Promise.all([
      service.appendRecordWithRetry('test-graph', recordA, {
        skipSignatureVerify: true,
      }),
      service.appendRecordWithRetry('test-graph', recordB, {
        skipSignatureVerify: true,
      }),
    ]);

    expect(resultA.commitSha).toMatch(/^commit-ok-/);
    expect(resultB.commitSha).toMatch(/^commit-ok-/);
    expect(resultA.attempts).toBe(2);
    expect(resultB.attempts).toBe(2);
    expect(committed).toHaveLength(2);
  });

  // ── Test 13: Chain integrity after concurrent appends ───────────────────

  it('prev pointers form a valid chain after concurrent appends (test 13)', async () => {
    // Use the real appendRecord (not mocked) with a persistence layer
    // that simulates CAS conflicts on the first attempt for each appender,
    // then succeeds. This exercises the full code path including prev rebuild.

    // Seed genesis
    await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });

    // We will append KEY_ADD_2 twice (via appendRecordWithRetry) concurrently.
    // The first call to appendRecord from each will see a CAS conflict because
    // the other "won" the race. We simulate this by intercepting _persistRecord.

    const ref = 'refs/warp/test-graph/trust/records';
    const origCAS = persistence.compareAndSwapRef.bind(persistence);
    let casFailCount = 0;

    // Make the first CAS in _persistRecord fail with a real conflict
    // (advance the ref so it looks like a concurrent append happened).
    persistence.compareAndSwapRef = async (/** @type {*} */ r, /** @type {*} */ newOid, /** @type {*} */ expectedOid) => {
      casFailCount++;
      if (casFailCount === 1) {
        // Simulate a concurrent append advancing the chain
        const concurrentRecord = {
          ...KEY_ADD_2,
          recordId: 'cc'.repeat(32),
          prev: KEY_ADD_1.recordId,
        };
        const concurrentBlob = await persistence.writeBlob(
          Buffer.from(JSON.stringify(concurrentRecord)),
        );
        const concurrentTree = await persistence.writeTree([
          `100644 blob ${concurrentBlob}\trecord.cbor`,
        ]);
        const currentTip = persistence.refs.get(r);
        const concurrentCommit = await persistence.commitNodeWithTree({
          treeOid: concurrentTree,
          parents: currentTip ? [currentTip] : [],
          message: 'trust: concurrent KEY_ADD',
        });
        persistence.refs.set(r, concurrentCommit);

        throw new Error('CAS failure: ref changed');
      }
      return origCAS(r, newOid, expectedOid);
    };

    // resign must recompute recordId since prev changed (content-addressed).
    // Since we skip signature verify, no need to re-sign.
    const resign = async (/** @type {Record<string, unknown>} */ record) => {
      const rebuilt = { ...record };
      delete rebuilt.recordId;
      delete rebuilt.signature;
      const newRecordId = await computeRecordId(rebuilt);
      return {
        ...rebuilt,
        recordId: newRecordId,
        signature: { alg: 'ed25519', sig: 'placeholder' },
      };
    };

    const result = await service.appendRecordWithRetry('test-graph', KEY_ADD_2, {
      skipSignatureVerify: true,
      resign,
    });

    expect(result.commitSha).toMatch(/^commit-/);
    expect(result.attempts).toBeGreaterThanOrEqual(2);

    // Now read back the chain and verify prev pointers
    const readResult = await service.readRecords('test-graph');
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw readResult.error;
    }
    const records = readResult.records;

    // Should have at least 2 records: genesis + the concurrent append
    expect(records.length).toBeGreaterThanOrEqual(2);

    // First record must have prev=null (genesis)
    expect(records[0].prev).toBeNull();

    // Every subsequent record's prev must equal the previous record's recordId
    for (let i = 1; i < records.length; i++) {
      expect(records[i].prev).toBe(records[i - 1].recordId);
    }
  });
});
