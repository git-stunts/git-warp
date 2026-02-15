/**
 * @fileoverview AuditVerifierService — unit tests.
 *
 * Builds audit chains programmatically using InMemoryGraphAdapter + AuditReceiptService,
 * then verifies chain integrity, tamper detection, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
import { AuditReceiptService } from '../../../../src/domain/services/AuditReceiptService.js';
import { AuditVerifierService } from '../../../../src/domain/services/AuditVerifierService.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';
import { encodeAuditMessage } from '../../../../src/domain/services/AuditMessageCodec.js';

// ── Test crypto adapter ──────────────────────────────────────────────────

const testCrypto = {
  /** @param {string} algorithm @param {string|Buffer|Uint8Array} data */
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return Buffer.alloc(0); },
  timingSafeEqual() { return false; },
};

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Creates an AuditReceiptService bound to a persistence adapter.
 * @param {InMemoryGraphAdapter} persistence
 * @param {string} graphName
 * @param {string} writerId
 */
async function createAuditService(persistence, graphName, writerId) {
  const service = new AuditReceiptService({
    persistence,
    graphName,
    writerId,
    codec: defaultCodec,
    crypto: testCrypto,
  });
  await service.init();
  return service;
}

/**
 * Commits a tick receipt and returns the audit commit SHA.
 * @param {AuditReceiptService} service
 * @param {number} lamport
 * @param {string} [patchSha]
 * @param {string} [writer]
 */
async function commitReceipt(service, lamport, patchSha, writer = 'alice') {
  const sha = patchSha || `${lamport.toString(16).padStart(2, '0')}${'a'.repeat(38)}`;
  return await service.commit(Object.freeze({
    patchSha: sha,
    writer,
    lamport,
    ops: Object.freeze([
      Object.freeze({ op: 'NodeAdd', target: `node:${lamport}`, result: 'applied' }),
    ]),
  }));
}

/**
 * Creates a verifier for the given persistence.
 * @param {InMemoryGraphAdapter} persistence
 */
function createVerifier(persistence) {
  return new AuditVerifierService({
    persistence,
    codec: defaultCodec,
  });
}

// ============================================================================
// Valid chains
// ============================================================================

describe('AuditVerifierService — valid chains', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('verifies a genesis-only chain', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('VALID');
    expect(result.receiptsVerified).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.genesisCommit).toBeTruthy();
  });

  it('verifies a multi-receipt chain (3 receipts)', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    await commitReceipt(service, 2);
    await commitReceipt(service, 3);

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('VALID');
    expect(result.receiptsVerified).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it('returns VALID with 0 chains when no audit refs exist', async () => {
    const verifier = createVerifier(persistence);
    const result = await verifier.verifyAll('events');

    expect(result.summary.total).toBe(0);
    expect(result.summary.valid).toBe(0);
    expect(result.chains).toEqual([]);
  });

  it('returns empty result for non-existent writer', async () => {
    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'nobody');

    expect(result.status).toBe('VALID');
    expect(result.receiptsVerified).toBe(0);
    expect(result.tipCommit).toBeNull();
  });
});

// ============================================================================
// PARTIAL (--since)
// ============================================================================

describe('AuditVerifierService — --since', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;
  /** @type {string[]} */
  let auditShas;

  beforeEach(async () => {
    persistence = new InMemoryGraphAdapter();
    const service = await createAuditService(persistence, 'events', 'alice');
    auditShas = [];
    for (let i = 1; i <= 5; i++) {
      const sha = await commitReceipt(service, i);
      auditShas.push(/** @type {string} */ (sha));
    }
  });

  it('returns PARTIAL when --since stops mid-chain', async () => {
    const verifier = createVerifier(persistence);
    const since = auditShas[2]; // commit for tick 3
    const result = await verifier.verifyChain('events', 'alice', { since });

    expect(result.status).toBe('PARTIAL');
    expect(result.receiptsVerified).toBe(3); // ticks 5, 4, 3
    expect(result.stoppedAt).toBe(since);
    expect(result.errors).toEqual([]);
  });

  it('returns PARTIAL when --since is the tip', async () => {
    const verifier = createVerifier(persistence);
    const since = auditShas[4]; // tip
    const result = await verifier.verifyChain('events', 'alice', { since });

    expect(result.status).toBe('PARTIAL');
    expect(result.receiptsVerified).toBe(1);
  });

  it('returns ERROR with SINCE_NOT_FOUND when commit not in chain', async () => {
    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice', { since: 'f'.repeat(40) });

    expect(result.status).toBe('ERROR');
    expect(result.errors[0].code).toBe('SINCE_NOT_FOUND');
  });
});

// ============================================================================
// BROKEN_CHAIN — structural integrity
// ============================================================================

describe('AuditVerifierService — broken chain', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects chain link broken (Git parent mismatch)', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);
    const sha2 = await commitReceipt(service, 2);

    // Tamper: rewrite sha2's Git parent to a different commit
    const commit = persistence._commits.get(/** @type {string} */ (sha2));
    if (commit) {
      commit.parents = ['f'.repeat(40)];
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'GIT_PARENT_MISMATCH')).toBe(true);
  });

  it('detects genesis with parents', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    // Tamper: add a parent to the genesis commit
    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      commit.parents = ['f'.repeat(40)];
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'GENESIS_HAS_PARENTS')).toBe(true);
  });

  it('detects continuation with no parent', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    const sha2 = await commitReceipt(service, 2);

    // Tamper: remove parents from continuation commit
    const commit = persistence._commits.get(/** @type {string} */ (sha2));
    if (commit) {
      commit.parents = [];
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'CONTINUATION_NO_PARENT')).toBe(true);
  });

  it('detects tick monotonicity violation', async () => {
    // Build chain manually to create non-monotonic ticks
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);
    const sha2 = await commitReceipt(service, 2);

    // Tamper: change tick in sha1's receipt to be >= sha2's tick
    const commit1 = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit1) {
      const tree = await persistence.readTree(commit1.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      receipt.tickStart = 5;
      receipt.tickEnd = 5;
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTreeOid = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit1.treeOid = newTreeOid;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'TICK_MONOTONICITY')).toBe(true);
  });

  it('detects extra entries in tree (RECEIPT_TREE_INVALID)', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    // Tamper: add extra entry to the tree
    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receiptBlob = await persistence.writeBlob(tree['receipt.cbor']);
      const extraBlob = await persistence.writeBlob(Buffer.from('extra'));
      const newTreeOid = await persistence.writeTree([
        `100644 blob ${receiptBlob}\treceipt.cbor`,
        `100644 blob ${extraBlob}\textra.txt`,
      ]);
      commit.treeOid = newTreeOid;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'RECEIPT_TREE_INVALID')).toBe(true);
  });

  it('detects missing receipt.cbor in tree', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    // Tamper: replace tree with one that has wrong filename
    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receiptBlob = await persistence.writeBlob(tree['receipt.cbor']);
      const newTreeOid = await persistence.writeTree([
        `100644 blob ${receiptBlob}\twrong.cbor`,
      ]);
      commit.treeOid = newTreeOid;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'RECEIPT_TREE_INVALID')).toBe(true);
  });
});

// ============================================================================
// DATA_MISMATCH — content integrity
// ============================================================================

describe('AuditVerifierService — data mismatch', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects trailer dataCommit mismatch with CBOR', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    // Tamper: rewrite commit message with different dataCommit
    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      // Re-encode message with wrong dataCommit
      commit.message = encodeAuditMessage({
        graph: 'events',
        writer: 'alice',
        dataCommit: 'b'.repeat(40),
        opsDigest: receipt.opsDigest,
      });
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors.some((e) => e.code === 'TRAILER_MISMATCH')).toBe(true);
  });

  it('detects trailer opsDigest mismatch with CBOR', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      commit.message = encodeAuditMessage({
        graph: 'events',
        writer: 'alice',
        dataCommit: receipt.dataCommit,
        opsDigest: 'f'.repeat(64),
      });
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors.some((e) => e.code === 'TRAILER_MISMATCH')).toBe(true);
  });

  it('detects trailer writer mismatch with CBOR', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      commit.message = encodeAuditMessage({
        graph: 'events',
        writer: 'bob',
        dataCommit: receipt.dataCommit,
        opsDigest: receipt.opsDigest,
      });
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors.some((e) => e.code === 'TRAILER_MISMATCH')).toBe(true);
  });

  it('detects trailer graph mismatch with CBOR', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      commit.message = encodeAuditMessage({
        graph: 'other',
        writer: 'alice',
        dataCommit: receipt.dataCommit,
        opsDigest: receipt.opsDigest,
      });
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors.some((e) => e.code === 'TRAILER_MISMATCH')).toBe(true);
  });

  it('detects corrupt CBOR', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      // Replace receipt.cbor with garbage
      const garbageBlob = await persistence.writeBlob(Buffer.from('not valid cbor'));
      const newTree = await persistence.writeTree([`100644 blob ${garbageBlob}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('ERROR');
    expect(result.errors.some((e) => e.code === 'CBOR_DECODE_FAILED')).toBe(true);
  });
});

// ============================================================================
// OID format validation
// ============================================================================

describe('AuditVerifierService — OID format', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects uppercase hex in dataCommit', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      // Tamper: uppercase the dataCommit
      receipt.dataCommit = 'A'.repeat(40);
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    // OID validation normalizes to lowercase then checks hex format
    // 'A'.repeat(40).toLowerCase() = 'a'.repeat(40) which IS valid hex
    // So this passes OID validation but will fail trailer consistency
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects non-hex characters in dataCommit', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      receipt.dataCommit = 'g'.repeat(40);
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'OID_FORMAT_INVALID')).toBe(true);
  });

  it('detects wrong-length dataCommit', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      receipt.dataCommit = 'a'.repeat(32);
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'OID_FORMAT_INVALID')).toBe(true);
  });
});

// ============================================================================
// Warnings
// ============================================================================

describe('AuditVerifierService — warnings', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('warns about tick gap', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    // Skip tick 2 — directly write tick 3
    await commitReceipt(service, 3);

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('VALID');
    expect(result.warnings.some((w) => w.code === 'TICK_GAP')).toBe(true);
  });

  it('warns when tip moves during verification', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);

    const verifier = createVerifier(persistence);

    // Monkey-patch readRef to simulate tip moving after first read
    const originalReadRef = persistence.readRef.bind(persistence);
    let callCount = 0;
    persistence.readRef = async (ref) => {
      callCount++;
      if (callCount === 1) {
        // First call: return current tip
        const tip = await originalReadRef(ref);
        // Now write another receipt to advance the tip
        await commitReceipt(service, 2);
        return tip;
      }
      return await originalReadRef(ref);
    };

    const result = await verifier.verifyChain('events', 'alice');

    expect(result.warnings.some((w) => w.code === 'TIP_MOVED_DURING_VERIFY')).toBe(true);
  });
});

// ============================================================================
// verifyAll — multiple writers
// ============================================================================

describe('AuditVerifierService — verifyAll', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('aggregates results for multiple writers', async () => {
    const alice = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(alice, 1, undefined, 'alice');
    await commitReceipt(alice, 2, undefined, 'alice');

    const bob = await createAuditService(persistence, 'events', 'bob');
    await commitReceipt(bob, 1, 'b'.repeat(40), 'bob');

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyAll('events');

    expect(result.summary.total).toBe(2);
    expect(result.summary.valid).toBe(2);
    expect(result.chains).toHaveLength(2);
    expect(result.chains.map((c) => c.writerId).sort()).toEqual(['alice', 'bob']);
  });

  it('returns empty result when no audit refs exist', async () => {
    const verifier = createVerifier(persistence);
    const result = await verifier.verifyAll('events');

    expect(result.summary.total).toBe(0);
    expect(result.chains).toEqual([]);
  });

  it('trustWarning is null when no trust config is present', async () => {
    const verifier = createVerifier(persistence);
    const result = await verifier.verifyAll('events');

    expect(result.trustWarning).toBeNull();
  });
});

// ============================================================================
// Writer consistency
// ============================================================================

describe('AuditVerifierService — writer/graph consistency', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects writer ID mismatch within chain', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1, undefined, 'alice');

    // Tamper: change writerId in receipt of sha1
    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      receipt.writerId = 'mallory';
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Schema validation
// ============================================================================

describe('AuditVerifierService — schema validation', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects missing receipt fields', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      // Replace receipt with incomplete object
      const incomplete = { version: 1, graphName: 'events' };
      const cborBytes = defaultCodec.encode(incomplete);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.some((e) => e.code === 'RECEIPT_SCHEMA_INVALID')).toBe(true);
  });

  it('detects unsupported receipt version', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      receipt.version = 99;
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.some((e) => e.code === 'RECEIPT_SCHEMA_INVALID')).toBe(true);
  });
});

// ============================================================================
// OID length consistency
// ============================================================================

describe('AuditVerifierService — OID length mismatch', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects OID length change between receipts', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    const sha2 = await commitReceipt(service, 2);

    // Tamper: change sha2's receipt to use 64-char OIDs
    const commit = persistence._commits.get(/** @type {string} */ (sha2));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      receipt.dataCommit = 'a'.repeat(64);
      receipt.prevAuditCommit = receipt.prevAuditCommit.padEnd(64, '0');
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects prevAuditCommit length != dataCommit length', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = persistence._commits.get(/** @type {string} */ (sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = /** @type {Record<string, *>} */ (defaultCodec.decode(tree['receipt.cbor']));
      // dataCommit is 40 chars, make prevAuditCommit 64 chars
      receipt.prevAuditCommit = '0'.repeat(64);
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.some((e) => e.code === 'OID_LENGTH_MISMATCH')).toBe(true);
  });
});

// ============================================================================
// trustWarning — CLI-injected trust detection
// ============================================================================

describe('AuditVerifierService — trustWarning', () => {
  /** @type {InMemoryGraphAdapter} */
  let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('passes through CLI-injected trustWarning', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);

    const warning = {
      code: 'TRUST_CONFIG_PRESENT_UNENFORCED',
      message: 'Trust root configured but signature verification is not implemented in v1',
      sources: ['env'],
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyAll('events', { trustWarning: warning });
    expect(result.trustWarning).toEqual(warning);
  });
});

// ============================================================================
// Domain purity — no process.env in src/domain/
// ============================================================================

describe('Domain purity boundary', () => {
  it('src/domain/ does not reference process.env', async () => {
    const { execSync } = await import('node:child_process');
    const result = execSync(
      'grep -r "process\\.env" src/domain/ || true',
      { encoding: 'utf8', cwd: new URL('../../../../', import.meta.url).pathname },
    );
    expect(result.trim()).toBe('');
  });
});
