/**
 * @fileoverview AuditReceiptService — unit tests.
 *
 * Tests canonicalization, receipt construction, golden vector conformance,
 * adversarial chain invariants, CAS conflict handling, and error resilience.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  sortedReplacer,
  canonicalOpsJson,
  computeOpsDigest,
  buildReceiptRecord,
  OPS_DIGEST_PREFIX,
  AuditReceiptService,
} from '../../../../src/domain/services/AuditReceiptService.js';
import {
  encode as cborEncode,
} from '../../../../src/infrastructure/codecs/CborCodec.js';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

// ── Test crypto adapter ──────────────────────────────────────────────────

/** Sync-friendly crypto adapter matching CryptoPort */
const testCrypto = {
  /** @param {string} algorithm @param {string|Buffer|Uint8Array} data */
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return Buffer.alloc(0); },
  timingSafeEqual() { return false; },
};

// ============================================================================
// Canonicalization
// ============================================================================

describe('AuditReceiptService — Canonicalization', () => {
  it('sortedReplacer produces deterministic key order', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const json1 = JSON.stringify(obj, sortedReplacer);
    const json2 = JSON.stringify({ a: 2, m: 3, z: 1 }, sortedReplacer);
    expect(json1).toBe(json2);
    expect(json1).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sortedReplacer handles nested objects', () => {
    const obj = { b: { z: 1, a: 2 }, a: 3 };
    const json = JSON.stringify(obj, sortedReplacer);
    expect(json).toBe('{"a":3,"b":{"a":2,"z":1}}');
  });

  it('sortedReplacer passes arrays through unchanged', () => {
    const arr = [{ b: 1, a: 2 }];
    const json = JSON.stringify(arr, sortedReplacer);
    expect(json).toBe('[{"a":2,"b":1}]');
  });

  it('OPS_DIGEST_PREFIX contains literal null byte at position 21', () => {
    const bytes = new TextEncoder().encode(OPS_DIGEST_PREFIX);
    expect(bytes[bytes.length - 1]).toBe(0x00);
    expect(bytes.length).toBe(22);
  });

  it('canonicalOpsJson matches spec Section 5.2', () => {
    const ops = /** @type {const} */ ([
      { op: 'NodeAdd', target: 'user:alice', result: 'applied' },
      { op: 'PropSet', target: 'user:alice\0name', result: 'applied' },
    ]);
    const json = canonicalOpsJson(ops);
    const hex = Buffer.from(json, 'utf8').toString('hex');
    expect(hex).toBe(
      '5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c696365227d2c7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c6963655c75303030306e616d65227d5d',
    );
  });
});

// ============================================================================
// Domain Separator
// ============================================================================

describe('AuditReceiptService — Domain Separator', () => {
  it('with vs without prefix produces different hashes', async () => {
    const ops = /** @type {const} */ ([{ op: 'NodeAdd', target: 'test', result: 'applied' }]);
    const withPrefix = await computeOpsDigest(ops, testCrypto);
    const json = canonicalOpsJson(ops);
    const without = createHash('sha256').update(json).digest('hex');
    expect(withPrefix).not.toBe(without);
  });

  it('prefix is exactly 22 bytes', () => {
    const bytes = new TextEncoder().encode(OPS_DIGEST_PREFIX);
    expect(bytes.length).toBe(22);
  });
});

// ============================================================================
// Golden Vector Conformance
// ============================================================================

describe('AuditReceiptService — Golden Vectors', () => {
  it('Vector 1: genesis receipt opsDigest', async () => {
    const ops = /** @type {const} */ ([
      { op: 'NodeAdd', target: 'user:alice', result: 'applied' },
      { op: 'PropSet', target: 'user:alice\0name', result: 'applied' },
    ]);
    const digest = await computeOpsDigest(ops, testCrypto);
    expect(digest).toBe('63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe');
  });

  it('Vector 2: continuation receipt opsDigest', async () => {
    const ops = /** @type {const} */ ([
      { op: 'EdgeAdd', target: 'user:alice\0user:bob\0follows', result: 'applied' },
    ]);
    const digest = await computeOpsDigest(ops, testCrypto);
    expect(digest).toBe('2d060db4f93b99b55c5effdf7f28042e09c1e93f1e0369a7e561bfc639f4e3d3');
  });

  it('Vector 3: mixed outcomes opsDigest', async () => {
    const ops = /** @type {const} */ ([
      { op: 'NodeAdd', target: 'user:charlie', result: 'applied' },
      { op: 'PropSet', target: 'user:alice\0name', result: 'superseded', reason: 'LWW: writer bob at lamport 5 wins' },
      { op: 'NodeAdd', target: 'user:alice', result: 'redundant' },
    ]);
    const digest = await computeOpsDigest(ops, testCrypto);
    expect(digest).toBe('c8e06e3a8b8d920dd9b27ebb4d5944e91053314150cd3671d0557d3cff58d057');
  });

  it('Vector 4: SHA-256 OIDs opsDigest', async () => {
    const ops = /** @type {const} */ ([
      { op: 'NodeAdd', target: 'server:prod-1', result: 'applied' },
    ]);
    const digest = await computeOpsDigest(ops, testCrypto);
    expect(digest).toBe('03a8cb1f891ac5b92277271559bf4e2f235a4313a04ab947c1ec5a4f78185cb8');
  });
});

// ============================================================================
// Receipt Construction
// ============================================================================

describe('AuditReceiptService — buildReceiptRecord', () => {
  function validFields() {
    return {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };
  }

  it('creates frozen receipt with sorted keys', () => {
    const receipt = buildReceiptRecord(validFields());
    expect(Object.isFrozen(receipt)).toBe(true);
    const keys = Object.keys(receipt);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('CBOR encoding of receipt matches expected key order', () => {
    const receipt = buildReceiptRecord(validFields());
    const encoded = cborEncode(receipt);
    const decoded = /** @type {Record<string, unknown>} */ (defaultCodec.decode(encoded));
    const keys = Object.keys(decoded);
    expect(keys).toEqual([
      'dataCommit', 'graphName', 'opsDigest', 'prevAuditCommit',
      'tickEnd', 'tickStart', 'timestamp', 'version', 'writerId',
    ]);
  });

  it('lowercase-normalizes OID fields', () => {
    const f = validFields();
    f.dataCommit = 'A'.repeat(40);
    const receipt = buildReceiptRecord(f);
    expect(receipt.dataCommit).toBe('a'.repeat(40));
  });

  it('rejects version !== 1', () => {
    const f = validFields();
    f.version = 2;
    expect(() => buildReceiptRecord(f)).toThrow('Invalid version');
  });

  it('rejects tickStart > tickEnd', () => {
    const f = validFields();
    f.tickStart = 3;
    f.tickEnd = 1;
    expect(() => buildReceiptRecord(f)).toThrow('tickEnd');
  });

  it('rejects tickStart !== tickEnd in v1', () => {
    const f = validFields();
    f.tickStart = 1;
    f.tickEnd = 3;
    expect(() => buildReceiptRecord(f)).toThrow('v1 requires');
  });

  it('rejects OID length mismatch', () => {
    const f = validFields();
    f.dataCommit = 'f'.repeat(64);
    f.prevAuditCommit = '0'.repeat(40);
    expect(() => buildReceiptRecord(f)).toThrow('OID length mismatch');
  });

  it('rejects non-genesis with zero-hash sentinel', () => {
    const f = validFields();
    f.tickStart = 5;
    f.tickEnd = 5;
    f.prevAuditCommit = '0'.repeat(40);
    expect(() => buildReceiptRecord(f)).toThrow('Non-genesis');
  });

  it('rejects invalid OID hex', () => {
    const f = validFields();
    f.dataCommit = 'z'.repeat(40);
    expect(() => buildReceiptRecord(f)).toThrow('Invalid dataCommit OID');
  });

  it('rejects negative timestamp', () => {
    const f = validFields();
    f.timestamp = -1;
    expect(() => buildReceiptRecord(f)).toThrow('Invalid timestamp');
  });

  it('rejects non-integer timestamp', () => {
    const f = validFields();
    f.timestamp = 1.5;
    expect(() => buildReceiptRecord(f)).toThrow('Invalid timestamp');
  });

  it('rejects tickStart < 1', () => {
    const f = validFields();
    f.tickStart = 0;
    f.tickEnd = 0;
    expect(() => buildReceiptRecord(f)).toThrow('tickStart');
  });
});

// ============================================================================
// Service Integration
// ============================================================================

describe('AuditReceiptService — commit flow', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;
  /** @type {AuditReceiptService} */
  let service;

  beforeEach(async () => {
    persistence = new InMemoryGraphAdapter();
    service = new AuditReceiptService({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
    });
    await service.init();
  });

  function makeTickReceipt(lamport = 1, patchSha = 'a'.repeat(40)) {
    return Object.freeze({
      patchSha,
      writer: 'alice',
      lamport,
      ops: Object.freeze([
        Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'user:alice', result: 'applied' })),
      ]),
    });
  }

  it('creates audit commit on first call (genesis)', async () => {
    const sha = await service.commit(makeTickReceipt());
    expect(sha).toBeTruthy();
    expect(typeof sha).toBe('string');

    // Audit ref should be set
    const ref = await persistence.readRef('refs/warp/events/audit/alice');
    expect(ref).toBe(sha);
  });

  it('chains audit commits (parent linking)', async () => {
    const sha1 = await service.commit(makeTickReceipt(1, 'a'.repeat(40)));
    const sha2 = await service.commit(makeTickReceipt(2, 'b'.repeat(40)));

    expect(sha1).toBeTruthy();
    expect(sha2).toBeTruthy();
    expect(sha2).not.toBe(sha1);

    // Second commit should have first as parent
    const info = await persistence.getNodeInfo(/** @type {string} */ (sha2));
    expect(info.parents).toEqual([sha1]);
  });

  it('stats track committed count', async () => {
    await service.commit(makeTickReceipt(1, 'a'.repeat(40)));
    await service.commit(makeTickReceipt(2, 'b'.repeat(40)));
    const stats = service.getStats();
    expect(stats.committed).toBe(2);
    expect(stats.failed).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.degraded).toBe(false);
  });

  it('audit commit tree contains receipt.cbor blob', async () => {
    const sha = await service.commit(makeTickReceipt());
    const commit = persistence._commits.get(/** @type {string} */ (sha));
    expect(commit).toBeTruthy();
    const tree = await persistence.readTree(/** @type {{ treeOid: string }} */ (commit).treeOid);
    expect(tree).toHaveProperty('receipt.cbor');
    expect(Buffer.isBuffer(tree['receipt.cbor'])).toBe(true);

    // Decode the CBOR and verify structure
    const receipt = /** @type {Record<string, unknown>} */ (defaultCodec.decode(tree['receipt.cbor']));
    expect(receipt.version).toBe(1);
    expect(receipt.graphName).toBe('events');
    expect(receipt.writerId).toBe('alice');
    expect(receipt.dataCommit).toBe('a'.repeat(40));
  });
});

// ============================================================================
// CAS Conflict + Retry
// ============================================================================

describe('AuditReceiptService — CAS conflict handling', () => {
  it('retries once on CAS mismatch with refreshed tip', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };
    const service = new AuditReceiptService({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    // First commit succeeds normally
    const receipt1 = Object.freeze({
      patchSha: 'a'.repeat(40),
      writer: 'alice',
      lamport: 1,
      ops: Object.freeze([Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'n1', result: 'applied' }))]),
    });
    await service.commit(receipt1);

    // Now simulate CAS conflict: externally update the ref
    const externalSha = await persistence.commitNode({ message: 'external' });
    await persistence.updateRef('refs/warp/events/audit/alice', externalSha);

    // Next commit should trigger CAS conflict and retry
    const receipt2 = Object.freeze({
      patchSha: 'b'.repeat(40),
      writer: 'alice',
      lamport: 2,
      ops: Object.freeze([Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'n2', result: 'applied' }))]),
    });
    const sha2 = await service.commit(receipt2);

    // Should have logged CAS conflict
    const casLog = logger.warn.mock.calls.find(
      (c) => c[1]?.code === 'AUDIT_REF_CAS_CONFLICT',
    );
    expect(casLog).toBeTruthy();

    // Should still succeed after retry
    expect(sha2).toBeTruthy();
  });

  it('degrades after second CAS failure', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };

    // Create a persistence that always fails CAS
    const failingPersistence = Object.create(persistence);
    let casCallCount = 0;
    failingPersistence.compareAndSwapRef = async () => {
      casCallCount++;
      throw new Error('CAS mismatch');
    };
    // Forward all other methods to the real adapter
    failingPersistence.writeBlob = persistence.writeBlob.bind(persistence);
    failingPersistence.writeTree = persistence.writeTree.bind(persistence);
    failingPersistence.commitNodeWithTree = persistence.commitNodeWithTree.bind(persistence);
    failingPersistence.readRef = persistence.readRef.bind(persistence);

    const service = new AuditReceiptService({
      persistence: failingPersistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    const receipt = Object.freeze({
      patchSha: 'a'.repeat(40),
      writer: 'alice',
      lamport: 1,
      ops: Object.freeze([Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'n1', result: 'applied' }))]),
    });

    // Should fail gracefully (commit() catches errors)
    const result = await service.commit(receipt);
    expect(result).toBeNull();

    // Should be degraded now
    const stats = service.getStats();
    expect(stats.degraded).toBe(true);

    // Subsequent calls should be skipped
    const result2 = await service.commit(receipt);
    expect(result2).toBeNull();
    expect(service.getStats().skipped).toBeGreaterThan(0);
  });
});

// ============================================================================
// Error Resilience
// ============================================================================

describe('AuditReceiptService — Error resilience', () => {
  it('writeBlob failure logs AUDIT_WRITE_BLOB_FAILED, does not throw', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };

    const failingPersistence = Object.create(persistence);
    failingPersistence.writeBlob = async () => {
      throw new Error('disk full');
    };
    failingPersistence.readRef = persistence.readRef.bind(persistence);

    const service = new AuditReceiptService({
      persistence: failingPersistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    const receipt = Object.freeze({
      patchSha: 'a'.repeat(40),
      writer: 'alice',
      lamport: 1,
      ops: Object.freeze([Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'n1', result: 'applied' }))]),
    });

    const result = await service.commit(receipt);
    expect(result).toBeNull();

    const blobLog = logger.warn.mock.calls.find(
      (c) => c[1]?.code === 'AUDIT_WRITE_BLOB_FAILED',
    );
    expect(blobLog).toBeTruthy();
  });

  it('writeTree failure logs AUDIT_WRITE_TREE_FAILED, does not throw', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };

    const failingPersistence = Object.create(persistence);
    failingPersistence.writeBlob = persistence.writeBlob.bind(persistence);
    failingPersistence.writeTree = async () => {
      throw new Error('tree error');
    };
    failingPersistence.readRef = persistence.readRef.bind(persistence);

    const service = new AuditReceiptService({
      persistence: failingPersistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    const receipt = Object.freeze({
      patchSha: 'a'.repeat(40),
      writer: 'alice',
      lamport: 1,
      ops: Object.freeze([Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'n1', result: 'applied' }))]),
    });

    const result = await service.commit(receipt);
    expect(result).toBeNull();

    const treeLog = logger.warn.mock.calls.find(
      (c) => c[1]?.code === 'AUDIT_WRITE_TREE_FAILED',
    );
    expect(treeLog).toBeTruthy();
  });

  it('structured error codes present in all log calls', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };

    const failingPersistence = Object.create(persistence);
    failingPersistence.writeBlob = async () => {
      throw new Error('fail');
    };
    failingPersistence.readRef = persistence.readRef.bind(persistence);

    const service = new AuditReceiptService({
      persistence: failingPersistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    const receipt = Object.freeze({
      patchSha: 'a'.repeat(40),
      writer: 'alice',
      lamport: 1,
      ops: Object.freeze([Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'n1', result: 'applied' }))]),
    });

    await service.commit(receipt);

    // Every warn call should have a code field
    for (const call of logger.warn.mock.calls) {
      expect(call[1]).toHaveProperty('code');
      expect(typeof call[1].code).toBe('string');
    }
  });
});

// ============================================================================
// Integration with TickReceipt
// ============================================================================

describe('AuditReceiptService — cross-writer guard', () => {
  it('rejects tickReceipt with mismatched writer', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };
    const service = new AuditReceiptService({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    const receipt = Object.freeze({
      patchSha: 'a'.repeat(40),
      writer: 'eve', // ← wrong writer
      lamport: 1,
      ops: Object.freeze([
        Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: 'x', result: 'applied' })),
      ]),
    });

    // Should reject or log and skip — must not attribute eve's ops to alice's audit chain
    const sha = await service.commit(receipt);
    // commit() should return null (skipped) since the writer doesn't match
    expect(sha).toBeNull();

    // Audit ref should NOT have been set
    const ref = await persistence.readRef('refs/warp/events/audit/alice');
    expect(ref).toBeNull();
  });
});

describe('AuditReceiptService — TickReceipt integration', () => {
  it('ops with reason field → correct canonical key order', () => {
    const ops = /** @type {const} */ ([
      { op: 'PropSet', target: 'a\0b', result: 'superseded', reason: 'LWW conflict' },
    ]);
    const json = canonicalOpsJson(ops);
    // "reason" sorts before "result"
    expect(json).toContain('"reason":"LWW conflict","result":"superseded"');
  });

  it('ops without reason → field absent, not null', () => {
    const ops = /** @type {const} */ ([
      { op: 'NodeAdd', target: 'x', result: 'applied' },
    ]);
    const json = canonicalOpsJson(ops);
    expect(json).not.toContain('reason');
    expect(json).not.toContain('null');
  });
});
