/**
 * @fileoverview AuditVerifierService — unit tests.
 *
 * Builds audit chains programmatically using InMemoryGraphAdapter + AuditReceiptService,
 * then verifies chain integrity, tamper detection, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import InMemoryGraphAdapter from '../../../../test/helpers/InMemoryGraphAdapter.ts';
import { AuditReceiptService } from '../../../../src/domain/services/audit/AuditReceiptService.ts';
import AuditVerifierService from '../../../../src/domain/services/audit/AuditVerifierService.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import defaultTrustCrypto from '../../../../src/infrastructure/adapters/TrustCryptoSingleton.ts';
import { encodeAuditMessage } from '../../../../src/domain/services/codec/AuditMessageCodec.ts';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
} from '../trust/fixtures/goldenRecords.ts';
import { MockTrustChainPort } from '../../../helpers/MockTrustChainPort.ts';
import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';

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
async function commitReceipt(service: any, lamport: any, patchSha?: string, writer = 'alice') {
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

/**
 * Mutates the decoded receipt stored in an audit commit and rewrites the tree.
 * @param {InMemoryGraphAdapter} persistence
 * @param {string} commitSha
 * @param {(receipt: Record<string, *>) => void} mutate
 * @returns {Promise<Record<string, *>>}
 */
async function mutateReceipt(persistence, commitSha, mutate) {
  const commit = ((persistence)['_commits'].get(commitSha) as any);
  if (!commit) {
    throw new Error(`missing commit ${commitSha}`);
  }
  const tree = await persistence.readTree((commit.treeOid as string));
  const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
  mutate(receipt);
  const cborBytes = defaultCodec.encode(receipt);
  const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
  commit['treeOid'] = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
  return receipt;
}

/**
 * Rewrites the audit commit message.
 * @param {InMemoryGraphAdapter} persistence
 * @param {string} commitSha
 * @param {(message: string) => string} mutate
 */
function mutateCommitMessage(persistence, commitSha, mutate) {
  const commit = ((persistence)['_commits'].get(commitSha) as any);
  if (!commit) {
    throw new Error(`missing commit ${commitSha}`);
  }
  commit['message'] = mutate((commit['message'] as string));
}

/**
 * Seeds a trust chain into the in-memory repo.
 * @param {InMemoryGraphAdapter} persistence
 * @param {string} graphName
 * @param {Array<Record<string, unknown>>} records
 */
/**
 * Creates a verifier with a mock trust chain port seeded with the given records.
 * @param {InMemoryGraphAdapter} persistence
 * @param {import('../../../../src/domain/trust/TrustRecord.ts').TrustRecord[]} records
 */
function createTrustVerifier(persistence, records) {
  const trustChain = new MockTrustChainPort();
  trustChain.seed(records);
  return new AuditVerifierService({
    persistence,
    codec: defaultCodec,
    trustChain,
    trustCrypto: defaultTrustCrypto,
  });
}

/**
 * Creates a verifier with a failing trust chain port.
 * @param {InMemoryGraphAdapter} persistence
 * @param {Error} err
 */
function createFailingTrustVerifier(persistence, err) {
  const trustChain = new MockTrustChainPort();
  trustChain.failWith(err);
  return new AuditVerifierService({
    persistence,
    codec: defaultCodec,
    trustChain,
    trustCrypto: defaultTrustCrypto,
  });
}

// ============================================================================
// Valid chains
// ============================================================================

describe('AuditVerifierService — valid chains', () => {
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

  it('returns an empty result when the audit ref cannot be read', async () => {
    persistence.readRef = async () => {
      throw new Error('ref storage unavailable');
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('VALID');
    expect(result.receiptsVerified).toBe(0);
    expect(result.tipCommit).toBeNull();
  });
});

// ============================================================================
// PARTIAL (--since)
// ============================================================================

describe('AuditVerifierService — --since', () => {
    let persistence;
    let auditShas;

  beforeEach(async () => {
    persistence = new InMemoryGraphAdapter();
    const service = await createAuditService(persistence, 'events', 'alice');
    auditShas = [];
    for (let i = 1; i <= 5; i++) {
      const sha = await commitReceipt(service, i);
      auditShas.push((sha));
    }
  });

  it('returns PARTIAL when --since stops mid-chain', async () => {
    const verifier = createVerifier(persistence);
    const since = (auditShas[2] as string); // commit for tick 3
    const result = await verifier.verifyChain('events', 'alice', { since });

    expect(result.status).toBe('PARTIAL');
    expect(result.receiptsVerified).toBe(3); // ticks 5, 4, 3
    expect(result.stoppedAt).toBe(since);
    expect(result.errors).toEqual([]);
  });

  it('returns PARTIAL when --since is the tip', async () => {
    const verifier = createVerifier(persistence);
    const since = (auditShas[4] as string); // tip
    const result = await verifier.verifyChain('events', 'alice', { since });

    expect(result.status).toBe('PARTIAL');
    expect(result.receiptsVerified).toBe(1);
  });

  it('returns ERROR with SINCE_NOT_FOUND when commit not in chain', async () => {
    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice', { since: 'f'.repeat(40) });

    expect(result.status).toBe('ERROR');
    expect(result.errors[0]?.code).toBe('SINCE_NOT_FOUND');
  });
});

// ============================================================================
// BROKEN_CHAIN — structural integrity
// ============================================================================

describe('AuditVerifierService — broken chain', () => {
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects chain link broken (Git parent mismatch)', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    const sha2 = await commitReceipt(service, 2);

    // Tamper: rewrite sha2's Git parent to a different commit
    const commit = ((persistence) as any)['_commits'].get((sha2));
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
    const commit = ((persistence) as any)['_commits'].get((sha1));
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
    const commit = ((persistence) as any)['_commits'].get((sha2));
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
    const sha1tick = await commitReceipt(service, 1);
    await commitReceipt(service, 2);

    // Tamper: change tick in sha1's receipt to be >= sha2's tick
    const commit1 = ((persistence) as any)['_commits'].get((sha1tick));
    if (commit1) {
      const tree = await persistence.readTree(commit1.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      receipt['tickStart'] = 5;
      receipt['tickEnd'] = 5;
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
    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receiptBlob = await persistence.writeBlob((tree['receipt.cbor'] as Uint8Array));
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
    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receiptBlob = await persistence.writeBlob((tree['receipt.cbor'] as Uint8Array));
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
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects trailer dataCommit mismatch with CBOR', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    // Tamper: rewrite commit message with different dataCommit
    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      // Re-encode message with wrong dataCommit
      commit.message = encodeAuditMessage({
        graph: 'events',
        writer: 'alice',
        dataCommit: 'b'.repeat(40),
        opsDigest: receipt['opsDigest'],
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      commit.message = encodeAuditMessage({
        graph: 'events',
        writer: 'alice',
        dataCommit: receipt['dataCommit'],
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      commit.message = encodeAuditMessage({
        graph: 'events',
        writer: 'bob',
        dataCommit: receipt['dataCommit'],
        opsDigest: receipt['opsDigest'],
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      commit.message = encodeAuditMessage({
        graph: 'other',
        writer: 'alice',
        dataCommit: receipt['dataCommit'],
        opsDigest: receipt['opsDigest'],
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
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

  it('detects trailer decode failure', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    mutateCommitMessage(persistence, (sha1), () => 'not an audit receipt');

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors.some((e) => e.code === 'TRAILER_MISMATCH')).toBe(true);
  });

  it('detects trailer schema mismatch with receipt metadata', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    mutateCommitMessage(
      persistence,
      (sha1),
      (message) => message.replace(/eg-schema:\s*1/, 'eg-schema: 2'),
    );

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors.some((e) => e.code === 'TRAILER_MISMATCH')).toBe(true);
  });
});

// ============================================================================
// OID format validation
// ============================================================================

describe('AuditVerifierService — OID format', () => {
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects uppercase hex in dataCommit', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      // Tamper: uppercase the dataCommit
      receipt['dataCommit'] = 'A'.repeat(40);
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      receipt['dataCommit'] = 'g'.repeat(40);
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      receipt['dataCommit'] = 'a'.repeat(32);
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

  it('detects invalid prevAuditCommit format', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    await mutateReceipt(persistence, (sha1), (receipt) => {
      receipt['prevAuditCommit'] = 'g'.repeat(40);
    });

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
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects writer ID mismatch within chain', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1, undefined, 'alice');

    // Tamper: change writerId in receipt of sha1
    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      receipt['writerId'] = 'mallory';
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects writer mismatch against the requested writer when trailers agree', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1, undefined, 'alice');

    const receipt = await mutateReceipt(persistence, (sha1), (receipt) => {
      receipt['writerId'] = 'mallory';
    });
    mutateCommitMessage(
      persistence,
      (sha1),
      () => encodeAuditMessage({
        graph: (receipt['graphName'] as string),
        writer: (receipt['writerId'] as string),
        dataCommit: (receipt['dataCommit'] as string),
        opsDigest: (receipt['opsDigest'] as string),
      }),
    );

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'WRITER_CONSISTENCY')).toBe(true);
  });

  it('detects graph mismatch against the requested graph when trailers agree', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1, undefined, 'alice');

    const receipt = await mutateReceipt(persistence, (sha1), (receipt) => {
      receipt['graphName'] = 'other-events';
    });
    mutateCommitMessage(
      persistence,
      (sha1),
      () => encodeAuditMessage({
        graph: (receipt['graphName'] as string),
        writer: (receipt['writerId'] as string),
        dataCommit: (receipt['dataCommit'] as string),
        opsDigest: (receipt['opsDigest'] as string),
      }),
    );

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'WRITER_CONSISTENCY')).toBe(true);
  });

  it('detects writer changes between linked receipts', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1, undefined, 'alice');
    await commitReceipt(service, 2, undefined, 'alice');

    const receipt = await mutateReceipt(persistence, (sha1), (receipt) => {
      receipt['writerId'] = 'mallory';
    });
    mutateCommitMessage(
      persistence,
      (sha1),
      () => encodeAuditMessage({
        graph: (receipt['graphName'] as string),
        writer: (receipt['writerId'] as string),
        dataCommit: (receipt['dataCommit'] as string),
        opsDigest: (receipt['opsDigest'] as string),
      }),
    );

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'WRITER_CONSISTENCY')).toBe(true);
  });

  it('detects graph changes between linked receipts', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1, undefined, 'alice');
    await commitReceipt(service, 2, undefined, 'alice');

    const receipt = await mutateReceipt(persistence, (sha1), (receipt) => {
      receipt['graphName'] = 'other-events';
    });
    mutateCommitMessage(
      persistence,
      (sha1),
      () => encodeAuditMessage({
        graph: (receipt['graphName'] as string),
        writer: (receipt['writerId'] as string),
        dataCommit: (receipt['dataCommit'] as string),
        opsDigest: (receipt['opsDigest'] as string),
      }),
    );

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.some((e) => e.code === 'WRITER_CONSISTENCY')).toBe(true);
  });
});

// ============================================================================
// Schema validation
// ============================================================================

describe('AuditVerifierService — schema validation', () => {
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects missing receipt fields', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = ((persistence) as any)['_commits'].get((sha1));
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      receipt['version'] = 99;
      const cborBytes = defaultCodec.encode(receipt);
      const blobOid = await persistence.writeBlob(Buffer.from(cborBytes));
      const newTree = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
      commit.treeOid = newTree;
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.some((e) => e.code === 'RECEIPT_SCHEMA_INVALID')).toBe(true);
  });

  it('detects non-object receipts', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const blobOid = await persistence.writeBlob(Buffer.from(defaultCodec.encode('not-an-object')));
      commit.treeOid = await persistence.writeTree([`100644 blob ${blobOid}\treceipt.cbor`]);
    }

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.errors.some((e) => e.code === 'RECEIPT_SCHEMA_INVALID')).toBe(true);
  });

  for (const [name, mutate] of (([
    ['detects missing required fields with a full 9-field object', (receipt) => { delete receipt['writerId']; receipt['extra'] = 'filler'; }],
    ['detects empty graphName', (receipt) => { receipt['graphName'] = ''; }],
    ['detects empty writerId', (receipt) => { receipt['writerId'] = ''; }],
    ['detects non-string dataCommit', (receipt) => { receipt['dataCommit'] = 42; }],
    ['detects non-string opsDigest', (receipt) => { receipt['opsDigest'] = 42; }],
    ['detects non-string prevAuditCommit', (receipt) => { receipt['prevAuditCommit'] = 42; }],
    ['detects tickStart below 1', (receipt) => { receipt['tickStart'] = 0; }],
    ['detects tickEnd below tickStart', (receipt) => { receipt['tickEnd'] = 0; }],
    ['detects v1 receipts with tickStart != tickEnd', (receipt) => { receipt['tickEnd'] = 2; }],
    ['detects negative timestamps', (receipt) => { receipt['timestamp'] = -1; }],
  ]) as Array<[string, (receipt: Record<string, unknown>) => void]>)) {
    it(name, async () => {
      const service = await createAuditService(persistence, 'events', 'alice');
      const sha1 = await commitReceipt(service, 1);

      await mutateReceipt(persistence, (sha1), (mutate));

      const verifier = createVerifier(persistence);
      const result = await verifier.verifyChain('events', 'alice');

      expect(result.errors.some((e) => e.code === 'RECEIPT_SCHEMA_INVALID')).toBe(true);
    });
  }
});

// ============================================================================
// OID length consistency
// ============================================================================

describe('AuditVerifierService — OID length mismatch', () => {
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects OID length change between receipts', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    const sha2 = await commitReceipt(service, 2);

    // Tamper: change sha2's receipt to use 64-char OIDs
    const commit = ((persistence) as any)['_commits'].get((sha2));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      receipt['dataCommit'] = 'a'.repeat(64);
      receipt['prevAuditCommit'] = receipt['prevAuditCommit'].padEnd(64, '0');
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

    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (commit) {
      const tree = await persistence.readTree(commit.treeOid);
      const receipt = (defaultCodec.decode((tree['receipt.cbor'] as Uint8Array)) as Record<string, any>);
      // dataCommit is 40 chars, make prevAuditCommit 64 chars
      receipt['prevAuditCommit'] = '0'.repeat(64);
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
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('passes through CLI-injected trustWarning', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);

    const warning = {
      code: 'TRUST_CONFIG_PRESENT_UNENFORCED',
      message: 'Deprecated WARP_TRUSTED_ROOT trust config detected; use signed trust records or --trust-pin',
      sources: ['env'],
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyAll('events', { trustWarning: warning });
    expect(result.trustWarning).toEqual(warning);
  });
});

describe('AuditVerifierService — evaluateTrust', () => {
  it('returns error/fail when trust-chain read fails', async () => {
    const persistence = new InMemoryGraphAdapter();
    const verifier = createFailingTrustVerifier(persistence, new Error('trust storage unavailable'));
    const result = await verifier.evaluateTrust('events');

    expect(result.trust.status).toBe('error');
    expect(result.trust.source).toBe('ref');
    expect(result.trustVerdict).toBe('fail');
    expect(result.trust.explanations).toHaveLength(1);
    expect(result.trust.explanations[0]?.reasonCode).toBe('TRUST_RECORD_CHAIN_INVALID');
    expect(result.trust.explanations[0]?.reason).toContain('trust storage unavailable');
  });

  it('returns not_configured when no trust records exist', async () => {
    const persistence = new InMemoryGraphAdapter();
    const verifier = createTrustVerifier(persistence, []);
    const result = await verifier.evaluateTrust('events');

    expect(result.trustVerdict).toBe('not_configured');
    expect(result.trust.status).toBe('not_configured');
    expect(result.trust.explanations).toEqual([]);
  });

  it('verifies signed trust records end-to-end', async () => {
    const persistence = new InMemoryGraphAdapter();
    const verifier = createTrustVerifier(persistence, [KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const result = await verifier.evaluateTrust('events', {
      mode: 'enforce',
      writerIds: ['alice'],
    });

    expect(result.trustVerdict).toBe('pass');
    expect(result.trust.explanations).toEqual([
      expect.objectContaining({
        writerId: 'alice',
        trusted: true,
        reasonCode: 'WRITER_BOUND_TO_ACTIVE_KEY',
      }),
    ]);
  });

  it('fails closed when a trust record signature is tampered', async () => {
    const persistence = new InMemoryGraphAdapter();
    // Tampered record: signaturePayload is from original, but sig bytes are zeroed
    const tampered = TrustRecord.fromDecoded({
      schemaVersion: KEY_ADD_2.schemaVersion,
      recordType: KEY_ADD_2.recordType,
      recordId: KEY_ADD_2.recordId,
      issuerKeyId: KEY_ADD_2.issuerKeyId,
      issuedAt: KEY_ADD_2.issuedAt,
      prev: KEY_ADD_2.prev,
      subject: (KEY_ADD_2.subject as any),
      meta: (KEY_ADD_2.meta as any),
      signature: { alg: 'ed25519', sig: Buffer.alloc(64, 0).toString('base64') },
      signaturePayload: KEY_ADD_2.signaturePayload,
    });

    const verifier = createTrustVerifier(persistence, [KEY_ADD_1, tampered, WRITER_BIND_ADD_ALICE]);
    const result = await verifier.evaluateTrust('events', {
      mode: 'enforce',
      writerIds: ['alice'],
    });

    expect(result.trustVerdict).toBe('fail');
    expect(result.trust.status).toBe('error');
    expect(result.trust.explanations[0]?.reasonCode).toBe('TRUST_RECORD_CHAIN_INVALID');
    expect(result.trust.explanations[0]?.reason).toContain('Trust evidence invalid');
  });

  it('defaults trust policy mode to warn when mode is omitted', async () => {
    const persistence = new InMemoryGraphAdapter();
    const verifier = createTrustVerifier(persistence, [KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const result = await verifier.evaluateTrust('events', {
      writerIds: ['alice'],
    });

    expect(result.mode).toBe('signed_evidence');
    expect(result.trust.status).toBe('configured');
    expect(result.trust.source).toBe('ref');
    expect(result.trustVerdict).toBe('pass');
  });
});

describe('AuditVerifierService — storage failure paths', () => {
    let persistence;

  beforeEach(() => {
    persistence = new InMemoryGraphAdapter();
  });

  it('detects unreadable commit metadata', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    persistence.getNodeInfo = async () => {
      throw new Error('commit missing');
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('ERROR');
    expect(result.errors.some((e) => e.code === 'MISSING_RECEIPT_BLOB')).toBe(true);
  });

  it('detects unreadable commit tree', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);
    const originalGetCommitTree = persistence.getCommitTree.bind(persistence);
    persistence.getCommitTree = async (commitSha) => {
      if (commitSha === sha1) {
        throw new Error('tree lookup failed');
      }
      return originalGetCommitTree(commitSha);
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('ERROR');
    expect(result.errors.some((e) => e.code === 'MISSING_RECEIPT_BLOB')).toBe(true);
  });

  it('detects unreadable tree entries', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    persistence.readTreeOids = async () => {
      throw new Error('tree decode failed');
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('ERROR');
    expect(result.errors.some((e) => e.code === 'RECEIPT_TREE_INVALID')).toBe(true);
  });

  it('detects missing receipt blob entries even when the tree shape is otherwise correct', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    await commitReceipt(service, 1);
    persistence.readTreeOids = (async () => ({ 'receipt.cbor': undefined }) as any);

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('ERROR');
    expect(result.errors.some((e) => e.code === 'MISSING_RECEIPT_BLOB')).toBe(true);
  });

  it('detects unreadable receipt blobs', async () => {
    const service = await createAuditService(persistence, 'events', 'alice');
    const sha1 = await commitReceipt(service, 1);
    const originalReadBlob = persistence.readBlob.bind(persistence);
    const commit = ((persistence) as any)['_commits'].get((sha1));
    if (!commit) {
      throw new Error('missing audit commit');
    }
    const treeOids = await persistence.readTreeOids(commit.treeOid);
    const receiptBlob = treeOids['receipt.cbor'];
    persistence.readBlob = async (oid) => {
      if (oid === receiptBlob) {
        throw new Error('blob read failed');
      }
      return originalReadBlob(oid);
    };

    const verifier = createVerifier(persistence);
    const result = await verifier.verifyChain('events', 'alice');

    expect(result.status).toBe('ERROR');
    expect(result.errors.some((e) => e.code === 'MISSING_RECEIPT_BLOB')).toBe(true);
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
