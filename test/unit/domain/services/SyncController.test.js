import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SyncController from '../../../../src/domain/services/SyncController.js';
import SyncError from '../../../../src/domain/errors/SyncError.js';
import OperationAbortedError from '../../../../src/domain/errors/OperationAbortedError.js';

const { timeoutMock, retryMock, httpSyncServerMock } = vi.hoisted(() => {
  const timeoutMock = vi.fn(async (/** @type {number} */ _ms, /** @type {Function} */ fn) => {
    const ac = new AbortController();
    return await fn(ac.signal);
  });
  const retryMock = vi.fn(async (/** @type {Function} */ fn) => await fn());
  const httpSyncServerMock = vi.fn().mockImplementation(() => ({
    listen: vi.fn().mockResolvedValue({ close: vi.fn(), url: 'http://127.0.0.1:3000/sync' }),
  }));
  return { timeoutMock, retryMock, httpSyncServerMock };
});

vi.mock('../../../../src/domain/services/SyncProtocol.js', async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
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
  };
});

vi.mock('../../../../src/domain/services/HttpSyncServer.js', () => ({
  default: httpSyncServerMock,
}));

// Import after mock setup so we get the mocked versions
const { applySyncResponse: applySyncResponseMock, syncNeeded: syncNeededMock, processSyncRequest: processSyncRequestMock } =
  /** @type {Record<string, import('vitest').Mock>} */ (/** @type {unknown} */ (await import('../../../../src/domain/services/SyncProtocol.js')));

/**
 * Creates a mock WarpGraph host for SyncController tests.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
  return {
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
    ...overrides,
  };
}

describe('SyncController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('stores host reference', () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(ctrl._host).toBe(host);
    });
  });

  describe('getFrontier', () => {
    it('returns empty frontier when no writers exist', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier).toBeInstanceOf(Map);
      expect(frontier.size).toBe(0);
      expect(host.discoverWriters).toHaveBeenCalledOnce();
    });

    it('calls readRef for each discovered writer', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-alice')
            .mockResolvedValueOnce('sha-bob'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier.size).toBe(2);
      expect(frontier.get('alice')).toBe('sha-alice');
      expect(frontier.get('bob')).toBe('sha-bob');
      expect(/** @type {*} */ (host._persistence).readRef).toHaveBeenCalledTimes(2);
    });

    it('skips writers with null tip SHA', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-alice')
            .mockResolvedValueOnce(null),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const frontier = await ctrl.getFrontier();

      expect(frontier.size).toBe(1);
      expect(frontier.get('alice')).toBe('sha-alice');
    });
  });

  describe('hasFrontierChanged', () => {
    it('returns true when _lastFrontier is null', async () => {
      const host = createMockHost({ _lastFrontier: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const changed = await ctrl.hasFrontierChanged();

      expect(changed).toBe(true);
    });

    it('returns false when frontier matches _lastFrontier', async () => {
      const lastFrontier = new Map([['alice', 'sha-a']]);
      const host = createMockHost({
        _lastFrontier: lastFrontier,
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: {
          readRef: vi.fn().mockResolvedValue('sha-a'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const changed = await ctrl.hasFrontierChanged();

      expect(changed).toBe(false);
    });

    it('returns true when frontier size differs', async () => {
      const lastFrontier = new Map([['alice', 'sha-a']]);
      const host = createMockHost({
        _lastFrontier: lastFrontier,
        discoverWriters: vi.fn().mockResolvedValue(['alice', 'bob']),
        _persistence: {
          readRef: vi.fn()
            .mockResolvedValueOnce('sha-a')
            .mockResolvedValueOnce('sha-b'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const changed = await ctrl.hasFrontierChanged();

      expect(changed).toBe(true);
    });

    it('returns true when a writer tip SHA differs', async () => {
      const lastFrontier = new Map([['alice', 'sha-old']]);
      const host = createMockHost({
        _lastFrontier: lastFrontier,
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: {
          readRef: vi.fn().mockResolvedValue('sha-new'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const changed = await ctrl.hasFrontierChanged();

      expect(changed).toBe(true);
    });
  });

  describe('status', () => {
    it('returns correct shape with no cached state', async () => {
      const host = createMockHost({
        _cachedState: null,
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result).toEqual({
        cachedState: 'none',
        patchesSinceCheckpoint: 0,
        tombstoneRatio: 0,
        writers: 0,
        frontier: {},
      });
    });

    it('reports stale when _stateDirty is true', async () => {
      const host = createMockHost({
        _cachedState: {
          observedFrontier: new Map(),
          nodeAlive: { entries: new Map(), tombstones: new Map() },
          edgeAlive: { entries: new Map(), tombstones: new Map() },
        },
        _stateDirty: true,
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('stale');
    });

    it('reports fresh when frontier matches and not dirty', async () => {
      const host = createMockHost({
        _cachedState: {
          observedFrontier: new Map(),
          nodeAlive: { entries: new Map(), tombstones: new Map() },
          edgeAlive: { entries: new Map(), tombstones: new Map() },
        },
        _stateDirty: false,
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.status();

      expect(result.cachedState).toBe('fresh');
    });
  });

  describe('applySyncResponse', () => {
    it('throws QueryError when no cached state', () => {
      const host = createMockHost({ _cachedState: null });
      const ctrl = new SyncController(/** @type {*} */ (host));

      expect(() => ctrl.applySyncResponse({ type: 'sync-response', frontier: {}, patches: [] }))
        .toThrow(/No materialized state/);
    });

    it('updates host state from applySyncResponseImpl result', () => {
      const fakeState = {
        observedFrontier: new Map(),
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      const newState = { observedFrontier: new Map(), nodeAlive: { dots: new Map() }, edgeAlive: { dots: new Map() } };
      const newFrontier = new Map([['alice', 'sha-2']]);
      applySyncResponseMock.mockReturnValue({ state: newState, frontier: newFrontier, applied: 3 });

      const host = createMockHost({
        _cachedState: fakeState,
        _lastFrontier: new Map([['alice', 'sha-1']]),
        _patchesSinceGC: 2,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));
      /** @type {{type: 'sync-response', frontier: Record<string, string>, patches: *[]}} */
      const response = { type: 'sync-response', frontier: {}, patches: [] };

      const result = ctrl.applySyncResponse(response);

      expect(result.applied).toBe(3);
      expect(host._cachedState).toBe(newState);
      expect(host._lastFrontier).toBe(newFrontier);
      expect(host._patchesSinceGC).toBe(5);
      expect(host._stateDirty).toBe(false);
      expect(applySyncResponseMock).toHaveBeenCalledWith(
        response,
        fakeState,
        expect.any(Map),
      );
    });

    it('uses empty frontier when _lastFrontier is null', () => {
      const fakeState = {
        observedFrontier: new Map(),
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      const newFrontier = new Map([['bob', 'sha-b']]);
      applySyncResponseMock.mockReturnValue({ state: fakeState, frontier: newFrontier, applied: 1 });

      const host = createMockHost({
        _cachedState: fakeState,
        _lastFrontier: null,
        _patchesSinceGC: 0,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      ctrl.applySyncResponse({ type: 'sync-response', frontier: {}, patches: [] });

      // Should have passed an empty Map (from createFrontier()) as the frontier arg
      const calledFrontier = applySyncResponseMock.mock.calls[0][2];
      expect(calledFrontier).toBeInstanceOf(Map);
      expect(calledFrontier.size).toBe(0);
      expect(host._lastFrontier).toBe(newFrontier);
    });

    it('passes _lastFrontier (not observedFrontier) to applySyncResponseImpl', () => {
      const observedFrontier = new Map([['alice', 99]]);
      const lastFrontier = new Map([['alice', 'sha-tip-1']]);
      const fakeState = {
        observedFrontier,
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      const newFrontier = new Map([['alice', 'sha-tip-2']]);
      applySyncResponseMock.mockReturnValue({ state: fakeState, frontier: newFrontier, applied: 1 });

      const host = createMockHost({
        _cachedState: fakeState,
        _lastFrontier: lastFrontier,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      ctrl.applySyncResponse({ type: 'sync-response', frontier: {}, patches: [] });

      const calledFrontier = applySyncResponseMock.mock.calls[0][2];
      // Must be the SHA frontier map, not the VersionVector
      expect(calledFrontier).toBe(lastFrontier);
      expect(calledFrontier.get('alice')).toBe('sha-tip-1');
    });
  });

  describe('syncNeeded', () => {
    it('delegates to SyncProtocol.syncNeeded with local and remote frontiers', async () => {
      syncNeededMock.mockReturnValue(true);
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: {
          readRef: vi.fn().mockResolvedValue('sha-alice'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));
      const remoteFrontier = new Map([['bob', 'sha-bob']]);

      const result = await ctrl.syncNeeded(remoteFrontier);

      expect(result).toBe(true);
      expect(syncNeededMock).toHaveBeenCalledWith(
        expect.any(Map),
        remoteFrontier,
      );
      // Verify local frontier was built correctly
      const calledLocalFrontier = syncNeededMock.mock.calls[0][0];
      expect(calledLocalFrontier.get('alice')).toBe('sha-alice');
    });
  });

  describe('processSyncRequest', () => {
    it('delegates to SyncProtocol.processSyncRequest with correct args', async () => {
      const mockResponse = { type: 'sync-response', frontier: {}, patches: [] };
      processSyncRequestMock.mockResolvedValue(mockResponse);
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: {
          readRef: vi.fn().mockResolvedValue('sha-alice'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));
      const request = { type: 'sync-request', frontier: {} };

      const result = await ctrl.processSyncRequest(/** @type {*} */ (request));

      expect(result).toBe(mockResponse);
      expect(processSyncRequestMock).toHaveBeenCalledWith(
        request,
        expect.any(Map),
        host._persistence,
        'test-graph',
        { codec: host._codec },
      );
    });
  });

  describe('syncWith', () => {
    it('syncs with a direct peer using direct method calls', async () => {
      const newState = { observedFrontier: new Map(), nodeAlive: { dots: new Map() }, edgeAlive: { dots: new Map() } };
      const newFrontier = new Map([['alice', 'sha-a2'], ['bob', 'sha-b1']]);
      applySyncResponseMock.mockReturnValue({ state: newState, frontier: newFrontier, applied: 2 });

      const peerResponse = {
        type: 'sync-response',
        frontier: { bob: 'sha-b1' },
        patches: [
          { writerId: 'bob', sha: 'sha-b1', patch: { ops: [] } },
        ],
      };

      const remotePeer = {
        processSyncRequest: vi.fn().mockResolvedValue(peerResponse),
        getFrontier: vi.fn().mockResolvedValue(new Map([['bob', 'sha-b1']])),
      };

      const fakeState = {
        observedFrontier: new Map(),
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      const host = createMockHost({
        _cachedState: fakeState,
        _lastFrontier: new Map([['alice', 'sha-a1']]),
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: {
          readRef: vi.fn().mockResolvedValue('sha-a1'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.syncWith(/** @type {*} */ (remotePeer));

      expect(result.applied).toBe(2);
      expect(result.attempts).toBe(1);
      expect(remotePeer.processSyncRequest).toHaveBeenCalledOnce();
      expect(host._cachedState).toBe(newState);
    });

    it('calls host.materialize() when _cachedState is null before apply', async () => {
      const materializedState = {
        observedFrontier: new Map(),
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      const newFrontier = new Map([['alice', 'sha-a2']]);
      applySyncResponseMock.mockReturnValue({ state: materializedState, frontier: newFrontier, applied: 0 });

      const peerResponse = {
        type: 'sync-response',
        frontier: {},
        patches: [],
      };
      const remotePeer = {
        processSyncRequest: vi.fn().mockResolvedValue(peerResponse),
        getFrontier: vi.fn().mockResolvedValue(new Map()),
      };

      const host = createMockHost({
        _cachedState: null,
        _lastFrontier: null,
        discoverWriters: vi.fn().mockResolvedValue([]),
        materialize: vi.fn().mockImplementation(async function () {
          host._cachedState = materializedState;
        }),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.syncWith(/** @type {*} */ (remotePeer));

      expect(host.materialize).toHaveBeenCalledOnce();
    });

    it('returns state when materialize option is true', async () => {
      const fakeState = {
        observedFrontier: new Map(),
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      const newFrontier = new Map([['alice', 'sha-a2']]);
      applySyncResponseMock.mockReturnValue({ state: fakeState, frontier: newFrontier, applied: 1 });

      const peerResponse = {
        type: 'sync-response',
        frontier: {},
        patches: [],
      };
      const remotePeer = {
        processSyncRequest: vi.fn().mockResolvedValue(peerResponse),
        getFrontier: vi.fn().mockResolvedValue(new Map()),
      };

      const host = createMockHost({
        _cachedState: fakeState,
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const result = await ctrl.syncWith(/** @type {*} */ (remotePeer), { materialize: true });

      expect(result.state).toBe(fakeState);
      expect(result.applied).toBe(1);
    });
  });

  describe('createSyncRequest', () => {
    it('returns a sync request with the local frontier', async () => {
      const host = createMockHost({
        discoverWriters: vi.fn().mockResolvedValue(['alice']),
        _persistence: {
          readRef: vi.fn().mockResolvedValue('sha-alice'),
          listRefs: vi.fn().mockResolvedValue([]),
        },
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      const request = await ctrl.createSyncRequest();

      expect(request).toHaveProperty('type', 'sync-request');
      expect(request).toHaveProperty('frontier');
      expect(request.frontier).toMatchObject({ alice: 'sha-alice' });
    });
  });

  describe('serve', () => {
    it('throws when port is not a number', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.serve(/** @type {*} */ ({ port: 'bad', httpPort: {} })))
        .rejects.toThrow('serve() requires a numeric port');
    });

    it('throws when httpPort is missing', async () => {
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await expect(ctrl.serve(/** @type {*} */ ({ port: 3000 })))
        .rejects.toThrow('serve() requires an httpPort adapter');
    });

    it('instantiates HttpSyncServer with correct args', async () => {
      httpSyncServerMock.mockClear();
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));
      const httpPort = { listen: vi.fn() };

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort,
        path: '/custom',
        maxRequestBytes: 1024,
      }));

      expect(httpSyncServerMock).toHaveBeenCalledOnce();
      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.httpPort).toBe(httpPort);
      expect(args.path).toBe('/custom');
      expect(args.maxRequestBytes).toBe(1024);
      expect(args.host).toBe('127.0.0.1');
    });

    it('enhances auth config with crypto and logger from host', async () => {
      httpSyncServerMock.mockClear();
      const mockCrypto = { subtle: {} };
      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
      const host = createMockHost({
        _crypto: mockCrypto,
        _logger: mockLogger,
      });
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort: { listen: vi.fn() },
        auth: { keys: { k: 's' } },
      }));

      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.auth.crypto).toBe(mockCrypto);
      expect(args.auth.logger).toBe(mockLogger);
      expect(args.auth.keys).toEqual({ k: 's' });
    });

    it('passes graph host as graph argument to HttpSyncServer', async () => {
      httpSyncServerMock.mockClear();
      const host = createMockHost();
      const ctrl = new SyncController(/** @type {*} */ (host));

      await ctrl.serve(/** @type {*} */ ({
        port: 3000,
        httpPort: { listen: vi.fn() },
      }));

      const args = httpSyncServerMock.mock.calls[0][0];
      expect(args.graph).toBe(host);
    });
  });

  describe('syncWith HTTP path', () => {
    /** @type {import('vitest').Mock} */
    let fetchMock;
    /** @type {ReturnType<typeof createMockHost>} */
    let host;
    /** @type {SyncController} */
    let ctrl;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const fakeState = {
        observedFrontier: new Map(),
        nodeAlive: { dots: new Map() },
        edgeAlive: { dots: new Map() },
      };
      host = createMockHost({
        _cachedState: fakeState,
        _lastFrontier: new Map(),
        discoverWriters: vi.fn().mockResolvedValue([]),
      });
      ctrl = new SyncController(/** @type {*} */ (host));

      // Default: retry calls fn once, timeout passes through
      retryMock.mockImplementation(async (fn) => await fn());
      timeoutMock.mockImplementation(async (_ms, fn) => {
        const ac = new AbortController();
        return await fn(ac.signal);
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('successful HTTP sync returns applied count', async () => {
      const validResponse = {
        type: 'sync-response',
        frontier: { alice: 'sha-a' },
        patches: [],
      };
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validResponse),
      });
      const newFrontier = new Map([['alice', 'sha-a']]);
      applySyncResponseMock.mockReturnValue({
        state: host._cachedState,
        frontier: newFrontier,
        applied: 5,
      });

      const result = await ctrl.syncWith('http://peer:3000/sync');

      expect(result.applied).toBe(5);
      expect(applySyncResponseMock).toHaveBeenCalled();
    });

    it('5xx status throws SyncError with E_SYNC_REMOTE', async () => {
      fetchMock.mockResolvedValue({ status: 502 });

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({
          code: 'E_SYNC_REMOTE',
        });
    });

    it('4xx status throws SyncError with E_SYNC_PROTOCOL', async () => {
      fetchMock.mockResolvedValue({ status: 400 });

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({
          code: 'E_SYNC_PROTOCOL',
        });
    });

    it('invalid JSON response throws SyncError with E_SYNC_PROTOCOL', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({
          code: 'E_SYNC_PROTOCOL',
        });
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
        .rejects.toMatchObject({
          code: 'E_SYNC_TIMEOUT',
        });
    });

    it('network error throws SyncError with E_SYNC_NETWORK', async () => {
      timeoutMock.mockImplementation(async (_ms, fn) => {
        const ac = new AbortController();
        return await fn(ac.signal);
      });
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(ctrl.syncWith('http://peer:3000/sync'))
        .rejects.toMatchObject({
          code: 'E_SYNC_NETWORK',
        });
    });

    it('shouldRetry: retries on E_SYNC_REMOTE but not E_SYNC_PROTOCOL', async () => {
      fetchMock.mockResolvedValue({ status: 502 });

      // Capture shouldRetry from retry mock
      /** @type {((err: unknown) => boolean) | undefined} */
      let capturedShouldRetry;
      /** @type {*} */ (retryMock).mockImplementation(async (/** @type {Function} */ fn, /** @type {*} */ opts) => {
        capturedShouldRetry = opts.shouldRetry;
        return await fn();
      });

      try {
        await ctrl.syncWith('http://peer:3000/sync');
      } catch {
        // Expected to throw
      }

      expect(capturedShouldRetry).toBeDefined();
      const shouldRetry = /** @type {(err: unknown) => boolean} */ (capturedShouldRetry);

      expect(shouldRetry(new SyncError('remote', { code: 'E_SYNC_REMOTE' }))).toBe(true);
      expect(shouldRetry(new SyncError('timeout', { code: 'E_SYNC_TIMEOUT' }))).toBe(true);
      expect(shouldRetry(new SyncError('network', { code: 'E_SYNC_NETWORK' }))).toBe(true);
      expect(shouldRetry(new SyncError('protocol', { code: 'E_SYNC_PROTOCOL' }))).toBe(false);
    });

    it('passes auth headers to fetch when auth option provided', async () => {
      // Provide a crypto mock that supports hash + hmac
      const mockCrypto = {
        hash: vi.fn().mockResolvedValue('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'),
        hmac: vi.fn().mockResolvedValue('hmac-signature-hex'),
      };
      host._crypto = mockCrypto;

      const validResponse = {
        type: 'sync-response',
        frontier: {},
        patches: [],
      };
      fetchMock.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(validResponse),
      });
      applySyncResponseMock.mockReturnValue({
        state: host._cachedState,
        frontier: new Map(),
        applied: 0,
      });

      await ctrl.syncWith('http://peer:3000/sync', {
        auth: { secret: 'test-secret', keyId: 'k1' },
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const fetchHeaders = fetchMock.mock.calls[0][1].headers;
      // Auth headers should contain x-warp-* prefixed headers
      const authHeaderKeys = Object.keys(fetchHeaders).filter(k => k.startsWith('x-warp-'));
      expect(authHeaderKeys.length).toBeGreaterThan(0);
    });
  });
});
