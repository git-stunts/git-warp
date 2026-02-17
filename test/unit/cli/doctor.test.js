import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CODES } from '../../../bin/cli/commands/doctor/codes.js';
import { DOCTOR_EXIT_CODES } from '../../../bin/cli/commands/doctor/types.js';
import { checkCoverageComplete, checkClockSkew, checkRefsConsistent } from '../../../bin/cli/commands/doctor/checks.js';

// Mock shared.js to avoid real git operations
vi.mock('../../../bin/cli/shared.js', () => ({
  createPersistence: vi.fn(),
  resolveGraphName: vi.fn(),
  createHookInstaller: vi.fn(),
}));

// Mock HealthCheckService
vi.mock('../../../src/domain/services/HealthCheckService.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    getHealth: vi.fn().mockResolvedValue({
      status: 'healthy',
      components: { repository: { status: 'healthy', latencyMs: 1 } },
    }),
  })),
}));

// Mock ClockAdapter
vi.mock('../../../src/infrastructure/adapters/ClockAdapter.js', () => ({
  default: { global: vi.fn().mockReturnValue({}) },
}));

const _shared = await import('../../../bin/cli/shared.js');
const createPersistence = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (_shared.createPersistence));
const resolveGraphName = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (_shared.resolveGraphName));
const createHookInstaller = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (_shared.createHookInstaller));

/**
 * Builds a mock persistence object that simulates a healthy graph
 * with a single writer "alice".
 */
function buildMockPersistence() {
  return {
    ping: vi.fn().mockResolvedValue({ ok: true }),
    readRef: vi.fn().mockImplementation((/** @type {string} */ ref) => {
      if (ref.includes('writers/alice')) {
        return Promise.resolve('aaaa000000000000000000000000000000000000');
      }
      if (ref.includes('checkpoints/head')) {
        return Promise.resolve('bbbb000000000000000000000000000000000000');
      }
      if (ref.includes('coverage/head')) {
        return Promise.resolve('cccc000000000000000000000000000000000000');
      }
      return Promise.resolve(null);
    }),
    listRefs: vi.fn().mockImplementation((/** @type {string} */ prefix) => {
      if (prefix.includes('writers/')) {
        return Promise.resolve([`${prefix}alice`]);
      }
      if (prefix.includes('audit/')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
    nodeExists: vi.fn().mockResolvedValue(true),
    isAncestor: vi.fn().mockResolvedValue(true),
    getNodeInfo: vi.fn().mockResolvedValue({
      sha: 'bbbb000000000000000000000000000000000000',
      date: new Date().toISOString(),
      author: 'Test',
      message: '',
      parents: [],
    }),
    plumbing: {},
  };
}

/** @type {import('../../../bin/cli/types.js').CliOptions} */
const CLI_OPTIONS = /** @type {*} */ ({
  repo: '/tmp/test',
  graph: 'demo',
  json: true,
  ndjson: false,
  view: null,
  writer: 'cli',
  help: false,
});

describe('doctor command', () => {
  /** @type {Function} */
  let handleDoctor;
  /** @type {ReturnType<typeof buildMockPersistence>} */
  let mockPersistence;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPersistence = buildMockPersistence();

    createPersistence.mockResolvedValue({ persistence: mockPersistence });
    resolveGraphName.mockResolvedValue('demo');
    createHookInstaller.mockReturnValue({
      getHookStatus: vi.fn().mockReturnValue({
        installed: true,
        current: true,
        version: '10.8.0',
        hookPath: '/tmp/test/.git/hooks/post-merge',
      }),
    });

    // ESM caches the module after first import; vi.mock hoisting ensures mocks are in place
    const mod = await import('../../../bin/cli/commands/doctor/index.js');
    handleDoctor = mod.default;
  });

  it('produces valid payload for a healthy graph', async () => {
    const result = await handleDoctor({ options: CLI_OPTIONS, args: [] });
    /** @type {import('../../../bin/cli/commands/doctor/types.js').DoctorPayload} */
    const payload = result.payload;
    const { exitCode } = result;

    // Exit code
    expect(exitCode).toBe(DOCTOR_EXIT_CODES.OK);

    // Top-level fields
    expect(payload.doctorVersion).toBe(1);
    expect(payload.graph).toBe('demo');
    expect(payload.repo).toBe('/tmp/test');
    expect(payload.health).toBe('ok');
    expect(typeof payload.checkedAt).toBe('string');
    expect(typeof payload.durationMs).toBe('number');

    // Policy echo
    expect(payload.policy.strict).toBe(false);
    expect(payload.policy.clockSkewMs).toBe(300_000);
    expect(payload.policy.checkpointMaxAgeHours).toBe(168);
    expect(payload.policy.globalDeadlineMs).toBe(10_000);

    // Summary
    expect(payload.summary.checksRun).toBe(7);
    expect(payload.summary.fail).toBe(0);
    expect(payload.summary.warn).toBe(0);
    expect(payload.summary.ok).toBeGreaterThanOrEqual(1);
    expect(payload.summary.priorityActions).toEqual([]);

    // Findings: all should be ok
    for (const f of payload.findings) {
      expect(f.status).toBe('ok');
      expect(f.id).toBeTruthy();
      expect(f.code).toBeTruthy();
      expect(f.impact).toBeTruthy();
      expect(f.message).toBeTruthy();
    }

    // Check that known codes are used
    const codes = payload.findings.map((/** @type {*} */ f) => f.code);
    expect(codes).toContain(CODES.REPO_OK);
    expect(codes).toContain(CODES.REFS_OK);
    expect(codes).toContain(CODES.COVERAGE_OK);
    expect(codes).toContain(CODES.CHECKPOINT_OK);
    expect(codes).toContain(CODES.HOOKS_OK);
    expect(codes).toContain(CODES.CLOCK_SYNCED);
    expect(codes).toContain(CODES.AUDIT_OK);
  });

  it('returns exit 3 when warnings are present', async () => {
    // Remove checkpoint to trigger warning
    mockPersistence.readRef.mockImplementation((/** @type {string} */ ref) => {
      if (ref.includes('writers/alice')) {
        return Promise.resolve('aaaa000000000000000000000000000000000000');
      }
      if (ref.includes('coverage/head')) {
        return Promise.resolve('cccc000000000000000000000000000000000000');
      }
      return Promise.resolve(null);
    });

    const result = await handleDoctor({ options: CLI_OPTIONS, args: [] });

    expect(result.exitCode).toBe(DOCTOR_EXIT_CODES.FINDINGS);
    expect(result.payload.health).toBe('degraded');
    expect(result.payload.summary.warn).toBeGreaterThan(0);

    const checkpointFinding = result.payload.findings.find(
      (/** @type {*} */ f) => f.code === CODES.CHECKPOINT_MISSING,
    );
    expect(checkpointFinding).toBeDefined();
    expect(checkpointFinding.status).toBe('warn');
  });

  it('returns exit 4 in strict mode with warnings', async () => {
    mockPersistence.readRef.mockImplementation((/** @type {string} */ ref) => {
      if (ref.includes('writers/alice')) {
        return Promise.resolve('aaaa000000000000000000000000000000000000');
      }
      if (ref.includes('coverage/head')) {
        return Promise.resolve('cccc000000000000000000000000000000000000');
      }
      return Promise.resolve(null);
    });

    const result = await handleDoctor({ options: CLI_OPTIONS, args: ['--strict'] });
    expect(result.exitCode).toBe(DOCTOR_EXIT_CODES.STRICT_FINDINGS);
  });

  it('sorts findings by status > impact > id', async () => {
    // Targeted mock: only break nodeExists for writer refs so that
    // checkRefsConsistent emits a fail, without accidentally affecting
    // other checks (e.g. probeAuditRefs dangling detection).
    mockPersistence.nodeExists.mockImplementation(
      (/** @type {string} */ sha) => Promise.resolve(sha !== 'aaaa000000000000000000000000000000000000'),
    );

    // Also remove checkpoint to add a warn finding, giving us all three statuses.
    mockPersistence.readRef.mockImplementation((/** @type {string} */ ref) => {
      if (ref.includes('writers/alice')) {
        return Promise.resolve('aaaa000000000000000000000000000000000000');
      }
      if (ref.includes('coverage/head')) {
        return Promise.resolve('cccc000000000000000000000000000000000000');
      }
      return Promise.resolve(null);
    });

    const result = await handleDoctor({ options: CLI_OPTIONS, args: [] });
    const findings = result.payload.findings;

    // Precondition: the mocks must produce all three status tiers.
    const statuses = findings.map((/** @type {*} */ f) => f.status);
    expect(statuses).toContain('fail');
    expect(statuses).toContain('warn');
    expect(statuses).toContain('ok');

    // Assert full three-key sort invariant: (status, impact, id) ascending.
    /** @type {Record<string, number>} */
    const STATUS_ORDER = { fail: 0, warn: 1, ok: 2 };
    /** @type {Record<string, number>} */
    const IMPACT_ORDER = { data_integrity: 0, security: 1, operability: 2, hygiene: 3 };
    for (let i = 1; i < findings.length; i++) {
      const a = /** @type {*} */ (findings[i - 1]);
      const b = /** @type {*} */ (findings[i]);
      const statusCmp = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (statusCmp !== 0) {
        expect(statusCmp).toBeLessThan(0);
        continue;
      }
      const impactCmp = (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9);
      if (impactCmp !== 0) {
        expect(impactCmp).toBeLessThan(0);
        continue;
      }
      expect(a.id.localeCompare(b.id)).toBeLessThanOrEqual(0);
    }
  });
});

describe('individual check guards', () => {
  it('checkCoverageComplete treats null-sha writer heads as missing', async () => {
    const ctx = /** @type {*} */ ({
      graphName: 'demo',
      writerHeads: [
        { writerId: 'alice', sha: null, ref: 'refs/warp/demo/writers/alice' },
      ],
      persistence: {
        readRef: vi.fn().mockResolvedValue('cccc000000000000000000000000000000000000'),
        isAncestor: vi.fn(),
      },
    });

    const finding = /** @type {*} */ (await checkCoverageComplete(ctx));

    expect(finding.code).toBe(CODES.COVERAGE_MISSING_WRITERS);
    expect(finding.evidence.missingWriters).toContain('alice');
    // isAncestor must NOT have been called with null
    expect(ctx.persistence.isAncestor).not.toHaveBeenCalled();
  });

  it('checkClockSkew skips null-sha writer heads in collectWriterDates', async () => {
    const ctx = /** @type {*} */ ({
      graphName: 'demo',
      writerHeads: [
        { writerId: 'alice', sha: null, ref: 'refs/warp/demo/writers/alice' },
        { writerId: 'bob', sha: 'bbbb000000000000000000000000000000000000', ref: 'refs/warp/demo/writers/bob' },
      ],
      policy: { clockSkewMs: 300_000 },
      persistence: {
        getNodeInfo: vi.fn().mockResolvedValue({
          sha: 'bbbb000000000000000000000000000000000000',
          date: new Date().toISOString(),
          author: 'Test',
          message: '',
          parents: [],
        }),
      },
    });

    const finding = await checkClockSkew(ctx);

    // Should not have called getNodeInfo with null
    expect(ctx.persistence.getNodeInfo).not.toHaveBeenCalledWith(null);
    // Only one writer had valid data, so skew check is skipped (< 2 writers)
    expect(finding.code).toBe(CODES.CLOCK_SYNCED);
  });

  it('checkRefsConsistent reports null-sha heads as dangling', async () => {
    const ctx = /** @type {*} */ ({
      writerHeads: [
        { writerId: 'alice', sha: 'aaaa000000000000000000000000000000000000', ref: 'refs/warp/demo/writers/alice' },
        { writerId: 'bob', sha: null, ref: 'refs/warp/demo/writers/bob' },
      ],
      persistence: {
        nodeExists: vi.fn().mockResolvedValue(true),
      },
    });

    const findings = /** @type {*[]} */ (await checkRefsConsistent(ctx));

    // bob's null sha should produce a REFS_DANGLING_OBJECT finding
    const dangling = findings.find((/** @type {*} */ f) => f.code === CODES.REFS_DANGLING_OBJECT);
    expect(dangling).toBeDefined();
    expect(dangling.status).toBe('fail');
    expect(dangling.ref || dangling.evidence?.ref).toBeTruthy();

    // No OK finding because allOk is false
    const ok = findings.find((/** @type {*} */ f) => f.code === CODES.REFS_OK);
    expect(ok).toBeUndefined();

    // nodeExists should NOT have been called with null
    expect(ctx.persistence.nodeExists).not.toHaveBeenCalledWith(null);
  });
});
