import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CODES } from '../../../bin/cli/commands/doctor/codes.ts';
import { DOCTOR_EXIT_CODES } from '../../../bin/cli/commands/doctor/types.ts';
import {
  checkCoverageComplete,
  checkClockSkew,
  checkRefsConsistent,
} from '../../../bin/cli/commands/doctor/checks.ts';
import WarpStateCacheRetentionReport from '../../../src/domain/services/state/WarpStateCacheRetentionReport.ts';
import WarpStateCacheRepairResult from '../../../src/domain/services/state/WarpStateCacheRepairResult.ts';

// Mock shared.js to avoid real git operations
vi.mock('../../../bin/cli/shared.ts', () => ({
  createPersistence: vi.fn(),
  resolveGraphName: vi.fn(),
  createHookInstaller: vi.fn(),
}));

// Mock HealthCheckService
vi.mock('../../../src/domain/services/HealthCheckService.ts', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      getHealth: vi.fn().mockResolvedValue({
        status: 'healthy',
        components: { repository: { status: 'healthy', latencyMs: 1 } },
      }),
    };
  }),
}));

// Mock ClockAdapter
vi.mock('../../../src/infrastructure/adapters/ClockAdapter.ts', () => ({
  default: { global: vi.fn().mockReturnValue({}) },
}));

const _shared = await import('../../../bin/cli/shared.ts');
const createPersistence = _shared.createPersistence as unknown as any;
const resolveGraphName = _shared.resolveGraphName as unknown as any;
const createHookInstaller = _shared.createHookInstaller as unknown as any;

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

const CLI_OPTIONS = {
  repo: '/tmp/test',
  graph: 'demo',
  json: true,
  ndjson: false,
  view: null,
  writer: 'cli',
  help: false,
} as any;

describe('doctor command', () => {
  let handleDoctor;
  let mockPersistence;
  let mockRuntimeStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPersistence = buildMockPersistence();
    mockRuntimeStorage = {
      createRuntimeStorageServices: vi.fn().mockResolvedValue({}),
    };

    createPersistence.mockResolvedValue({
      persistence: mockPersistence,
      runtimeStorage: mockRuntimeStorage,
      hookPaths: {},
    });
    resolveGraphName.mockResolvedValue('demo');
    createHookInstaller.mockReturnValue({
      getHookStatus: vi.fn().mockResolvedValue({
        installed: true,
        current: true,
        version: '10.8.0',
        hookPath: '/tmp/test/.git/hooks/post-merge',
      }),
    });

    // ESM caches the module after first import; vi.mock hoisting ensures mocks are in place
    const mod = await import('../../../bin/cli/commands/doctor/index.ts');
    handleDoctor = mod.default;
  });

  it('produces valid payload for a healthy graph', async () => {
    const result = await handleDoctor({ options: CLI_OPTIONS, args: [] });
    const payload = result.payload as any;
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
      (/** @type {*} */ f) => f.code === CODES.CHECKPOINT_MISSING
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

  it('reports memory-budget posture for large-graph doctor runs', async () => {
    const result = await handleDoctor({
      options: CLI_OPTIONS,
      args: ['--memory-budget', '64mb', '--large-graph'],
    });
    const finding = result.payload.findings.find(
      (/** @type {*} */ f) => f.code === CODES.MEMORY_BUDGET_REPORT
    );

    expect(result.exitCode).toBe(DOCTOR_EXIT_CODES.OK);
    expect(result.payload.summary.checksRun).toBe(8);
    expect(finding).toBeDefined();
    expect(finding?.status).toBe('ok');
    expect(finding?.evidence).toMatchObject({
      requestedBudget: '64mb',
      largeGraph: true,
      safe: ['memory-budget-contract'],
      transitional: ['checkpoint-tail-optics'],
      diagnostic: ['graph-wide-materialization'],
      legacy: ['legacy-query-arrays'],
    });
  });

  it('repairs state-cache roots before checking their resulting health', async () => {
    const before = new WarpStateCacheRetentionReport({
      liveSnapshotIds: ['snapshot-a'],
      anchoredSnapshotIds: [],
      unanchoredSnapshotIds: ['snapshot-a'],
      missingSnapshotIds: [],
      wrongTypeSnapshotIds: [],
      staleRootNames: [],
      mismatchedRootNames: [],
      rootSetError: null,
    });
    const after = new WarpStateCacheRetentionReport({
      liveSnapshotIds: ['snapshot-a'],
      anchoredSnapshotIds: ['snapshot-a'],
      unanchoredSnapshotIds: [],
      missingSnapshotIds: [],
      wrongTypeSnapshotIds: [],
      staleRootNames: [],
      mismatchedRootNames: [],
      rootSetError: null,
    });
    const repairResult = new WarpStateCacheRepairResult({
      before,
      after,
      anchoredSnapshotIds: ['snapshot-a'],
      unrecoverableSnapshotIds: [],
      removedStaleRootNames: [],
    });
    const repairRetention = vi.fn().mockResolvedValue(repairResult);
    const inspectRetention = vi.fn().mockResolvedValue(after);
    mockRuntimeStorage.createRuntimeStorageServices.mockResolvedValue({
      stateSnapshots: {
        repairRetention,
        inspectRetention,
        resolveCheckpointHead: vi.fn().mockResolvedValue(null),
      },
    });

    const result = await handleDoctor({
      options: CLI_OPTIONS,
      args: ['--repair-state-cache'],
    });

    expect(repairRetention).toHaveBeenCalledOnce();
    expect(inspectRetention).toHaveBeenCalledOnce();
    expect(result.payload.findings.map((finding) => finding.code)).toContain(
      CODES.STATE_CACHE_RETENTION_REPAIRED
    );
  });

  it('reports a failed state-cache repair without aborting doctor', async () => {
    const healthy = new WarpStateCacheRetentionReport({
      liveSnapshotIds: [],
      anchoredSnapshotIds: [],
      unanchoredSnapshotIds: [],
      missingSnapshotIds: [],
      wrongTypeSnapshotIds: [],
      staleRootNames: [],
      mismatchedRootNames: [],
      rootSetError: null,
    });
    mockRuntimeStorage.createRuntimeStorageServices.mockResolvedValue({
      stateSnapshots: {
        repairRetention: vi.fn().mockRejectedValue(new Error('root set unavailable')),
        inspectRetention: vi.fn().mockResolvedValue(healthy),
        resolveCheckpointHead: vi.fn().mockResolvedValue(null),
      },
    });

    const result = await handleDoctor({
      options: CLI_OPTIONS,
      args: ['--repair-state-cache'],
    });

    expect(result.payload.findings).toContainEqual(
      expect.objectContaining({
        id: 'state-cache-retention-repair',
        status: 'fail',
        code: CODES.CHECK_INTERNAL_ERROR,
      })
    );
  });

  it('sorts findings by status > impact > id', async () => {
    // Targeted mock: only break nodeExists for writer refs so that
    // checkRefsConsistent emits a fail, without accidentally affecting
    // other checks (e.g. probeAuditRefs dangling detection).
    mockPersistence.nodeExists.mockImplementation((/** @type {string} */ sha) =>
      Promise.resolve(sha !== 'aaaa000000000000000000000000000000000000')
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
    const STATUS_ORDER = { fail: 0, warn: 1, ok: 2 } as Record<string, number>;
    const IMPACT_ORDER = { data_integrity: 0, security: 1, operability: 2, hygiene: 3 } as Record<
      string,
      number
    >;
    for (let i = 1; i < findings.length; i++) {
      const a = findings[i - 1] as any;
      const b = findings[i] as any;
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
    const ctx = {
      graphName: 'demo',
      writerHeads: [{ writerId: 'alice', sha: null, ref: 'refs/warp/demo/writers/alice' }],
      persistence: {
        readRef: vi.fn().mockResolvedValue('cccc000000000000000000000000000000000000'),
        isAncestor: vi.fn(),
      },
    } as any;

    const finding = (await checkCoverageComplete(ctx)) as any;

    expect(finding.code).toBe(CODES.COVERAGE_MISSING_WRITERS);
    expect(finding.evidence.missingWriters).toContain('alice');
    // isAncestor must NOT have been called with null
    expect(ctx.persistence.isAncestor).not.toHaveBeenCalled();
  });

  it('checkClockSkew skips null-sha writer heads in collectWriterDates', async () => {
    const ctx = {
      graphName: 'demo',
      writerHeads: [
        { writerId: 'alice', sha: null, ref: 'refs/warp/demo/writers/alice' },
        {
          writerId: 'bob',
          sha: 'bbbb000000000000000000000000000000000000',
          ref: 'refs/warp/demo/writers/bob',
        },
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
    } as any;

    const finding = await checkClockSkew(ctx);

    // Should not have called getNodeInfo with null
    expect(ctx.persistence.getNodeInfo).not.toHaveBeenCalledWith(null);
    // Only one writer had valid data, so skew check is skipped (< 2 writers)
    expect(finding.code).toBe(CODES.CLOCK_SYNCED);
  });

  it('checkRefsConsistent reports null-sha heads as dangling', async () => {
    const ctx = {
      writerHeads: [
        {
          writerId: 'alice',
          sha: 'aaaa000000000000000000000000000000000000',
          ref: 'refs/warp/demo/writers/alice',
        },
        { writerId: 'bob', sha: null, ref: 'refs/warp/demo/writers/bob' },
      ],
      persistence: {
        nodeExists: vi.fn().mockResolvedValue(true),
      },
    } as any;

    const findings = (await checkRefsConsistent(ctx)) as any[];

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
