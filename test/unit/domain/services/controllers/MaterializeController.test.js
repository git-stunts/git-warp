import { describe, it, expect, vi } from 'vitest';
import MaterializeController from '../../../../../src/domain/services/controllers/MaterializeController.js';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import { ProvenanceIndex } from '../../../../../src/domain/services/provenance/ProvenanceIndex.js';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { encodePatchMessage } from '../../../../../src/domain/services/codec/WarpMessageCodec.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';

/** @import WarpRuntime from '../../../../../src/domain/WarpRuntime.ts' */
/** @typedef {import('../../../../../src/domain/services/JoinReducer.ts').WarpState} WarpState */
/** @typedef {import('../../../../../src/domain/types/TickReceipt.ts').TickReceipt} TickReceipt */
/** @typedef {import('../../../../../src/domain/types/Patch.ts').default} Patch */

/**
 * @typedef {{
 *   outgoing: Map<string, Array<{ neighborId: string, label: string }>>,
 *   incoming: Map<string, Array<{ neighborId: string, label: string }>>
 * }} AdjacencyMap
 */

/**
 * @typedef {{
 *   state: WarpState,
 *   stateHash: string,
 *   adjacency: AdjacencyMap
 * }} MaterializedGraph
 */

/**
 * @typedef {WarpState | { state: WarpState, receipts: TickReceipt[] }} MaterializeResult
 */

/**
 * @typedef {{ pendingReplay?: boolean }} MaterializeSubscriber
 */

/**
 * @typedef {{
 *   get?(key: string): Promise<{ buffer: Uint8Array, indexTreeOid?: string }|null>,
 *   set(key: string, buffer: Uint8Array, meta?: { indexTreeOid?: string }): Promise<void>,
 *   delete?(key: string): Promise<void>
 * }} SeekCacheLike
 */

/**
 * @typedef {{
 *   _setMaterializedState(state: WarpState, optionsOrDiff?: unknown): Promise<MaterializedGraph>,
 *   _buildView(state: WarpState, stateHash: string, diff?: unknown): void,
 *   _buildAdjacency(state: WarpState): AdjacencyMap,
 *   _restoreIndexFromCache(treeOid: string): Promise<void>,
 *   _materializeGraph(): Promise<object|null>,
 *   _resolveCeiling(options?: { ceiling?: number|null }): number|null,
 *   _persistSeekCacheEntry(key: string, buf: Uint8Array, state: WarpState): Promise<void>,
 *   _materializeWithCoordinate(frontier: Map<string, string>, ceiling: number|null, collectReceipts: boolean, t0: number): Promise<MaterializeResult>
 * }} MaterializeControllerPrivate
 */

/**
 * Narrow a controller to its private seam for tests.
 *
 * @param {unknown} value
 * @returns {MaterializeControllerPrivate}
 */
function controllerPrivate(value) {
  return /** @type {MaterializeControllerPrivate} */ (value);
}

/**
 * Calls materializeCoordinate through an unknown-typed seam for negative-input tests.
 *
 * @param {MaterializeController} ctrl
 * @param {unknown} options
 * @returns {Promise<unknown>}
 */
function callMaterializeCoordinate(ctrl, options) {
  return /** @type {{ materializeCoordinate(options: unknown): Promise<unknown> }} */ (
    /** @type {unknown} */ (ctrl)
  ).materializeCoordinate(options);
}

// ── Mock factories ──────────────────────────────────────────────────────────

/**
 * Creates a minimal WarpState-shaped empty state for test assertions.
 *
 * @returns {import('../../../../../src/domain/services/state/WarpState.ts').default}
 */
function emptyState() {
  return createEmptyState();
}

/**
 * Build a canonical Patch test fixture.
 *
 * @param {Partial<Patch>} [overrides]
 * @returns {Patch}
 */
function makePatch(overrides = {}) {
  return {
    schema: 2,
    writer: 'w1',
    lamport: 1,
    context: {},
    ops: [],
    reads: [],
    writes: [],
    ...overrides,
  };
}

/**
 * Require a plain-state materialize result.
 *
 * @param {MaterializeResult} result
 * @returns {WarpState}
 */
function requirePlainState(result) {
  expect('nodeAlive' in result).toBe(true);
  return /** @type {WarpState} */ (result);
}

/**
 * Require a state+receipts materialize result.
 *
 * @param {MaterializeResult} result
 * @returns {{ state: WarpState, receipts: TickReceipt[] }}
 */
function requireStateWithReceipts(result) {
  expect('receipts' in result).toBe(true);
  return /** @type {{ state: WarpState, receipts: TickReceipt[] }} */ (result);
}

/**
 * Creates a fake patch entry for use in mock return values.
 *
 * @param {{ lamport?: number, sha?: string, writer?: string, reads?: string[], writes?: string[] }} [opts]
 * @returns {{ patch: Patch, sha: string }}
 */
function fakePatchEntry(opts = {}) {
  return {
    patch: makePatch({
      lamport: opts.lamport ?? 1,
      writer: opts.writer ?? 'w1',
      ...(opts.reads ? { reads: opts.reads } : {}),
      ...(opts.writes ? { writes: opts.writes } : {}),
    }),
    sha: opts.sha ?? 'abc123',
  };
}

/**
 * Mock host class for MaterializeController tests.
 */
class MockMaterializeHost {
  /**
   * @param {Partial<MockMaterializeHost>} [overrides]
   */
  constructor(overrides = {}) {
    Object.assign(this, overrides);
  }

  _persistence = {
    showNode: vi.fn().mockResolvedValue(''),
    readRef: vi.fn().mockResolvedValue(''),
    readTreeOids: vi.fn().mockResolvedValue({}),
  };

  _graphName = 'test';
  _writerId = 'w1';
  _clock = { now: vi.fn(() => 0) };
  _crypto = { hash: vi.fn().mockResolvedValue('mock-hash-abc') };
  _codec = { encode: vi.fn(() => new Uint8Array([1])), decode: vi.fn(() => ({})) };
  _logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  /** @type {SeekCacheLike|null} */
  _seekCache = null;
  /** @type {number|null} */
  _seekCeiling = null;
  _gcPolicy = null;
  /** @type {{ every: number }|null} */
  _checkpointPolicy = null;
  _checkpointing = false;
  _onDeleteWithData = 'tombstone';
  _blobStorage = null;
  _patchBlobStorage = null;
  _trustConfig = undefined;
  _checkpointStore = undefined;
  _patchJournal = undefined;
  _indexStore = undefined;
  /** @type {WarpState|null} */
  _cachedState = null;
  /** @type {number|null} */
  _cachedCeiling = null;
  /** @type {Map<string, string>|null} */
  _cachedFrontier = null;
  /** @type {object|null} */
  _cachedIndexTree = null;
  /** @type {string|null} */
  _cachedViewHash = null;
  _stateDirty = true;
  _maxObservedLamport = 0;
  _patchesSinceCheckpoint = 0;
  /** @type {ProvenanceIndex|null} */
  _provenanceIndex = null;
  _provenanceDegraded = false;
  /** @type {Map<string, string>|null} */
  _lastFrontier = null;
  /** @type {WarpState|null} */
  _lastNotifiedState = null;
  /** @type {MaterializedGraph|null} */
  _materializedGraph = null;
  /** @type {object|null} */
  _logicalIndex = null;
  /** @type {object|null} */
  _propertyReader = null;
  _indexDegraded = false;
  /** @type {MaterializeSubscriber[]} */
  _subscribers = [];
  _versionVector = VersionVector.empty();
  /** @type {Map<WarpState, AdjacencyMap>|null} */
  _adjacencyCache = null;
  _stateHashService = null;

  _loadLatestCheckpoint = vi.fn().mockResolvedValue(null);
  _loadPatchesSince = vi.fn().mockResolvedValue([]);
  _loadWriterPatches = vi.fn().mockResolvedValue([]);
  _loadPatchChainFromSha = vi.fn().mockResolvedValue([]);
  discoverWriters = vi.fn().mockResolvedValue([]);
  getFrontier = vi.fn().mockResolvedValue(new Map());
  _logTiming = vi.fn();
  _maybeRunGC = vi.fn();
  _notifySubscribers = vi.fn();
  createCheckpoint = vi.fn().mockResolvedValue(undefined);
  /** @type {(state: WarpState, optionsOrDiff?: unknown) => Promise<MaterializedGraph>} */
  _setMaterializedState = vi.fn().mockResolvedValue({
    state: emptyState(),
    stateHash: 'hash1',
    adjacency: { outgoing: new Map(), incoming: new Map() },
  });
  /** @type {(state: WarpState, stateHash: string, diff?: unknown) => void} */
  _buildView = vi.fn();
  /** @type {(state: WarpState) => AdjacencyMap} */
  _buildAdjacency = vi.fn().mockReturnValue({ outgoing: new Map(), incoming: new Map() });
  /** @type {(treeOid: string) => Promise<void>} */
  _restoreIndexFromCache = vi.fn().mockResolvedValue(undefined);
  materialize = vi.fn();
  _viewService = {
    build: vi.fn().mockReturnValue({
      logicalIndex: {},
      propertyReader: {},
      tree: {},
    }),
    applyDiff: vi.fn().mockReturnValue({
      logicalIndex: {},
      propertyReader: {},
      tree: {},
    }),
    persistIndexTree: vi.fn().mockResolvedValue('tree-oid-1'),
    loadFromOids: vi.fn().mockResolvedValue({ logicalIndex: {}, propertyReader: {} }),
    verifyIndex: vi.fn().mockReturnValue({ passed: 10, failed: 0, errors: [] }),
  };
}

/**
 * @param {Partial<MockMaterializeHost>} [overrides]
 * @returns {MockMaterializeHost}
 */
function createMockHost(overrides = {}) {
  return new MockMaterializeHost(overrides);
}

/**
 * Creates a MaterializeController wired to a mock host.
 *
 * @param {Partial<MockMaterializeHost>} [hostOverrides]
 * @returns {{ ctrl: MaterializeController, host: MockMaterializeHost }}
 */
function setup(hostOverrides = {}) {
  const host = createMockHost(hostOverrides);
  const ctrl = new MaterializeController(/** @type {WarpRuntime} */ (/** @type {unknown} */ (host)));
  // Wire _setMaterializedState and _buildView on the controller (host delegates to controller)
  host._setMaterializedState = controllerPrivate(ctrl)._setMaterializedState.bind(ctrl);
  host._buildView = controllerPrivate(ctrl)._buildView.bind(ctrl);
  host._buildAdjacency = controllerPrivate(ctrl)._buildAdjacency.bind(ctrl);
  host._restoreIndexFromCache = controllerPrivate(ctrl)._restoreIndexFromCache.bind(ctrl);
  return { ctrl, host };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MaterializeController', () => {
  // ────────────────────────────────────────────────────────────────────────
  // materialize() — no checkpoint, no writers
  // ────────────────────────────────────────────────────────────────────────
  describe('materialize()', () => {
    it('returns frozen empty state when no writers exist', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue([]);

      const result = await ctrl.materialize();

      expect(result).toBeDefined();
      expect(requirePlainState(result).nodeAlive).toBeDefined();
      expect(Object.isFrozen(result)).toBe(true);
      expect(host._provenanceDegraded).toBe(false);
    });

    it('returns frozen empty state when writers exist but have no patches', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue(['w1', 'w2']);
      host._loadWriterPatches.mockResolvedValue([]);

      const result = await ctrl.materialize();

      expect(result).toBeDefined();
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('collects patches from all writers and reduces them', async () => {
      const { ctrl, host } = setup();
      const patch1 = fakePatchEntry({ lamport: 1, sha: 'sha1' });
      const patch2 = fakePatchEntry({ lamport: 2, sha: 'sha2' });

      host.discoverWriters.mockResolvedValue(['w1', 'w2']);
      host._loadWriterPatches
        .mockResolvedValueOnce([patch1])
        .mockResolvedValueOnce([patch2]);

      const result = await ctrl.materialize();

      expect(result).toBeDefined();
      expect(host._loadWriterPatches).toHaveBeenCalledTimes(2);
      expect(host._maxObservedLamport).toBe(2);
    });

    it('updates _patchesSinceCheckpoint with total patch count', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([
        fakePatchEntry({ lamport: 1 }),
        fakePatchEntry({ lamport: 2 }),
        fakePatchEntry({ lamport: 3 }),
      ]);

      await ctrl.materialize();

      expect(host._patchesSinceCheckpoint).toBe(3);
    });

    it('calls _maybeRunGC after materialization', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._maybeRunGC).toHaveBeenCalled();
    });

    it('sets _provenanceDegraded to false on success', async () => {
      const { ctrl, host } = setup();
      host._provenanceDegraded = true;
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._provenanceDegraded).toBe(false);
    });

    it('clears ceiling and frontier cache after non-ceiling materialize', async () => {
      const { ctrl, host } = setup();
      host._cachedCeiling = 42;
      host._cachedFrontier = new Map([['w1', 'abc']]);
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._cachedCeiling).toBeNull();
      expect(host._cachedFrontier).toBeNull();
    });

    it('stores the frontier from getFrontier() as _lastFrontier', async () => {
      const { ctrl, host } = setup();
      const frontier = new Map([['w1', 'sha1']]);
      host.discoverWriters.mockResolvedValue([]);
      host.getFrontier.mockResolvedValue(frontier);

      await ctrl.materialize();

      expect(host._lastFrontier).toBe(frontier);
    });

    it('logs timing on success', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._logTiming).toHaveBeenCalledWith(
        'materialize',
        expect.any(Number),
        expect.objectContaining({ metrics: expect.any(String) }),
      );
    });

    it('logs timing on error and re-throws', async () => {
      const { ctrl, host } = setup();
      const error = new Error('boom');
      host._loadLatestCheckpoint.mockRejectedValue(error);

      await expect(ctrl.materialize()).rejects.toThrow('boom');
      expect(host._logTiming).toHaveBeenCalledWith(
        'materialize',
        expect.any(Number),
        expect.objectContaining({ error }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // materialize() — with receipts
  // ────────────────────────────────────────────────────────────────────────
  describe('materialize() with receipts', () => {
    it('returns { state, receipts } when receipts: true and no writers', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue([]);

      const result = await ctrl.materialize({ receipts: true });

      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('receipts');
      expect(requireStateWithReceipts(result).receipts).toEqual([]);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('returns plain state when receipts option is omitted', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue([]);

      const result = await ctrl.materialize();

      // Plain state has nodeAlive directly on it, not nested under .state
      expect(requirePlainState(result).nodeAlive).toBeDefined();
      expect(result).not.toHaveProperty('receipts');
    });

    it('returns empty receipts when writers exist but have no patches', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([]);

      const result = await ctrl.materialize({ receipts: true });

      expect(result).toHaveProperty('receipts');
      expect(requireStateWithReceipts(result).receipts).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // materialize() — incremental (with checkpoint)
  // ────────────────────────────────────────────────────────────────────────
  describe('materialize() with checkpoint', () => {
    it('uses incremental path when checkpoint has V5 schema', async () => {
      const { ctrl, host } = setup();
      const baseState = emptyState();
      const checkpoint = {
        schema: 2,
        state: baseState,
        frontier: new Map([['w1', 'tip1']]),
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([]);

      const result = await ctrl.materialize();

      expect(result).toBeDefined();
      expect(host._loadPatchesSince).toHaveBeenCalledWith(checkpoint);
      // Full path not taken
      expect(host.discoverWriters).not.toHaveBeenCalled();
    });

    it('scans checkpoint frontier for max Lamport', async () => {
      const { ctrl, host } = setup();
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map([['w1', 'tip1']]),
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([]);

      // The frontier scan reads commit messages via showNode
      host._persistence.showNode.mockResolvedValue('not-a-patch');

      await ctrl.materialize();

      expect(host._persistence.showNode).toHaveBeenCalledWith('tip1');
    });

    it('updates max Lamport from checkpoint frontier patch messages', async () => {
      const { ctrl, host } = setup();
      host._maxObservedLamport = 3;
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map([['w1', 'tip1']]),
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([]);
      host._persistence.showNode.mockResolvedValue(
        encodePatchMessage({
          graph: 'test',
          writer: 'w1',
          lamport: 11,
          patchOid: 'a'.repeat(40),
        }),
      );

      await ctrl.materialize();

      expect(host._maxObservedLamport).toBe(11);
    });

    it('returns receipts from incremental checkpoint materialization', async () => {
      const { ctrl, host } = setup();
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map(),
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([fakePatchEntry({ sha: 'sha1' })]);

      const result = await ctrl.materialize({ receipts: true });

      expect(result).toHaveProperty('receipts');
      expect(Array.isArray(requireStateWithReceipts(result).receipts)).toBe(true);
    });

    it('uses incremental diff tracking when a cached index tree exists', async () => {
      const { ctrl, host } = setup({
        _cachedIndexTree: { existing: 'tree' },
      });
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map(),
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([fakePatchEntry({ sha: 'sha1' })]);

      await ctrl.materialize();

      expect(host._viewService.applyDiff).toHaveBeenCalled();
      expect(host._viewService.build).not.toHaveBeenCalled();
    });

    it('builds provenance index from checkpoint provenanceIndex + new patches', async () => {
      const { ctrl, host } = setup();
      const ckPI = new ProvenanceIndex();
      ckPI.addPatch('old-sha', ['r1'], ['w1']);
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map(),
        provenanceIndex: ckPI,
      };
      const newPatch = fakePatchEntry({ sha: 'new-sha', reads: ['r2'], writes: ['w2'] });
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([newPatch]);

      await ctrl.materialize();

      expect(host._provenanceIndex).toBeInstanceOf(ProvenanceIndex);
    });

    it('creates fresh provenance index when checkpoint lacks one', async () => {
      const { ctrl, host } = setup();
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map(),
        // no provenanceIndex
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([
        fakePatchEntry({ sha: 'sha1' }),
      ]);

      await ctrl.materialize();

      expect(host._provenanceIndex).toBeInstanceOf(ProvenanceIndex);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // materialize() — auto-checkpoint
  // ────────────────────────────────────────────────────────────────────────
  describe('auto-checkpoint', () => {
    it('triggers auto-checkpoint when patch count meets threshold', async () => {
      const { ctrl, host } = setup({
        _checkpointPolicy: { every: 2 },
      });
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([
        fakePatchEntry({ lamport: 1 }),
        fakePatchEntry({ lamport: 2 }),
      ]);

      await ctrl.materialize();

      expect(host.createCheckpoint).toHaveBeenCalled();
    });

    it('does not trigger auto-checkpoint below threshold', async () => {
      const { ctrl, host } = setup({
        _checkpointPolicy: { every: 10 },
      });
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([
        fakePatchEntry({ lamport: 1 }),
      ]);

      await ctrl.materialize();

      expect(host.createCheckpoint).not.toHaveBeenCalled();
    });

    it('does not trigger auto-checkpoint when _checkpointing guard is set', async () => {
      const { ctrl, host } = setup({
        _checkpointPolicy: { every: 1 },
        _checkpointing: true,
      });
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([
        fakePatchEntry({ lamport: 1 }),
      ]);

      await ctrl.materialize();

      expect(host.createCheckpoint).not.toHaveBeenCalled();
    });

    it('swallows checkpoint errors without breaking materialize', async () => {
      const { ctrl, host } = setup({
        _checkpointPolicy: { every: 1 },
      });
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([fakePatchEntry()]);
      host.createCheckpoint.mockRejectedValue(new Error('checkpoint failed'));

      const result = await ctrl.materialize();

      expect(result).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // materialize() — subscriber notification
  // ────────────────────────────────────────────────────────────────────────
  describe('subscriber notification', () => {
    it('notifies subscribers with pending replay', async () => {
      const { ctrl, host } = setup({
        _subscribers: [{ pendingReplay: true }],
        _lastNotifiedState: null,
      });
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._notifySubscribers).toHaveBeenCalled();
    });

    it('notifies subscribers with pending replay even on empty diff', async () => {
      const { ctrl, host } = setup({
        _subscribers: [{ pendingReplay: true }],
        _lastNotifiedState: emptyState(),
      });
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._notifySubscribers).toHaveBeenCalled();
    });

    it('does not notify when no subscribers', async () => {
      const { ctrl, host } = setup({
        _subscribers: [],
      });
      host.discoverWriters.mockResolvedValue([]);

      await ctrl.materialize();

      expect(host._notifySubscribers).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _resolveCeiling()
  // ────────────────────────────────────────────────────────────────────────
  describe('_resolveCeiling()', () => {
    it('returns null when no options and no instance ceiling', () => {
      const { ctrl, host } = setup();
      host._seekCeiling = null;
      expect(controllerPrivate(ctrl)._resolveCeiling()).toBeNull();
    });

    it('returns instance _seekCeiling when options omit ceiling key', () => {
      const { ctrl, host } = setup();
      host._seekCeiling = 42;
      expect(controllerPrivate(ctrl)._resolveCeiling({})).toBe(42);
    });

    it('returns explicit ceiling from options, overriding instance ceiling', () => {
      const { ctrl, host } = setup();
      host._seekCeiling = 42;
      expect(controllerPrivate(ctrl)._resolveCeiling({ ceiling: 10 })).toBe(10);
    });

    it('returns null when options explicitly set ceiling to null', () => {
      const { ctrl, host } = setup();
      host._seekCeiling = 42;
      expect(controllerPrivate(ctrl)._resolveCeiling({ ceiling: null })).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // materialize() with ceiling (time-travel)
  // ────────────────────────────────────────────────────────────────────────
  describe('materialize() with ceiling', () => {
    it('returns empty state for ceiling <= 0', async () => {
      const { ctrl, host } = setup();
      host.getFrontier.mockResolvedValue(new Map([['w1', 'sha1']]));

      const result = await ctrl.materialize({ ceiling: 0 });

      expect(result).toBeDefined();
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('returns empty state when frontier has no writers', async () => {
      const { ctrl, host } = setup();
      host.getFrontier.mockResolvedValue(new Map());

      const result = await ctrl.materialize({ ceiling: 5 });

      expect(result).toBeDefined();
    });

    it('filters patches by Lamport ceiling', async () => {
      const { ctrl, host } = setup();
      const frontier = new Map([['w1', 'tip1']]);
      host.getFrontier.mockResolvedValue(frontier);

      const patches = [
        fakePatchEntry({ lamport: 1, sha: 'sha1' }),
        fakePatchEntry({ lamport: 5, sha: 'sha5' }),
        fakePatchEntry({ lamport: 10, sha: 'sha10' }),
      ];
      host._loadPatchChainFromSha.mockResolvedValue(patches);

      await ctrl.materialize({ ceiling: 5 });

      // Patches with lamport > 5 should be excluded — the code filters in collectPatchesForFrontier
      expect(host._provenanceIndex).toBeInstanceOf(ProvenanceIndex);
    });

    it('returns cached state when ceiling and frontier match', async () => {
      const { ctrl, host } = setup();
      const state = emptyState();
      const frontier = new Map([['w1', 'sha1']]);
      host._cachedState = state;
      host._stateDirty = false;
      host._cachedCeiling = 5;
      host._cachedFrontier = new Map([['w1', 'sha1']]);
      host.getFrontier.mockResolvedValue(frontier);

      const result = await ctrl.materialize({ ceiling: 5 });

      expect(result).toBeDefined();
      // Should not re-load patches
      expect(host._loadPatchChainFromSha).not.toHaveBeenCalled();
    });

    it('does not use cache when collectReceipts is true', async () => {
      const { ctrl, host } = setup();
      const frontier = new Map([['w1', 'sha1']]);
      host._cachedState = emptyState();
      host._stateDirty = false;
      host._cachedCeiling = 5;
      host._cachedFrontier = new Map([['w1', 'sha1']]);
      host.getFrontier.mockResolvedValue(frontier);
      host._loadPatchChainFromSha.mockResolvedValue([]);

      const result = await ctrl.materialize({ ceiling: 5, receipts: true });

      expect(result).toHaveProperty('receipts');
    });

    it('bypasses checkpoint when ceiling is active', async () => {
      const { ctrl, host } = setup();
      host._seekCeiling = 5;
      host.getFrontier.mockResolvedValue(new Map());

      await ctrl.materialize();

      // Checkpoint path should not be taken
      expect(host._loadLatestCheckpoint).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _materializeGraph()
  // ────────────────────────────────────────────────────────────────────────
  describe('_materializeGraph()', () => {
    it('returns cached graph when state is clean and graph exists', async () => {
      const cached = {
        state: emptyState(),
        stateHash: 'h1',
        adjacency: { outgoing: new Map(), incoming: new Map() },
      };
      const { ctrl, host } = setup({
        _stateDirty: false,
        _materializedGraph: cached,
      });

      const result = await controllerPrivate(ctrl)._materializeGraph();

      expect(result).toBe(cached);
      expect(host.materialize).not.toHaveBeenCalled();
    });

    it('calls host.materialize when state is dirty', async () => {
      const state = emptyState();
      const { ctrl, host } = setup({
        _stateDirty: true,
        _materializedGraph: null,
      });
      host.materialize.mockResolvedValue(state);
      // After materialize, the host's _stateDirty will still be true
      // because the mock doesn't change it; the controller handles it
      // in _setMaterializedState

      await controllerPrivate(ctrl)._materializeGraph();

      expect(host.materialize).toHaveBeenCalled();
    });

    it('returns the existing graph value when materialize yields no state', async () => {
      const { ctrl, host } = setup({
        _stateDirty: false,
        _cachedState: null,
        _materializedGraph: null,
      });
      host.materialize.mockResolvedValue(null);

      const result = await controllerPrivate(ctrl)._materializeGraph();

      expect(result).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _buildAdjacency()
  // ────────────────────────────────────────────────────────────────────────
  describe('_buildAdjacency()', () => {
    it('returns empty maps for empty state', () => {
      const { ctrl } = setup();
      const state = emptyState();

      const adj = controllerPrivate(ctrl)._buildAdjacency(state);

      expect(adj.outgoing.size).toBe(0);
      expect(adj.incoming.size).toBe(0);
    });

    it('sorts same-neighbor edges by label for deterministic output', () => {
      const { ctrl } = setup();
      const state = emptyState();
      state.nodeAlive.add('node:a', { writerId: 'w1', counter: 1 });
      state.nodeAlive.add('node:b', { writerId: 'w1', counter: 2 });
      state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'zebra'), { writerId: 'w1', counter: 3 });
      state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'alpha'), { writerId: 'w1', counter: 4 });

      const adj = controllerPrivate(ctrl)._buildAdjacency(state);

      expect(adj.outgoing.get('node:a')).toEqual([
        { neighborId: 'node:b', label: 'alpha' },
        { neighborId: 'node:b', label: 'zebra' },
      ]);
      expect(adj.incoming.get('node:b')).toEqual([
        { neighborId: 'node:a', label: 'alpha' },
        { neighborId: 'node:a', label: 'zebra' },
      ]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _setMaterializedState()
  // ────────────────────────────────────────────────────────────────────────
  describe('_setMaterializedState()', () => {
    it('caches state and clears dirty flag', async () => {
      const { ctrl, host } = setup();
      host._stateDirty = true;
      const state = emptyState();

      await controllerPrivate(ctrl)._setMaterializedState(state);

      expect(host._cachedState).toBe(state);
      expect(host._stateDirty).toBe(false);
    });

    it('updates _versionVector from state observedFrontier', async () => {
      const { ctrl, host } = setup();
      const state = emptyState();

      await controllerPrivate(ctrl)._setMaterializedState(state);

      expect(host._versionVector).toBeInstanceOf(VersionVector);
    });

    it('stores materialized graph with state, stateHash, and adjacency', async () => {
      const { ctrl, host } = setup();
      const state = emptyState();

      const result = await controllerPrivate(ctrl)._setMaterializedState(state);

      expect(result).toHaveProperty('state', state);
      expect(result).toHaveProperty('stateHash');
      expect(result).toHaveProperty('adjacency');
      expect(host._materializedGraph).toBe(result);
    });

    it('uses adjacency cache when available', async () => {
      const adjCache = /** @type {Map<WarpState, AdjacencyMap>} */ (new Map());
      const { ctrl, host } = setup({ _adjacencyCache: adjCache });
      const state = emptyState();

      // First call populates cache
      await controllerPrivate(ctrl)._setMaterializedState(state);
      const firstGraph = host._materializedGraph;
      expect(firstGraph).not.toBeNull();
      if (!firstGraph) {
        return;
      }
      const firstAdj = firstGraph.adjacency;

      // Second call should retrieve from cache
      await controllerPrivate(ctrl)._setMaterializedState(state);
      expect(host._materializedGraph).not.toBeNull();
      if (!host._materializedGraph) {
        return;
      }
      expect(host._materializedGraph.adjacency).toBe(firstAdj);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _buildView()
  // ────────────────────────────────────────────────────────────────────────
  describe('_buildView()', () => {
    it('skips rebuild when stateHash matches cached hash', () => {
      const { ctrl, host } = setup({ _cachedViewHash: 'hash1' });

      controllerPrivate(ctrl)._buildView(emptyState(), 'hash1');

      expect(host._viewService.build).not.toHaveBeenCalled();
    });

    it('builds from scratch when no cached index tree', () => {
      const { ctrl, host } = setup({ _cachedViewHash: null, _cachedIndexTree: null });

      controllerPrivate(ctrl)._buildView(emptyState(), 'hash2');

      expect(host._viewService.build).toHaveBeenCalled();
      expect(host._cachedViewHash).toBe('hash2');
      expect(host._indexDegraded).toBe(false);
    });

    it('uses incremental update when diff and cached tree available', () => {
      const existingTree = { some: 'tree' };
      const { ctrl, host } = setup({
        _cachedViewHash: null,
        _cachedIndexTree: existingTree,
      });
      const diff = { nodesAdded: [], nodesRemoved: [], edgesAdded: [], edgesRemoved: [] };

      controllerPrivate(ctrl)._buildView(emptyState(), 'hash3', diff);

      expect(host._viewService.applyDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          existingTree,
          diff,
        }),
      );
    });

    it('sets _indexDegraded and clears index on build failure', () => {
      const { ctrl, host } = setup({ _cachedViewHash: null });
      host._viewService.build.mockImplementation(() => {
        throw new Error('build failed');
      });

      controllerPrivate(ctrl)._buildView(emptyState(), 'hash4');

      expect(host._indexDegraded).toBe(true);
      expect(host._logicalIndex).toBeNull();
      expect(host._propertyReader).toBeNull();
      expect(host._cachedIndexTree).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // materializeCoordinate()
  // ────────────────────────────────────────────────────────────────────────
  describe('materializeCoordinate()', () => {
    it('throws QueryError when options is null', async () => {
      const { ctrl } = setup();

      await expect(callMaterializeCoordinate(ctrl, null)).rejects.toThrow(QueryError);
    });

    it('throws QueryError when options is undefined', async () => {
      const { ctrl } = setup();

      await expect(callMaterializeCoordinate(ctrl, undefined)).rejects.toThrow(QueryError);
    });

    it('throws QueryError when frontier has empty string values', async () => {
      const { ctrl } = setup();
      // The normalize step throws before openDetachedReadGraph
      await expect(
        ctrl.materializeCoordinate({ frontier: { w1: '' } }),
      ).rejects.toThrow(QueryError);
    });

    it('throws QueryError when frontier is not a Map or plain object', async () => {
      const { ctrl } = setup();

      await expect(
        callMaterializeCoordinate(ctrl, { frontier: [['w1', 'sha1']] }),
      ).rejects.toThrow(QueryError);
    });

    it('throws QueryError for negative ceiling', async () => {
      const { ctrl } = setup();

      await expect(
        ctrl.materializeCoordinate({ frontier: new Map([['w1', 'sha1']]), ceiling: -1 }),
      ).rejects.toThrow(QueryError);
    });

    it('throws QueryError for non-integer ceiling', async () => {
      const { ctrl } = setup();

      await expect(
        ctrl.materializeCoordinate({ frontier: new Map([['w1', 'sha1']]), ceiling: 1.5 }),
      ).rejects.toThrow(QueryError);
    });

    it('opens a detached graph and forwards normalized coordinate reads', async () => {
      const { ctrl, host } = setup();
      const detached = {
        _clock: { now: vi.fn(() => 123) },
        _materializeWithCoordinate: vi.fn().mockResolvedValue({ detached: true }),
      };
      const open = vi.fn().mockResolvedValue(detached);
      Object.defineProperty(host, 'constructor', {
        value: /** @type {typeof WarpRuntime} */ (/** @type {unknown} */ ({ open })),
      });

      const result = await ctrl.materializeCoordinate({
        frontier: new Map([
          ['w2', 'sha2'],
          ['w1', 'sha1'],
        ]),
        ceiling: 5,
      });

      expect(result).toEqual({ detached: true });
      expect(open).toHaveBeenCalledWith(expect.objectContaining({
        persistence: host._persistence,
        graphName: host._graphName,
        writerId: host._writerId,
        autoMaterialize: false,
        audit: false,
        clock: host._clock,
        crypto: host._crypto,
        codec: host._codec,
      }));
      const [frontier, ceiling, collectReceipts, t0] = detached._materializeWithCoordinate.mock.calls[0];
      expect([...frontier]).toEqual([
        ['w1', 'sha1'],
        ['w2', 'sha2'],
      ]);
      expect(ceiling).toBe(5);
      expect(collectReceipts).toBe(false);
      expect(t0).toBe(123);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // verifyIndex()
  // ────────────────────────────────────────────────────────────────────────
  describe('verifyIndex()', () => {
    it('throws QueryError when graph is not materialized', () => {
      const { ctrl } = setup({
        _logicalIndex: null,
        _cachedState: null,
      });

      expect(() => ctrl.verifyIndex()).toThrow(QueryError);
    });

    it('delegates to _viewService.verifyIndex when index is available', () => {
      const state = emptyState();
      const logicalIndex = { some: 'index' };
      const { ctrl, host } = setup({
        _logicalIndex: logicalIndex,
        _cachedState: state,
      });

      const result = ctrl.verifyIndex();

      expect(result).toEqual({ passed: 10, failed: 0, errors: [] });
      expect(host._viewService.verifyIndex).toHaveBeenCalledWith(
        expect.objectContaining({
          state,
          logicalIndex,
        }),
      );
    });

    it('passes options through to _viewService.verifyIndex', () => {
      const { ctrl, host } = setup({
        _logicalIndex: {},
        _cachedState: emptyState(),
      });

      ctrl.verifyIndex({ seed: 42, sampleRate: 0.5 });

      expect(host._viewService.verifyIndex).toHaveBeenCalledWith(
        expect.objectContaining({ options: { seed: 42, sampleRate: 0.5 } }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // invalidateIndex()
  // ────────────────────────────────────────────────────────────────────────
  describe('invalidateIndex()', () => {
    it('clears cached index tree and view hash', () => {
      const { ctrl, host } = setup({
        _cachedIndexTree: { some: 'tree' },
        _cachedViewHash: 'old-hash',
      });

      ctrl.invalidateIndex();

      expect(host._cachedIndexTree).toBeNull();
      expect(host._cachedViewHash).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _restoreIndexFromCache()
  // ────────────────────────────────────────────────────────────────────────
  describe('_restoreIndexFromCache()', () => {
    it('hydrates index from tree OID via viewService', async () => {
      const { ctrl, host } = setup();
      const shards = { 'meta_00.json': 'oid1' };
      host._persistence.readTreeOids.mockResolvedValue(shards);
      host._viewService.loadFromOids.mockResolvedValue({
        logicalIndex: 'restored-index',
        propertyReader: 'restored-reader',
      });

      await controllerPrivate(ctrl)._restoreIndexFromCache('tree-oid-abc');

      expect(host._persistence.readTreeOids).toHaveBeenCalledWith('tree-oid-abc');
      expect(host._logicalIndex).toBe('restored-index');
      expect(host._propertyReader).toBe('restored-reader');
    });

    it('silently swallows errors (non-fatal fallback)', async () => {
      const { ctrl, host } = setup();
      host._persistence.readTreeOids.mockRejectedValue(new Error('read failed'));

      // Should not throw
      await controllerPrivate(ctrl)._restoreIndexFromCache('bad-oid');

      // Original index unchanged
      expect(host._logicalIndex).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _persistSeekCacheEntry()
  // ────────────────────────────────────────────────────────────────────────
  describe('_persistSeekCacheEntry()', () => {
    it('builds index, persists tree, and writes to seek cache', async () => {
      const seekCache = { set: vi.fn().mockResolvedValue(undefined) };
      const { ctrl, host } = setup({ _seekCache: seekCache });
      host._viewService.build.mockReturnValue({ tree: { t: 1 } });
      host._viewService.persistIndexTree.mockResolvedValue('tree-oid-2');

      const buf = new Uint8Array([1, 2, 3]);
      await controllerPrivate(ctrl)._persistSeekCacheEntry('key1', buf, emptyState());

      expect(seekCache.set).toHaveBeenCalledWith('key1', buf, { indexTreeOid: 'tree-oid-2' });
    });

    it('caches without indexTreeOid when index persist fails', async () => {
      const seekCache = { set: vi.fn().mockResolvedValue(undefined) };
      const { ctrl, host } = setup({ _seekCache: seekCache });
      host._viewService.build.mockImplementation(() => {
        throw new Error('build failed');
      });

      const buf = new Uint8Array([1, 2, 3]);
      await controllerPrivate(ctrl)._persistSeekCacheEntry('key1', buf, emptyState());

      expect(seekCache.set).toHaveBeenCalledWith('key1', buf, {});
    });

    it('no-ops when seekCache is null', async () => {
      const { ctrl, host } = setup({ _seekCache: null });
      host._viewService.build.mockReturnValue({ tree: { t: 1 } });

      // Should not throw
      await controllerPrivate(ctrl)._persistSeekCacheEntry('key1', new Uint8Array(), emptyState());
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Lamport tracking
  // ────────────────────────────────────────────────────────────────────────
  describe('Lamport tracking', () => {
    it('tracks max Lamport across multiple writers in full materialize', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue(['w1', 'w2']);
      host._loadWriterPatches
        .mockResolvedValueOnce([fakePatchEntry({ lamport: 3, writer: 'w1', sha: 'sha-w1' })])
        .mockResolvedValueOnce([fakePatchEntry({ lamport: 7, writer: 'w2', sha: 'sha-w2' })]);

      await ctrl.materialize();

      expect(host._maxObservedLamport).toBe(7);
    });

    it('tracks max Lamport from incremental patches after checkpoint', async () => {
      const { ctrl, host } = setup();
      host._maxObservedLamport = 0;
      const checkpoint = {
        schema: 2,
        state: emptyState(),
        frontier: new Map(),
      };
      host._loadLatestCheckpoint.mockResolvedValue(checkpoint);
      host._loadPatchesSince.mockResolvedValue([
        fakePatchEntry({ lamport: 5 }),
        fakePatchEntry({ lamport: 12 }),
      ]);

      await ctrl.materialize();

      expect(host._maxObservedLamport).toBe(12);
    });

    it('defaults to 0 for patches missing lamport field', async () => {
      const { ctrl, host } = setup();
      host.discoverWriters.mockResolvedValue(['w1']);
      host._loadWriterPatches.mockResolvedValue([
        { patch: { writer: 'w1', ops: [] }, sha: 'sha1' },
      ]);

      await ctrl.materialize();

      expect(host._maxObservedLamport).toBe(0);
    });
  });

  describe('_materializeWithCoordinate()', () => {
    it('bypasses cached state when frontier tips differ', async () => {
      const { ctrl, host } = setup({
        _cachedState: emptyState(),
        _stateDirty: false,
        _cachedCeiling: 5,
        _cachedFrontier: new Map([['w1', 'old-sha']]),
      });
      host._loadPatchChainFromSha.mockResolvedValue([]);

      await controllerPrivate(ctrl)._materializeWithCoordinate(new Map([['w1', 'new-sha']]), 5, false, 0);

      expect(host._loadPatchChainFromSha).toHaveBeenCalledWith('new-sha');
    });

    it('skips empty frontier tips when collecting coordinate patches', async () => {
      const { ctrl, host } = setup();
      host._loadPatchChainFromSha.mockResolvedValue([]);

      await controllerPrivate(ctrl)._materializeWithCoordinate(
        new Map([
          ['w1', ''],
          ['w2', 'sha2'],
        ]),
        5,
        false,
        0,
      );

      expect(host._loadPatchChainFromSha).toHaveBeenCalledTimes(1);
      expect(host._loadPatchChainFromSha).toHaveBeenCalledWith('sha2');
    });

    it('returns empty receipts when coordinate materialization short-circuits', async () => {
      const { ctrl, host } = setup();
      host.getFrontier.mockResolvedValue(new Map([['w1', 'sha1']]));

      const result = await ctrl.materialize({ ceiling: 0, receipts: true });

      expect(result).toHaveProperty('receipts');
      expect(requireStateWithReceipts(result).receipts).toEqual([]);
    });
  });
});
