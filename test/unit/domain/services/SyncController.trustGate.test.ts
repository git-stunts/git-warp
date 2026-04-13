import { describe, it, expect, vi, beforeEach } from 'vitest';
import SyncController from '../../../../src/domain/services/controllers/SyncController.ts';
import SyncTrustGate from '../../../../src/domain/services/sync/SyncTrustGate.js';
import SyncError from '../../../../src/domain/errors/SyncError.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { createFrontier, updateFrontier } from '../../../../src/domain/services/Frontier.ts';

vi.mock('../../../../src/domain/services/sync/SyncProtocol.js', async (importOriginal) => {
  const original = (await importOriginal() as Record<string, unknown>);
  return {
    ...original,
    applySyncResponse: vi.fn(),
  };
});

const { applySyncResponse: applySyncResponseMock } =
  /** @type {{ applySyncResponse: import('vitest').Mock }} */ (
    ((await import('../../../../src/domain/services/sync/SyncProtocol.js')) as unknown)
  );

/**
 * Creates a minimal SyncHost mock satisfying the SyncController contract.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
    const host = {
    _cachedState: null,
    _lastFrontier: null,
    _stateDirty: false,
    _patchesSinceGC: 0,
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
    },
    _clock: { now: () => 0 },
    _codec: {},
    _crypto: {},
    _logger: null,
    _patchesSinceCheckpoint: 0,
    _logTiming: vi.fn(),
    materialize: vi.fn(),
    discoverWriters: vi.fn().mockResolvedValue([]),
    _materializedGraph: null,
    _logicalIndex: null,
    _propertyReader: null,
    _cachedViewHash: null,
    _cachedIndexTree: null,
    ...overrides,
  };
  // Wire default _setMaterializedState after spread so it can reference `host`
  if (!host['_setMaterializedState']) {
    host['_setMaterializedState'] = vi.fn(async (/** @type {unknown} */ state) => {
      host['_cachedState'] = state;
      host['_stateDirty'] = false;
      host['_materializedGraph'] = { state, stateHash: 'mock-hash', adjacency: {} };
    });
  }
  return host;
}

/**
 * Builds a sync response with patches from the given writers.
 * @param {string[]} writerIds
 * @returns {{ type: 'sync-response', frontier: Record<string, string>, patches: Array<{writerId: string, sha: string, patch: {ops: never[], context: Record<string, never>, writer: string, lamport: number}}> }}
 */
function buildSyncResponse(writerIds) {
    const frontier = ({}) as Record<string, string>;
  const patches = writerIds.map((id, i) => {
    const sha = `sha-${id}-${i}`;
    frontier[id] = sha;
    return {
      writerId: id,
      sha,
      patch: { ops: ([] as never[]), context: ({} as Record<string, never>), writer: id, lamport: i + 1 },
    };
  });
  return { type: ('sync-response' as const), frontier, patches };
}

/**
 * Creates a trust evaluator mock that considers only the given writers trusted.
 * @param {string[]} trustedWriters
 * @returns {{ evaluateWriters: import('vitest').Mock }}
 */
function createTrustEvaluator(trustedWriters) {
  return {
    evaluateWriters: vi.fn().mockResolvedValue({
      trusted: new Set(trustedWriters),
    }),
  };
}

/**
 * Sets up applySyncResponseMock to return a plausible result.
 * @param {Record<string, unknown>} _host
 */
function stubApplySuccess(_host) {
  const newState = createEmptyState();
  const newFrontier = createFrontier();
  updateFrontier(newFrontier, 'applied-writer', 'sha-applied');
  applySyncResponseMock.mockReturnValue({
    state: newState,
    frontier: newFrontier,
    applied: 1,
  });
}

describe('SyncController — trust gate integration (Invariant 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 5: Unsigned request rejected ─────────────────────────────────────
  it('rejects sync with untrusted writer in enforce mode (E_SYNC_UNTRUSTED_WRITER)', async () => {
    const evaluator = createTrustEvaluator([]); // no writers trusted
    const gate = new SyncTrustGate({
      trustEvaluator: (evaluator),
      trustMode: 'enforce',
    });

    const host = createMockHost({ _cachedState: createEmptyState() });
    const ctrl = new SyncController((host), { trustGate: gate });
    const response = buildSyncResponse(['untrusted-writer']);

    await expect(ctrl.applySyncResponse(response)).rejects.toThrow(SyncError);

    try {
      await ctrl.applySyncResponse(response);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncError);
      expect((err).code).toBe('E_SYNC_UNTRUSTED_WRITER');
    }

    // applySyncResponseImpl must NOT have been called
    expect(applySyncResponseMock).not.toHaveBeenCalled();
  });

  // ── Test 6: State unchanged after rejection ───────────────────────────────
  it('leaves host state unchanged when trust gate rejects', async () => {
    const evaluator = createTrustEvaluator([]); // reject everyone
    const gate = new SyncTrustGate({
      trustEvaluator: (evaluator),
      trustMode: 'enforce',
    });

    const initialState = createEmptyState();
    const initialFrontier = createFrontier();
    updateFrontier(initialFrontier, 'alice', 'sha-a1');

    const host = createMockHost({
      _cachedState: initialState,
      _lastFrontier: initialFrontier,
      _patchesSinceGC: 5,
      _stateDirty: false,
    });

    // Snapshot references before the call
    const stateBefore = host['_cachedState'];
    const frontierBefore = host['_lastFrontier'];
    const gcBefore = host['_patchesSinceGC'];
    const dirtyBefore = host['_stateDirty'];

    const ctrl = new SyncController((host), { trustGate: gate });
    const response = buildSyncResponse(['evil-writer']);

    try {
      await ctrl.applySyncResponse(response);
    } catch {
      // expected
    }

    // All host fields must be unchanged
    expect(host['_cachedState']).toBe(stateBefore);
    expect(host['_lastFrontier']).toBe(frontierBefore);
    expect(host['_patchesSinceGC']).toBe(gcBefore);
    expect(host['_stateDirty']).toBe(dirtyBefore);
    expect(host['_materializedGraph']).toBeNull();
  });

  // ── Test 7: Trust gate modes ──────────────────────────────────────────────
  describe('trust gate modes', () => {
    it('enforce mode rejects untrusted writers', async () => {
      const gate = new SyncTrustGate({
        trustEvaluator: (createTrustEvaluator([]) as any),
        trustMode: 'enforce',
      });

      const host = createMockHost({ _cachedState: createEmptyState() });
      const ctrl = new SyncController((host), { trustGate: gate });

      await expect(ctrl.applySyncResponse(buildSyncResponse(['x'])))
        .rejects.toMatchObject({ code: 'E_SYNC_UNTRUSTED_WRITER' });
    });

    it('log-only mode warns but applies patches', async () => {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
      const gate = new SyncTrustGate({
        trustEvaluator: (createTrustEvaluator([]) as any),
        trustMode: 'log-only',
        logger: (logger),
      });

      const host = createMockHost({
        _cachedState: createEmptyState(),
        _lastFrontier: createFrontier(),
      });
      stubApplySuccess(host);

      const ctrl = new SyncController((host), { trustGate: gate });
      const result = await ctrl.applySyncResponse(buildSyncResponse(['untrusted']));

      // Patches applied despite untrusted writer
      expect(applySyncResponseMock).toHaveBeenCalledOnce();
      expect(result.applied).toBe(1);
      expect(result.writersApplied).toContain('untrusted');

      // Logger must have been called with a warning
      expect(logger.warn).toHaveBeenCalled();
    });

    it('off mode passes through without evaluation', async () => {
      const evaluator = createTrustEvaluator([]);
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'off',
      });

      const host = createMockHost({
        _cachedState: createEmptyState(),
        _lastFrontier: createFrontier(),
      });
      stubApplySuccess(host);

      const ctrl = new SyncController((host), { trustGate: gate });
      const result = await ctrl.applySyncResponse(buildSyncResponse(['anyone']));

      // Patches applied, evaluator NOT called
      expect(applySyncResponseMock).toHaveBeenCalledOnce();
      expect(result.applied).toBe(1);
      expect(evaluator.evaluateWriters).not.toHaveBeenCalled();
    });
  });

  // ── Test 8: writersApplied uses patch authors, not frontier keys ──────────
  it('trust gate receives patch authors (writersApplied), not frontier keys', async () => {
    const evaluator = createTrustEvaluator(['C']); // only C is trusted
    const gate = new SyncTrustGate({
      trustEvaluator: (evaluator),
      trustMode: 'enforce',
    });

    // Frontier claims writers A and B, but patches come from C
    const response = {
      type: ('sync-response' as const),
      frontier: { A: 'sha-A', B: 'sha-B' },
      patches: [
        { writerId: 'C', sha: 'sha-C-0', patch: { ops: [], context: {}, writer: 'C', lamport: 1 } },
      ],
    };

    const host = createMockHost({
      _cachedState: createEmptyState(),
      _lastFrontier: createFrontier(),
    });
    stubApplySuccess(host);

    const ctrl = new SyncController((host), { trustGate: gate });
    const result = await ctrl.applySyncResponse(response);

    // Trust evaluator received ['C'], not ['A', 'B']
    expect(evaluator.evaluateWriters).toHaveBeenCalledWith(['C']);
    expect(result.writersApplied).toEqual(['C']);

    // Patches were applied (C is trusted)
    expect(applySyncResponseMock).toHaveBeenCalledOnce();
  });

  it('syncWith() can use a per-call trust override via the public host hook', async () => {
    const host = createMockHost({
      _cachedState: createEmptyState(),
      _lastFrontier: createFrontier(),
      _createSyncTrustGate: vi.fn((trust) => new SyncTrustGate({
        trustEvaluator: (createTrustEvaluator([]) as any),
        trustMode: trust?.mode || 'off',
      })),
    });
    const ctrl = new SyncController((host));
    const remotePeer = {
      processSyncRequest: vi.fn().mockResolvedValue(buildSyncResponse(['mallory'])),
    };

    await expect(ctrl.syncWith((remotePeer), {
      trust: { mode: 'enforce', pin: 'abc123' },
    })).rejects.toMatchObject({ code: 'E_SYNC_UNTRUSTED_WRITER' });

    expect(host['_createSyncTrustGate']).toHaveBeenCalledWith({
      mode: 'enforce',
      pin: 'abc123',
    });
    expect(applySyncResponseMock).not.toHaveBeenCalled();
  });

  // ── Test 9: Derived caches rebuilt after successful sync (B105) ───────────
  it('rebuilds derived caches via _setMaterializedState after successful applySyncResponse', async () => {
    const host = createMockHost({
      _cachedState: createEmptyState(),
      _lastFrontier: createFrontier(),
      _materializedGraph: { fake: 'graph' },
      _logicalIndex: { fake: 'index' },
      _propertyReader: { fake: 'reader' },
      _cachedViewHash: 'abc123',
      _cachedIndexTree: { fake: 'tree' },
    });
    stubApplySuccess(host);

    // No trust gate — simple success path
    const ctrl = new SyncController((host));
    await ctrl.applySyncResponse(buildSyncResponse(['writer-a']));

    // _setMaterializedState should have been called to rebuild caches
    expect((host['_setMaterializedState'] as any)).toHaveBeenCalledOnce();
    // _materializedGraph is rebuilt (not null) — the mock sets it
    expect(host['_materializedGraph']).not.toBeNull();
  });
});
