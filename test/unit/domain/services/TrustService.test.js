import { describe, it, expect, vi, beforeEach } from 'vitest';
import TrustService from '../../../../src/domain/services/TrustService.js';
import TrustError from '../../../../src/domain/errors/TrustError.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * @returns {import('../../../../src/domain/services/TrustSchema.js').TrustConfig}
 */
function validConfig(/** @type {Record<string, unknown>} */ overrides = {}) {
  return /** @type {*} */ ({
    version: 1,
    trustedWriters: ['alice', 'bob'],
    policy: 'any',
    epoch: '2025-01-01T00:00:00.000Z',
    requiredSignatures: null,
    allowedSignersPath: null,
    ...overrides,
  });
}

/** Creates a mock persistence adapter with trust blob pipeline support. */
function createMockPersistence() {
  /** @type {Map<string, string>} */
  const refs = new Map();
  /** @type {Map<string, Buffer>} */
  const blobs = new Map();
  /** @type {Map<string, Record<string, string>>} */
  const trees = new Map();
  /** @type {Map<string, { treeOid: string, parents: string[], message: string, date: string }>} */
  const commits = new Map();

  let oidCounter = 0;
  function nextOid() {
    return (++oidCounter).toString(16).padStart(40, '0');
  }

  return {
    refs,
    blobs,
    trees,
    commits,
    readRef: vi.fn(async (/** @type {string} */ ref) => refs.get(ref) || null),
    writeBlob: vi.fn(async (/** @type {Buffer|string} */ content) => {
      const oid = nextOid();
      blobs.set(oid, Buffer.isBuffer(content) ? content : Buffer.from(String(content)));
      return oid;
    }),
    writeTree: vi.fn(async (/** @type {string[]} */ entries) => {
      const oid = nextOid();
      /** @type {Record<string, string>} */
      const treeEntries = {};
      for (const entry of entries) {
        const match = entry.match(/^\d+ blob (\S+)\t(.+)$/);
        if (match) {
          treeEntries[match[2]] = match[1];
        }
      }
      trees.set(oid, treeEntries);
      return oid;
    }),
    commitNodeWithTree: vi.fn(async (/** @type {{ treeOid: string, parents: string[], message: string }} */ opts) => {
      const oid = nextOid();
      commits.set(oid, { treeOid: opts.treeOid, parents: opts.parents, message: opts.message, date: '2025-01-01T00:00:00Z' });
      return oid;
    }),
    compareAndSwapRef: vi.fn(async (/** @type {string} */ ref, /** @type {string} */ newOid, /** @type {string|null} */ expectedOid) => {
      const current = refs.get(ref) || null;
      if (current !== expectedOid) {
        throw new Error(`CAS mismatch: expected ${expectedOid}, got ${current}`);
      }
      refs.set(ref, newOid);
    }),
    getCommitTree: vi.fn(async (/** @type {string} */ sha) => {
      const commit = commits.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
      return commit.treeOid;
    }),
    readTreeOids: vi.fn(async (/** @type {string} */ treeOid) => {
      const tree = trees.get(treeOid);
      if (!tree) {
        throw new Error(`Tree not found: ${treeOid}`);
      }
      return tree;
    }),
    readBlob: vi.fn(async (/** @type {string} */ oid) => {
      const blob = blobs.get(oid);
      if (!blob) {
        throw new Error(`Blob not found: ${oid}`);
      }
      return blob;
    }),
    getNodeInfo: vi.fn(async (/** @type {string} */ sha) => {
      const commit = commits.get(sha);
      if (!commit) {
        throw new Error(`Commit not found: ${sha}`);
      }
      return { sha, message: commit.message, author: 'test', date: commit.date, parents: commit.parents };
    }),
    listRefs: vi.fn(async () => []),
    updateRef: vi.fn(async () => {}),
  };
}

// ============================================================================
// readTrustConfig
// ============================================================================

describe('TrustService — readTrustConfig', () => {
  it('returns null when trust ref does not exist', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    const result = await service.readTrustConfig();
    expect(result).toBeNull();
  });

  it('reads and parses a valid trust config', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });

    // Seed a trust commit manually
    await service.initTrust(validConfig());

    const result = await service.readTrustConfig();
    expect(result).not.toBeNull();
    expect(result?.config.version).toBe(1);
    expect(result?.config.trustedWriters).toEqual(['alice', 'bob']);
    expect(result?.config.policy).toBe('any');
    expect(result?.commitSha).toBeTruthy();
  });
});

// ============================================================================
// readTrustConfigAtCommit
// ============================================================================

describe('TrustService — readTrustConfigAtCommit', () => {
  it('reads config at a valid pinned commit', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    const { commitSha } = await service.initTrust(validConfig());

    const result = await service.readTrustConfigAtCommit(commitSha);
    expect(result.config.trustedWriters).toEqual(['alice', 'bob']);
    expect(result.commitSha).toBe(commitSha);
  });

  it('throws E_TRUST_PIN_INVALID for nonexistent commit', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });

    await expect(
      service.readTrustConfigAtCommit('0'.repeat(40)),
    ).rejects.toMatchObject({ code: 'E_TRUST_PIN_INVALID' });
  });

  it('throws E_TRUST_PIN_INVALID with context', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });

    try {
      await service.readTrustConfigAtCommit('0'.repeat(40));
      expect.unreachable('should have thrown');
    } catch (/** @type {*} */ err) {
      expect(err.code).toBe('E_TRUST_PIN_INVALID');
      expect(err.context.sha).toBe('0'.repeat(40));
    }
  });
});

// ============================================================================
// initTrust
// ============================================================================

describe('TrustService — initTrust', () => {
  it('creates genesis commit and sets ref', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    const { commitSha } = await service.initTrust(validConfig());

    expect(commitSha).toBeTruthy();
    expect(persistence.refs.get('refs/warp/demo/trust/root')).toBe(commitSha);
  });

  it('throws E_TRUST_REF_CONFLICT on double init', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());

    await expect(
      service.initTrust(validConfig()),
    ).rejects.toMatchObject({ code: 'E_TRUST_REF_CONFLICT' });
  });

  it('E_TRUST_REF_CONFLICT includes recovery hints', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());

    try {
      await service.initTrust(validConfig());
      expect.unreachable('should have thrown');
    } catch (/** @type {*} */ err) {
      expect(err.code).toBe('E_TRUST_REF_CONFLICT');
      expect(err.message).toContain('readTrustConfig()');
    }
  });
});

// ============================================================================
// initFromWriters
// ============================================================================

describe('TrustService — initFromWriters', () => {
  it('sorts and dedupes writer IDs before write', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initFromWriters(['charlie', 'alice', 'bob', 'alice']);

    const result = await service.readTrustConfig();
    expect(result?.config.trustedWriters).toEqual(['alice', 'bob', 'charlie']);
    expect(result?.config.policy).toBe('any');
  });

  it('trims and filters empty IDs', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initFromWriters(['  alice  ', '', '  ', 'bob']);

    const result = await service.readTrustConfig();
    expect(result?.config.trustedWriters).toEqual(['alice', 'bob']);
  });
});

// ============================================================================
// updateTrust
// ============================================================================

describe('TrustService — updateTrust', () => {
  /** @type {ReturnType<typeof createMockPersistence>} */
  let persistence;
  /** @type {TrustService} */
  let service;

  beforeEach(async () => {
    persistence = createMockPersistence();
    service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());
  });

  it('updates config and returns attestation receipt', async () => {
    /** @type {*} */
    const receipt = await service.updateTrust(
      validConfig({ trustedWriters: ['alice', 'bob', 'charlie'], epoch: '2025-06-01T00:00:00.000Z' }),
      'admin',
    );

    expect(receipt.newCommit).toBeTruthy();
    expect(receipt.previousCommit).toBeTruthy();
    expect(receipt.actor).toBe('admin');
    expect(receipt.changeSummary.added).toEqual(['charlie']);
    expect(receipt.changeSummary.removed).toEqual([]);
    expect(receipt.configVersion).toBe(1);
  });

  it('tracks removed writers in change summary', async () => {
    /** @type {*} */
    const receipt = await service.updateTrust(
      validConfig({ trustedWriters: ['alice'], epoch: '2025-06-01T00:00:00.000Z' }),
      'admin',
    );

    expect(receipt.changeSummary.added).toEqual([]);
    expect(receipt.changeSummary.removed).toEqual(['bob']);
  });

  it('throws E_TRUST_NOT_CONFIGURED when ref does not exist', async () => {
    const freshPersistence = createMockPersistence();
    const freshService = new TrustService({ persistence: freshPersistence, graphName: 'demo' });

    await expect(
      freshService.updateTrust(validConfig(), 'admin'),
    ).rejects.toMatchObject({ code: 'E_TRUST_NOT_CONFIGURED' });
  });

  it('throws E_TRUST_EPOCH_REGRESSION on older epoch', async () => {
    await expect(
      service.updateTrust(
        validConfig({ epoch: '2024-01-01T00:00:00.000Z' }),
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'E_TRUST_EPOCH_REGRESSION' });
  });

  it('throws E_TRUST_REF_CONFLICT on CAS mismatch', async () => {
    // Simulate concurrent update: make CAS fail by overriding compareAndSwapRef
    persistence.compareAndSwapRef.mockImplementationOnce(async () => {
      throw new Error('CAS mismatch');
    });

    await expect(
      service.updateTrust(
        validConfig({ epoch: '2025-06-01T00:00:00.000Z' }),
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'E_TRUST_REF_CONFLICT' });
  });
});

// ============================================================================
// evaluateWriters (pure function)
// ============================================================================

describe('TrustService — evaluateWriters', () => {
  /** @type {TrustService} */
  let service;

  beforeEach(() => {
    service = new TrustService({ persistence: createMockPersistence(), graphName: 'demo' });
  });

  it('classifies trusted writers correctly', () => {
    const result = service.evaluateWriters(
      ['alice', 'bob'],
      validConfig(),
    );

    expect(result.evaluatedWriters).toEqual(['alice', 'bob']);
    expect(result.untrustedWriters).toEqual([]);
    expect(result.explanations).toHaveLength(2);
    expect(result.explanations[0].trusted).toBe(true);
  });

  it('allows unknown writers with policy=any', () => {
    const result = service.evaluateWriters(
      ['alice', 'unknown'],
      validConfig(),
    );

    expect(result.evaluatedWriters).toEqual(['alice', 'unknown']);
    expect(result.untrustedWriters).toEqual([]);
  });

  it('rejects unknown writers with all_writers_must_be_trusted', () => {
    const result = service.evaluateWriters(
      ['alice', 'unknown'],
      validConfig({ policy: 'all_writers_must_be_trusted' }),
    );

    expect(result.evaluatedWriters).toEqual(['alice']);
    expect(result.untrustedWriters).toEqual(['unknown']);
    const unknownExpl = result.explanations.find((e) => e.writerId === 'unknown');
    expect(unknownExpl?.reason).toContain('policy requires trust');
  });

  it('returns sorted evaluatedWriters and untrustedWriters', () => {
    const result = service.evaluateWriters(
      ['charlie', 'alice', 'bob'],
      validConfig({ policy: 'all_writers_must_be_trusted' }),
    );

    expect(result.evaluatedWriters).toEqual(['alice', 'bob']);
    expect(result.untrustedWriters).toEqual(['charlie']);
  });

  it('is pure — no env reads', () => {
    // evaluateWriters takes explicit config, doesn't read process.env
    const config = validConfig();
    const result1 = service.evaluateWriters(['alice'], config);
    const result2 = service.evaluateWriters(['alice'], config);
    expect(result1).toEqual(result2);
  });
});

// ============================================================================
// getTrustHistory
// ============================================================================

describe('TrustService — getTrustHistory', () => {
  it('returns empty array when no trust ref', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    const history = await service.getTrustHistory();
    expect(history).toEqual([]);
  });

  it('walks trust history from tip to genesis', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());
    await service.updateTrust(
      validConfig({ trustedWriters: ['alice', 'bob', 'charlie'], epoch: '2025-06-01T00:00:00.000Z' }),
      'admin',
    );

    const history = await service.getTrustHistory();
    expect(history).toHaveLength(2);
    expect(history[0].config.trustedWriters).toContain('charlie');
    expect(history[1].config.trustedWriters).not.toContain('charlie');
  });

  it('respects maxWalk limit', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());
    await service.updateTrust(
      validConfig({ epoch: '2025-02-01T00:00:00.000Z' }),
      'admin',
    );
    await service.updateTrust(
      validConfig({ epoch: '2025-03-01T00:00:00.000Z' }),
      'admin',
    );

    const history = await service.getTrustHistory({ maxWalk: 2 });
    expect(history).toHaveLength(2);
  });
});

// ============================================================================
// diagnose
// ============================================================================

describe('TrustService — diagnose', () => {
  it('reports TRUST_REF_MISSING when ref absent', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    const findings = await service.diagnose();
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('TRUST_REF_MISSING');
    expect(findings[0].status).toBe('fail');
  });

  it('reports TRUST_WRITERS_EMPTY when writer list empty', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig({ trustedWriters: [] }));

    const findings = await service.diagnose();
    const empty = findings.find((f) => f.id === 'TRUST_WRITERS_EMPTY');
    expect(empty).toBeTruthy();
    expect(empty?.status).toBe('warn');
  });

  it('reports all OK for healthy trust config', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());

    const findings = await service.diagnose();
    const statuses = findings.map((f) => f.status);
    expect(statuses.every((s) => s === 'ok')).toBe(true);
  });

  it('validates pin SHA when provided', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    const { commitSha } = await service.initTrust(validConfig());

    const findings = await service.diagnose({ pinSha: commitSha });
    const pin = findings.find((f) => f.id === 'TRUST_PIN_VALID');
    expect(pin).toBeTruthy();
    expect(pin?.status).toBe('ok');
  });

  it('reports TRUST_PIN_INVALID for bad pin', async () => {
    const persistence = createMockPersistence();
    const service = new TrustService({ persistence, graphName: 'demo' });
    await service.initTrust(validConfig());

    const findings = await service.diagnose({ pinSha: '0'.repeat(40) });
    const pin = findings.find((f) => f.id === 'TRUST_PIN_INVALID');
    expect(pin).toBeTruthy();
    expect(pin?.status).toBe('fail');
  });
});

// ============================================================================
// Error types
// ============================================================================

describe('TrustError', () => {
  it('has correct name and code', () => {
    const err = new TrustError('test', { code: 'E_TRUST_SCHEMA_INVALID' });
    expect(err.name).toBe('TrustError');
    expect(err.code).toBe('E_TRUST_SCHEMA_INVALID');
    expect(err instanceof Error).toBe(true);
  });
});
