import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SyncController from '../../../../../src/domain/services/controllers/SyncController.js';
import SyncError from '../../../../../src/domain/errors/SyncError.js';
import OperationAbortedError from '../../../../../src/domain/errors/OperationAbortedError.js';
import SyncTrustGate from '../../../../../src/domain/services/sync/SyncTrustGate.js';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { timeoutMock, retryMock, RetryExhaustedErrorClass, httpSyncServerMock } = vi.hoisted(() => {
  const timeoutMock = vi.fn(async (/** @type {number} */ _ms, /** @type {Function} */ fn) => {
    const ac = new AbortController();
    return await fn(ac.signal);
  });
  const retryMock = vi.fn(async (/** @type {Function} */ fn) => await fn());

  class RetryExhaustedErrorClass extends Error {
    /**
     * @param {number} attempts
     * @param {Error} cause
     */
    constructor(attempts, cause) {
      super(`Retry exhausted after ${attempts} attempts`);
      this.name = 'RetryExhaustedError';
      this.attempts = attempts;
      this.cause = cause;
    }
  }

  const httpSyncServerMock = vi.fn().mockImplementation(function () {
    return {
      listen: vi.fn().mockResolvedValue({ close: vi.fn(), url: 'http://127.0.0.1:3000/sync' }),
    };
  });
  return { timeoutMock, retryMock, RetryExhaustedErrorClass, httpSyncServerMock };
});

vi.mock('../../../../../src/domain/services/sync/SyncProtocol.js', async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
    createSyncRequest: vi.fn((/** @type {Map<string,string>} */ frontier) => ({
      type: 'sync-request',
      frontier: Object.fromEntries(frontier),
    })),
    applySyncResponse: vi.fn(),
    syncNeeded: vi.fn(),
    processSyncRequest: vi.fn(),
  };
});

vi.mock('@git-stunts/alfred', async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
    timeout: timeoutMock,
    retry: retryMock,
    RetryExhaustedError: RetryExhaustedErrorClass,
  };
});

vi.mock('../../../../../src/domain/services/sync/HttpSyncServer.js', () => ({
  default: httpSyncServerMock,
}));

// Import mocked modules after mock setup
const {
  applySyncResponse: applySyncResponseMock,
  syncNeeded: syncNeededMock,
  processSyncRequest: processSyncRequestMock,
} = /** @type {{ applySyncResponse: import('vitest').Mock, syncNeeded: import('vitest').Mock, processSyncRequest: import('vitest').Mock }} */ (
  /** @type {unknown} */ (await import('../../../../../src/domain/services/sync/SyncProtocol.js'))
);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Creates a mock WarpRuntime host for SyncController tests.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
  /** @type {Record<string, unknown>} */
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
    _clock: { now: vi.fn().mockReturnValue(0) },
    _codec: {},
    _crypto: {
      hash: vi.fn().mockResolvedValue('abcdef'.repeat(10) + 'abcd'),
      hmac: vi.fn().mockResolvedValue('hmac-sig'),
    },
    _logger: null,
    _patchJournal: null,
    _patchBlobStorage: null,
    _patchesSinceCheckpoint: 0,
    _logTiming: vi.fn(),
    materialize: vi.fn(),
    discoverWriters: vi.fn().mockResolvedValue([]),
    _materializedGraph: null,
    ...overrides,
  };
  if (!host['_setMaterializedState']) {
    host['_setMaterializedState'] = vi.fn(async (/** @type {unknown} */ state) => {
      host['_cachedState'] = state;
      host['_stateDirty'] = false;
      host['_materializedGraph'] = { state, stateHash: 'mock-hash', adjacency: {} };
    });
  }
  return host;
}

/** Minimal fake WarpStateV5 that satisfies GCMetrics. */
function fakeState() {
  return {
    observedFrontier: new Map(),
    nodeAlive: { entries: new Map(), tombstones: new Set() },
    edgeAlive: { entries: new Map(), tombstones: new Set() },
    prop: new Map(),
  };
}

/** Valid sync response payload accepted by validateSyncResponse. */
function validSyncResponse(extras = {}) {
  return {
    type: 'sync-response',
    frontier: {},
    patches: [],
    ...extras,
  };
}

/** Creates a direct peer mock (object with processSyncRequest method). */
function createDirectPeer(response = validSyncResponse()) {
  return {
    processSyncRequest: vi.fn().mockResolvedValue(response),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SyncController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryMock.mockImplementation(async (fn) => await fn());
    timeoutMock.mockImplementation(async (_ms, fn) => {
      const ac = new AbortController();
      return await fn(ac.signal);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores host reference', () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(ctrl._host).toBe(host);
    });

    it('defaults trustGate to null when no options', () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(ctrl._trustGate).toBeNull();
    });

    it('accepts a trustGate option', () => {
      const host = createMockHost();
      const gate = new SyncTrustGate({ trustMode: 'off' });
      const ctrl = new SyncController(/** @type {*} */ (host), { trustGate: gate });

      expect(ctrl._trustGate).toBe(gate);
    });
  });

  // ── getFrontier ────────────────────────────────────────────────────────

  describe('getFrontier', () => {
    it('returns empty frontier when no writers exist', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier).toBeInstanceOf(Map);
      expect(frontier.size).toBe(0);
    });

    it('builds frontier from discovered writers and their refs', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-alice')
            .mockResolvedValueOnce('sha-bob'),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier.size).toBe(2);
      expect(frontier.get('alice')).toBe('sha-alice');
      expect(frontier.get('bob')).toBe('sha-bob');
    });

    it('skips writers with null tip SHA', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-alice')
            .mockResolvedValueOnce(null),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier.size).toBe(1);
      expect(frontier.has('bob')).toBe(false);
    });

    it('skips writers with empty string tip SHA', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier.size).toBe(0);
    });

    it('reads correct ref path per writer', async () => {
      const readRef = vi.fn().mockResolvedValue('sha-x');
      const host = createMockHost({
        _graphName: 'my-graph',
        discoverWriters: vi.fn().mockResolvedValue(['writer-1']),
        _persistence: { readRef },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.getFrontier();

      expect(readRef).toHaveBeenCalledWith('refs/warp/my-graph/writers/writer-1');
    });
  });

  // ── hasFrontierChanged ─────────────────────────────────────────────────

  describe('hasFrontierChanged', () => {
    it('returns true when _lastFrontier is null (never materialized)', async () => {
      const host = createMockHost({ _lastFrontier: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(await ctrl.hasFrontierChanged()).toBe(true);
    });

    it('returns false when frontier matches _lastFrontier', async () => {
      const host = createMockHost({
        _lastFrontier: new Map([['alice', 'sha-a']]),
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-a') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(await ctrl.hasFrontierChanged()).toBe(false);
    });

    it('returns true when frontier has more writers than _lastFrontier', async () => {
      const host = createMockHost({
        _lastFrontier: new Map([['alice', 'sha-a']]),
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-a')
            .mockResolvedValueOnce('sha-b'),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(await ctrl.hasFrontierChanged()).toBe(true);
    });

    it('returns true when a writer tip SHA differs', async () => {
      const host = createMockHost({
        _lastFrontier: new Map([['alice', 'sha-old']]),
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-new') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(await ctrl.hasFrontierChanged()).toBe(true);
    });
  });

  // ── status ─────────────────────────────────────────────────────────────

  describe('status', () => {
    it('returns "none" cachedState when no state exists', async () => {
      const host = createMockHost({ _cachedState: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('none');
      expect(result.tombstoneRatio).toBe(0);
      expect(result.writers).toBe(0);
      expect(result.frontier).toEqual({});
    });

    it('returns "stale" when _stateDirty is true', async () => {
      const host = createMockHost({
        _cachedState: fakeState(),
        _stateDirty: true,
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('stale');
    });

    it('returns "stale" when frontier size differs from _lastFrontier', async () => {
      const host = createMockHost({
        _cachedState: fakeState(),
        _stateDirty: false,
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-a') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('stale');
    });

    it('returns "stale" when _lastFrontier is null', async () => {
      const host = createMockHost({
        _cachedState: fakeState(),
        _stateDirty: false,
        _lastFrontier: null,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('stale');
    });

    it('returns "fresh" when frontier matches and not dirty', async () => {
      const host = createMockHost({
        _cachedState: fakeState(),
        _stateDirty: false,
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('fresh');
    });

    it('includes patchesSinceCheckpoint from host', async () => {
      const host = createMockHost({ _patchesSinceCheckpoint: 42 });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.patchesSinceCheckpoint).toBe(42);
    });

    it('returns writer count and frontier as plain object', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-a')
            .mockResolvedValueOnce('sha-b'),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.writers).toBe(2);
      expect(result.frontier).toEqual({ alice: 'sha-a', bob: 'sha-b' });
    });
  });

  // ── createSyncRequest ──────────────────────────────────────────────────

  describe('createSyncRequest', () => {
    it('returns a sync request containing the local frontier', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-alice') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const request = await ctrl.createSyncRequest();

      expect(request).toHaveProperty('type', 'sync-request');
      expect(request.frontier).toMatchObject({ alice: 'sha-alice' });
    });
  });

  // ── processSyncRequest ─────────────────────────────────────────────────

  describe('processSyncRequest', () => {
    it('delegates to SyncProtocol.processSyncRequest with correct arguments', async () => {
      const mockResponse = validSyncResponse();
      processSyncRequestMock.mockResolvedValue(mockResponse);
      const patchJournal = { writePatch: vi.fn() };
      const host = createMockHost({
        _patchJournal: patchJournal,
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-a') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));
      const request = /** @type {*} */ ({ type: 'sync-request', frontier: {} });

      const result = await ctrl.processSyncRequest(request);

      expect(result).toBe(mockResponse);
      expect(processSyncRequestMock).toHaveBeenCalledWith(
        request,
        expect.any(Map),
        host['_persistence'],
        'test-graph',
        expect.objectContaining({ patchJournal }),
      );
    });

    it('omits patchJournal from options when null', async () => {
      processSyncRequestMock.mockResolvedValue(validSyncResponse());
      const host = createMockHost({ _patchJournal: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.processSyncRequest(/** @type {*} */ ({ type: 'sync-request', frontier: {} }));

      const call = processSyncRequestMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      const opts = call[4];
      expect(opts).not.toHaveProperty('patchJournal');
    });

    it('includes logger in options when host has one', async () => {
      processSyncRequestMock.mockResolvedValue(validSyncResponse());
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
      const host = createMockHost({ _logger: logger });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.processSyncRequest(/** @type {*} */ ({ type: 'sync-request', frontier: {} }));

      const call = processSyncRequestMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      expect(call[4]).toHaveProperty('logger', logger);
    });
  });

  // ── applySyncResponse ──────────────────────────────────────────────────

  describe('applySyncResponse', () => {
    it('throws QueryError when no cached state exists', async () => {
      const host = createMockHost({ _cachedState: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse())))
        .rejects.toThrow(/No materialized state/);
    });

    it('applies response and updates host state', async () => {
      const oldState = fakeState();
      const newState = fakeState();
      const newFrontier = new Map([['alice', 'sha-2']]);
      applySyncResponseMock.mockReturnValue({ state: newState, frontier: newFrontier, applied: 3 });

      const host = createMockHost({
        _cachedState: oldState,
        _lastFrontier: new Map([['alice', 'sha-1']]),
        _patchesSinceGC: 2,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse()));

      expect(result.applied).toBe(3);
      expect(host['_cachedState']).toBe(newState);
      expect(host['_lastFrontier']).toBe(newFrontier);
      expect(host['_patchesSinceGC']).toBe(5);
    });

    it('calls _setMaterializedState with new state (B105)', async () => {
      const newState = fakeState();
      applySyncResponseMock.mockReturnValue({ state: newState, frontier: new Map(), applied: 1 });

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse()));

      expect(/** @type {import('vitest').Mock} */ (host['_setMaterializedState'])).toHaveBeenCalledWith(newState);
    });

    it('does not advance frontier/counters when _setMaterializedState rejects', async () => {
      const newState = fakeState();
      const previousFrontier = new Map([['alice', 'sha-1']]);
      applySyncResponseMock.mockReturnValue({ state: newState, frontier: new Map([['alice', 'sha-2']]), applied: 2 });

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: previousFrontier,
        _patchesSinceGC: 5,
        _setMaterializedState: vi.fn().mockRejectedValue(new Error('install failed')),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse())))
        .rejects.toThrow('install failed');
      expect(host['_lastFrontier']).toBe(previousFrontier);
      expect(host['_patchesSinceGC']).toBe(5);
    });

    it('uses empty frontier when _lastFrontier is null', async () => {
      const state = fakeState();
      const newFrontier = new Map([['bob', 'sha-b']]);
      applySyncResponseMock.mockReturnValue({ state, frontier: newFrontier, applied: 1 });

      const host = createMockHost({
        _cachedState: state,
        _lastFrontier: null,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse()));

      const call = applySyncResponseMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      const calledFrontier = call[2];
      expect(calledFrontier).toBeInstanceOf(Map);
      expect(calledFrontier.size).toBe(0);
    });

    it('surfaces skippedWriters from response', async () => {
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const skippedWriters = [{ writerId: 'bob', reason: 'E_SYNC_DIVERGENCE', localSha: 'sha-b1', remoteSha: 'sha-b0' }];
      const result = await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse({ skippedWriters })));

      expect(result.skippedWriters).toEqual(skippedWriters);
    });

    it('returns empty skippedWriters when response omits them', async () => {
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse()));

      expect(result.skippedWriters).toEqual([]);
    });

    it('returns writersApplied extracted from response patches', async () => {
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 2 });

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const patches = [
        { writerId: 'alice', sha: 'sha-1', ops: [] },
        { writerId: 'bob', sha: 'sha-2', ops: [] },
        { writerId: 'alice', sha: 'sha-3', ops: [] },
      ];
      const result = await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse({ patches })));

      expect(result.writersApplied).toEqual(expect.arrayContaining(['alice', 'bob']));
      expect(result.writersApplied).toHaveLength(2);
    });
  });

  // ── applySyncResponse + trust gate ─────────────────────────────────────

  describe('applySyncResponse with trust gate', () => {
    it('rejects with E_SYNC_UNTRUSTED_WRITER when enforce gate rejects', async () => {
      const evaluator = {
        evaluateWriters: vi.fn().mockResolvedValue({ trusted: new Set() }),
      };
      const gate = new SyncTrustGate({ trustEvaluator: evaluator, trustMode: 'enforce' });

      const host = createMockHost({ _cachedState: fakeState(), _lastFrontier: new Map() });
      const ctrl = new SyncController(/** @type {*} */ (host), { trustGate: gate });

      const patches = [{ writerId: 'mallory', sha: 'sha-m', ops: [] }];
      await expect(ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse({ patches }))))
        .rejects.toMatchObject({ code: 'E_SYNC_UNTRUSTED_WRITER' });
    });

    it('allows response when trust gate passes', async () => {
      const evaluator = {
        evaluateWriters: vi.fn().mockResolvedValue({ trusted: new Set(['alice']) }),
      };
      const gate = new SyncTrustGate({ trustEvaluator: evaluator, trustMode: 'enforce' });

      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 1 });
      const host = createMockHost({ _cachedState: fakeState(), _lastFrontier: new Map() });
      const ctrl = new SyncController(/** @type {*} */ (host), { trustGate: gate });

      const patches = [{ writerId: 'alice', sha: 'sha-a', ops: [] }];
      const result = await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse({ patches })));

      expect(result.applied).toBe(1);
    });

    it('skips trust evaluation when no patches have writers', async () => {
      const evaluator = {
        evaluateWriters: vi.fn().mockResolvedValue({ trusted: new Set() }),
      };
      const gate = new SyncTrustGate({ trustEvaluator: evaluator, trustMode: 'enforce' });

      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });
      const host = createMockHost({ _cachedState: fakeState(), _lastFrontier: new Map() });
      const ctrl = new SyncController(/** @type {*} */ (host), { trustGate: gate });

      const result = await ctrl.applySyncResponse(/** @type {*} */ (validSyncResponse()));

      expect(result.applied).toBe(0);
      // No patches, so extractWritersFromPatches returns [] and evaluate is not called
    });
  });

  // ── syncNeeded ─────────────────────────────────────────────────────────

  describe('syncNeeded', () => {
    it('delegates to SyncProtocol.syncNeeded with local and remote frontiers', async () => {
      syncNeededMock.mockReturnValue(true);
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-alice') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));
      const remoteFrontier = new Map([['bob', 'sha-bob']]);

      const result = await ctrl.syncNeeded(remoteFrontier);

      expect(result).toBe(true);
      expect(syncNeededMock).toHaveBeenCalledWith(expect.any(Map), remoteFrontier);
    });

    it('returns false when syncNeeded reports no changes', async () => {
      syncNeededMock.mockReturnValue(false);
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.syncNeeded(new Map());

      expect(result).toBe(false);
    });
  });

  // ── syncWith (direct peer) ─────────────────────────────────────────────

  describe('syncWith — direct peer', () => {
    it('syncs with a direct peer via processSyncRequest', async () => {
      const newState = fakeState();
      const newFrontier = new Map([['alice', 'sha-a2'], ['bob', 'sha-b1']]);
      applySyncResponseMock.mockReturnValue({ state: newState, frontier: newFrontier, applied: 2 });

      const peerResponse = validSyncResponse({
        patches: [{ writerId: 'bob', sha: 'sha-b1', patch: { ops: [] } }],
      });
      const peer = createDirectPeer(peerResponse);

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map([['alice', 'sha-a1']]),
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: { readRef: vi.fn().mockResolvedValue('sha-a1') },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.syncWith(/** @type {*} */ (peer));

      expect(result.applied).toBe(2);
      expect(result.attempts).toBe(1);
      expect(peer.processSyncRequest).toHaveBeenCalledOnce();
    });

    it('materializes before apply when _cachedState is null', async () => {
      const materializedState = fakeState();
      applySyncResponseMock.mockReturnValue({ state: materializedState, frontier: new Map(), applied: 0 });

      const peer = createDirectPeer();
      const host = createMockHost({
        _cachedState: null,
        materialize: vi.fn().mockImplementation(async function () {
          host['_cachedState'] = materializedState;
        }),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.syncWith(/** @type {*} */ (peer));

      expect(host['materialize']).toHaveBeenCalledOnce();
    });

    it('does NOT retry on direct peer errors', async () => {
      /** @type {((err: unknown) => boolean) | undefined} */
      let capturedShouldRetry;
      retryMock.mockImplementation(async (fn, opts) => {
        capturedShouldRetry = /** @type {*} */ (opts).shouldRetry;
        return await fn();
      });

      const peer = createDirectPeer();
      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.syncWith(/** @type {*} */ (peer));

      // shouldRetry always returns false for direct peers
      if (capturedShouldRetry === undefined) { throw new Error('shouldRetry not captured'); }
      expect(capturedShouldRetry(new SyncError('remote', { code: 'E_SYNC_REMOTE' }))).toBe(false);
    });

    it('returns state when materialize option is true', async () => {
      const state = fakeState();
      applySyncResponseMock.mockReturnValue({ state, frontier: new Map(), applied: 1 });

      const host = createMockHost({
        _cachedState: state,
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.syncWith(/** @type {*} */ (createDirectPeer()), { materialize: true });

      expect(result.state).toBe(state);
    });

    it('surfaces skippedWriters from syncWith result', async () => {
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      const skippedWriters = [{ writerId: 'bob', reason: 'diverged', localSha: 'sha-b', remoteSha: null }];
      const peer = createDirectPeer(validSyncResponse({ skippedWriters }));

      const host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.syncWith(/** @type {*} */ (peer));

      expect(result.skippedWriters).toEqual(skippedWriters);
    });
  });

  // ── syncWith (HTTP) ────────────────────────────────────────────────────

  describe('syncWith — HTTP', () => {
    /** @type {import('vitest').Mock} */
    let fetchMock;
    /** @type {ReturnType<typeof createMockHost>} */
    let host;
    /** @type {SyncController} */
    let ctrl;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      ctrl = new SyncController(/** @type {*} */ (host));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('makes POST request to the correct URL', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      await ctrl.syncWith('http://peer:3000/sync');

      expect(fetchMock).toHaveBeenCalledOnce();
      const call = fetchMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      expect(call[0]).toBe('http://peer:3000/sync');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers['content-type']).toBe('application/json');
    });

    it('appends /sync path when URL has no path', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      await ctrl.syncWith('http://peer:3000');

      const call = fetchMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      expect(call[0]).toContain('/sync');
    });

    it('overrides URL path when path option is provided', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      await ctrl.syncWith('http://peer:3000/old-path', { path: '/new-path' });

      const call = fetchMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      expect(call[0]).toContain('/new-path');
    });

    it('successful HTTP sync returns applied count', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 5 });

      const result = await ctrl.syncWith('http://peer:3000/sync');

      expect(result.applied).toBe(5);
    });

    it('5xx throws SyncError with E_SYNC_REMOTE', async () => {
      fetchMock.mockResolvedValue({ status: 502 });

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({ code: 'E_SYNC_REMOTE' });
    });

    it('4xx throws SyncError with E_SYNC_PROTOCOL', async () => {
      fetchMock.mockResolvedValue({ status: 400 });

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL' });
    });

    it('invalid JSON throws SyncError with E_SYNC_PROTOCOL', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL' });
    });

    it('AbortError throws OperationAbortedError', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      timeoutMock.mockRejectedValue(abortErr);

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toBeInstanceOf(OperationAbortedError);
    });

    it('TimeoutError throws SyncError with E_SYNC_TIMEOUT', async () => {
      const { TimeoutError } = await import('@git-stunts/alfred');
      timeoutMock.mockRejectedValue(new TimeoutError(10000, 10001));

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({ code: 'E_SYNC_TIMEOUT' });
    });

    it('network error throws SyncError with E_SYNC_NETWORK', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({ code: 'E_SYNC_NETWORK' });
    });

    it('invalid remote URL throws SyncError with E_SYNC_REMOTE_URL', async () => {
      await expect(ctrl.syncWith('not-a-url'))
        .rejects.toMatchObject({ code: 'E_SYNC_REMOTE_URL' });
    });

    it('ftp protocol throws SyncError with E_SYNC_REMOTE_URL', async () => {
      await expect(ctrl.syncWith('ftp://peer:3000/sync'))
        .rejects.toMatchObject({ code: 'E_SYNC_REMOTE_URL' });
    });

    it('accepts URL objects', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      const result = await ctrl.syncWith(new URL('http://peer:3000/sync'));

      expect(result.applied).toBe(0);
    });

    // ── Retry behavior ─────────────────────────────────────────────────

    it('retries on E_SYNC_REMOTE but not E_SYNC_PROTOCOL for HTTP', async () => {
      fetchMock.mockResolvedValue({ status: 502 });

      /** @type {((err: unknown) => boolean) | undefined} */
      let capturedShouldRetry;
      retryMock.mockImplementation(async (fn, opts) => {
        capturedShouldRetry = /** @type {*} */ (opts).shouldRetry;
        return await fn();
      });

      try {
        await ctrl.syncWith('http://peer:3000/sync');
      } catch {
        // expected
      }

      if (capturedShouldRetry === undefined) { throw new Error('shouldRetry not captured'); }
      expect(capturedShouldRetry(new SyncError('remote', { code: 'E_SYNC_REMOTE' }))).toBe(true);
      expect(capturedShouldRetry(new SyncError('timeout', { code: 'E_SYNC_TIMEOUT' }))).toBe(true);
      expect(capturedShouldRetry(new SyncError('network', { code: 'E_SYNC_NETWORK' }))).toBe(true);
      expect(capturedShouldRetry(new SyncError('protocol', { code: 'E_SYNC_PROTOCOL' }))).toBe(false);
    });

    it('surfaces last error from RetryExhaustedError', async () => {
      const lastError = new SyncError('Remote error: 503', { code: 'E_SYNC_REMOTE' });
      retryMock.mockRejectedValue(new RetryExhaustedErrorClass(3, lastError));

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toBe(lastError);
    });

    // ── onStatus callbacks ──────────────────────────────────────────────

    it('emits onStatus events during successful sync', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 1 });

      const events = /** @type {Array<{type: string}>} */ ([]);
      const onStatus = vi.fn((/** @type {{type: string}} */ evt) => {
        events.push(evt);
      });

      await ctrl.syncWith('http://peer:3000/sync', { onStatus });

      const types = events.map((e) => e.type);
      expect(types).toContain('connecting');
      expect(types).toContain('requestBuilt');
      expect(types).toContain('requestSent');
      expect(types).toContain('responseReceived');
      expect(types).toContain('applied');
      expect(types).toContain('complete');
    });

    it('emits "failed" onStatus when error occurs', async () => {
      fetchMock.mockResolvedValue({ status: 502 });
      const onStatus = vi.fn();

      try {
        await ctrl.syncWith('http://peer:3000/sync', { onStatus });
      } catch {
        // expected
      }

      const failedCall = onStatus.mock.calls.find(
        (/** @type {*[]} */ c) => c[0].type === 'failed',
      );
      expect(failedCall).toBeDefined();
    });

    it('emits "failed" on AbortError with OperationAbortedError as error', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      retryMock.mockRejectedValue(abortErr);

      const onStatus = vi.fn();
      try {
        await ctrl.syncWith('http://peer:3000/sync', { onStatus });
      } catch {
        // expected
      }

      const failedCall = onStatus.mock.calls.find(
        (/** @type {*[]} */ c) => c[0].type === 'failed',
      );
      expect(failedCall).toBeDefined();
      expect(failedCall[0].error).toBeInstanceOf(OperationAbortedError);
    });

    it('emits "failed" with retry count on RetryExhaustedError', async () => {
      const cause = new SyncError('fail', { code: 'E_SYNC_REMOTE' });
      retryMock.mockRejectedValue(new RetryExhaustedErrorClass(3, cause));

      const onStatus = vi.fn();
      try {
        await ctrl.syncWith('http://peer:3000/sync', { onStatus });
      } catch {
        // expected
      }

      const failedCall = onStatus.mock.calls.find(
        (/** @type {*[]} */ c) => c[0].type === 'failed',
      );
      expect(failedCall).toBeDefined();
      expect(failedCall[0].attempt).toBe(3);
    });

    // ── Auth headers ─────────────────────────────────────────────────────

    it('sends auth headers when auth option is provided', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      await ctrl.syncWith('http://peer:3000/sync', {
        auth: { secret: 'my-secret', keyId: 'k1' },
      });

      const call = fetchMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      const headers = call[1].headers;
      const authKeys = Object.keys(headers).filter((k) => k.startsWith('x-warp-'));
      expect(authKeys.length).toBeGreaterThan(0);
    });

    it('sends no auth headers when auth option is omitted', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 0 });

      await ctrl.syncWith('http://peer:3000/sync');

      const call = fetchMock.mock.calls[0];
      if (call == null) { throw new Error('expected call'); }
      const headers = call[1].headers;
      const authKeys = Object.keys(headers).filter((k) => k.startsWith('x-warp-'));
      expect(authKeys).toHaveLength(0);
    });

    // ── syncWith trust override ──────────────────────────────────────────

    it('uses per-call trust option over controller-level gate', async () => {
      const controllerEvaluator = {
        evaluateWriters: vi.fn().mockResolvedValue({ trusted: new Set() }),
      };
      const controllerGate = new SyncTrustGate({ trustEvaluator: controllerEvaluator, trustMode: 'enforce' });

      const perCallCreator = vi.fn().mockReturnValue(
        new SyncTrustGate({ trustMode: 'off' }),
      );

      host = createMockHost({
        _cachedState: fakeState(),
        _lastFrontier: new Map(),
        _createSyncTrustGate: perCallCreator,
      });
      ctrl = new SyncController(/** @type {*} */ (host), { trustGate: controllerGate });

      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse({
          patches: [{ writerId: 'untrusted', sha: 'sha-u', patch: { ops: [] } }],
        })),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 1 });

      // Should NOT throw because per-call trust overrides to 'off'
      const result = await ctrl.syncWith('http://peer:3000/sync', {
        trust: { mode: 'off' },
      });

      expect(result.applied).toBe(1);
      expect(perCallCreator).toHaveBeenCalledWith({ mode: 'off' });
    });

    // ── Timing ───────────────────────────────────────────────────────────

    it('calls _logTiming on success', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validSyncResponse()),
      });
      applySyncResponseMock.mockReturnValue({ state: fakeState(), frontier: new Map(), applied: 3 });

      await ctrl.syncWith('http://peer:3000/sync');

      expect(/** @type {import('vitest').Mock} */ (host['_logTiming'])).toHaveBeenCalledWith(
        'syncWith',
        expect.any(Number),
        expect.objectContaining({ metrics: '3 patches applied' }),
      );
    });

    it('calls _logTiming with error on failure', async () => {
      fetchMock.mockResolvedValue({ status: 502 });

      try {
        await ctrl.syncWith('http://peer:3000/sync');
      } catch {
        // expected
      }

      expect(/** @type {import('vitest').Mock} */ (host['_logTiming'])).toHaveBeenCalledWith(
        'syncWith',
        expect.any(Number),
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
  });

  // ── serve ──────────────────────────────────────────────────────────────

  describe('serve', () => {
    it('throws SyncError when port is not a number', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.serve(/** @type {*} */ ({ port: 'bad', httpPort: {} })))
        .rejects.toThrow('serve() requires a numeric port');
    });

    it('throws SyncError when httpPort is missing', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.serve(/** @type {*} */ ({ port: 3000 })))
        .rejects.toThrow('serve() requires an httpPort adapter');
    });

    it('throws SyncError when httpPort is null', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.serve(/** @type {*} */ ({ port: 3000, httpPort: null })))
        .rejects.toThrow('serve() requires an httpPort adapter');
    });

    it('creates HttpSyncServer with correct options and calls listen', async () => {
      httpSyncServerMock.mockClear();
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));
      const httpPort = { listen: vi.fn() };

      const handle = await ctrl.serve(/** @type {*} */ ({
        port: 4000,
        httpPort,
        path: '/custom-sync',
        host: '0.0.0.0',
        maxRequestBytes: 2048,
      }));

      expect(httpSyncServerMock).toHaveBeenCalledOnce();
      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.httpPort).toBe(httpPort);
      expect(args.graph).toBe(host);
      expect(args.path).toBe('/custom-sync');
      expect(args.host).toBe('0.0.0.0');
      expect(args.maxRequestBytes).toBe(2048);
      expect(handle).toHaveProperty('close');
      expect(handle).toHaveProperty('url');
    });

    it('uses default host 127.0.0.1 when not specified', async () => {
      httpSyncServerMock.mockClear();
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort: { listen: vi.fn() },
      }));

      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.host).toBe('127.0.0.1');
    });

    it('enriches auth config with crypto and logger from host', async () => {
      httpSyncServerMock.mockClear();
      const mockCrypto = { subtle: {} };
      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
      const host = createMockHost({ _crypto: mockCrypto, _logger: mockLogger });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort: { listen: vi.fn() },
        auth: { keys: { k1: 'secret1' } },
      }));

      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.auth.crypto).toBe(mockCrypto);
      expect(args.auth.logger).toBe(mockLogger);
      expect(args.auth.keys).toEqual({ k1: 'secret1' });
    });

    it('omits auth from HttpSyncServer when not configured', async () => {
      httpSyncServerMock.mockClear();
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort: { listen: vi.fn() },
      }));

      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args).not.toHaveProperty('auth');
    });

    it('omits logger from auth when host has no logger', async () => {
      httpSyncServerMock.mockClear();
      const host = createMockHost({ _logger: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort: { listen: vi.fn() },
        auth: { keys: { k: 's' } },
      }));

      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.auth).not.toHaveProperty('logger');
    });
  });
});
