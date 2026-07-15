import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckpointController from '../../../../../src/domain/services/controllers/CheckpointController.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import SchemaUnsupportedError from '../../../../../src/domain/errors/SchemaUnsupportedError.ts';
import GCPolicy from '../../../../../src/domain/services/GCPolicy.ts';
import GCExecuteResult from '../../../../../src/domain/services/GCExecuteResult.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';

/**
 * Builds a GCPolicy where every threshold is infinite EXCEPT the tombstone
 * ratio threshold, which the caller chooses. `0` → any non-zero ratio
 * trips GC. `1` → no ratio can trip it.
 *
 * @param {number} ratio
 * @param {{ enabled: boolean }} opts
 * @returns {GCPolicy}
 */
function policyWithTombstoneThreshold(ratio, { enabled }) {
  return new GCPolicy({
    enabled,
    tombstoneRatioThreshold: ratio,
    entryCountThreshold: Number.MAX_SAFE_INTEGER,
    minPatchesSinceCompaction: Number.MAX_SAFE_INTEGER,
    maxTicksSinceCompaction: Number.MAX_SAFE_INTEGER,
    compactOnCheckpoint: true,
  });
}

/** @param {boolean} [enabled] */
const permissivePolicy = (enabled = false) => policyWithTombstoneThreshold(1, { enabled });
/** @param {boolean} [enabled] */
const strictPolicy = (enabled = true) => policyWithTombstoneThreshold(0, { enabled });

/* ------------------------------------------------------------------ */
/*  vi.mock — static module stubs                                     */
/* ------------------------------------------------------------------ */

const {
  loadCheckpointMock,
  createCheckpointCommitMock,
  isCurrentCheckpointSchemaMock,
  decodePatchMessageMock,
  detectMessageKindMock,
  executeGCMock,
  collectGCMetricsMock,
  computeAppliedVVMock,
  cloneStateMock,
  createFrontierMock,
  updateFrontierMock,
  frontierFingerprintMock,
} = vi.hoisted(() => ({
  loadCheckpointMock: vi.fn(),
  createCheckpointCommitMock: vi.fn(),
  isCurrentCheckpointSchemaMock: vi.fn(),
  decodePatchMessageMock: vi.fn(),
  detectMessageKindMock: vi.fn(),
  executeGCMock: vi.fn(),
  collectGCMetricsMock: vi.fn(),
  computeAppliedVVMock: vi.fn(),
  cloneStateMock: vi.fn(),
  createFrontierMock: vi.fn(),
  updateFrontierMock: vi.fn(),
  frontierFingerprintMock: vi.fn(),
}));

vi.mock('../../../../../src/domain/services/state/checkpointLoad.ts', () => ({
  loadCheckpoint: loadCheckpointMock,
}));

vi.mock('../../../../../src/domain/services/state/checkpointCreate.ts', () => ({
  create: createCheckpointCommitMock,
}));

vi.mock('../../../../../src/domain/services/state/checkpointHelpers.ts', () => ({
  CURRENT_CHECKPOINT_SCHEMA: 5,
  isCurrentCheckpointSchema: isCurrentCheckpointSchemaMock,
}));

vi.mock('../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts', () => ({
  decodePatchMessage: decodePatchMessageMock,
  detectMessageKind: detectMessageKindMock,
}));

vi.mock('../../../../../src/domain/services/executeGC.ts', () => ({
  default: executeGCMock,
}));

vi.mock('../../../../../src/domain/services/GCMetrics.ts', () => ({
  default: { fromState: collectGCMetricsMock },
}));

vi.mock('../../../../../src/domain/services/state/CheckpointSerializer.ts', () => ({
  computeAppliedVV: computeAppliedVVMock,
}));

vi.mock('../../../../../src/domain/services/JoinReducer.ts', () => ({
  cloneState: cloneStateMock,
}));

vi.mock('../../../../../src/domain/services/Frontier.ts', () => ({
  createFrontier: createFrontierMock,
  updateFrontier: updateFrontierMock,
  frontierFingerprint: frontierFingerprintMock,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Minimal WarpState stub (real class instance). */
function stubState() {
  return WarpState.empty();
}

/** Minimal GC result stub. */
function stubGCResult() {
  return new GCExecuteResult({ nodesCompacted: 1, edgesCompacted: 2, tombstonesRemoved: 3 });
}

/**
 * Builds a mock host with sensible defaults.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
  return {
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn().mockResolvedValue(null),
      getNodeInfo: vi.fn().mockResolvedValue({ message: 'msg', parents: [] }),
    },
    _cachedState: null,
    _stateDirty: false,
    _checkpointing: false,
    _viewService: null,
    _checkpointStore: {
      publishCheckpoint: vi.fn(),
      resolveHead: vi.fn().mockResolvedValue(null),
      loadCheckpoint: vi.fn(),
      readMetadata: vi.fn(),
      loadBasis: vi.fn(),
      publishCoverage: vi.fn().mockResolvedValue('coverage-sha'),
    },
    _stateHashService: null,
    _provenanceIndex: null,
    _codec: {},
    _commitMessageCodec: {
      detectKind: detectMessageKindMock,
      decodeCheckpoint: vi.fn(),
      decodePatch: vi.fn((message: string) => {
        const decoded = decodePatchMessageMock(message) as {
          storage?: { strategy: string; version: string | null; schema: string | null; encrypted: boolean };
          encrypted?: boolean;
        };
        return {
          ...decoded,
          storage: decoded.storage ?? (
            decoded.encrypted === true
              ? { strategy: 'legacy-external-storage', version: null, schema: null, encrypted: true }
              : { strategy: 'legacy-git-blob', version: null, schema: null, encrypted: false }
          ),
        };
      }),
      encodeAnchor: vi.fn(),
    },
    _crypto: {},
    _logger: null,
    _gcPolicy: permissivePolicy(false),
    _patchesSinceGC: 0,
    _lastGCLamport: 0,
    _maxObservedLamport: 0,
    _lastFrontier: null,
    _cachedViewHash: null,
    _cachedIndexTree: null,
    _materializedGraph: null,
    _logicalIndex: null,
    _propertyReader: null,
    discoverWriters: vi.fn().mockResolvedValue([]),
    materialize: vi.fn().mockResolvedValue(stubState()),
    _loadWriterPatches: vi.fn().mockResolvedValue([]),
    _validatePatchAgainstCheckpoint: vi.fn().mockResolvedValue(undefined),
    _readPatch: vi.fn(),
    _autoMaterialize: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('CheckpointController', () => {
    let host;
    let ctrl;

  beforeEach(() => {
    vi.clearAllMocks();
    createFrontierMock.mockReturnValue(new Map());
    updateFrontierMock.mockReturnValue(undefined);
    frontierFingerprintMock.mockReturnValue('fp-stable');
    collectGCMetricsMock.mockReturnValue({
      nodeLiveDots: 10,
      edgeLiveDots: 5,
      totalTombstones: 2,
      tombstoneRatio: 0.1,
    });
    cloneStateMock.mockImplementation((s) => ({ ...s }));
    computeAppliedVVMock.mockReturnValue(new Map());
    executeGCMock.mockReturnValue(stubGCResult());

    host = createMockHost();
    ctrl = new CheckpointController((host));
  });

  /* ================================================================ */
  /*  createCheckpoint                                                */
  /* ================================================================ */

  describe('createCheckpoint', () => {
    it('creates a checkpoint from writer tips', async () => {
      const state = stubState();
      host['_cachedState'] = state;
      host['_stateDirty'] = false;
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice', 'bob']);
      ((host['_persistence'] as any).readRef as any)
        .mockResolvedValueOnce('sha-alice')
        .mockResolvedValueOnce('sha-bob');
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      const result = await ctrl.createCheckpoint();

      expect(result).toBe('cp-sha');
      expect(updateFrontierMock).toHaveBeenCalledTimes(2);
      expect(createCheckpointCommitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointStore: host['_checkpointStore'],
          graphName: 'test-graph',
          parents: ['sha-alice', 'sha-bob'],
          state,
        }),
      );
    });

    it('fails closed when cached state is dirty', async () => {
      host['_stateDirty'] = true;
      host['_cachedState'] = stubState();
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      await expect(ctrl.createCheckpoint()).rejects.toThrow(QueryError);

      expect(createCheckpointCommitMock).not.toHaveBeenCalled();
      expect(host['materialize']).not.toHaveBeenCalled();
    });

    it('fails closed when cached state is missing', async () => {
      host['_stateDirty'] = false;
      host['_cachedState'] = null;
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      await expect(ctrl.createCheckpoint()).rejects.toThrow(QueryError);

      expect(createCheckpointCommitMock).not.toHaveBeenCalled();
      expect(host['materialize']).not.toHaveBeenCalled();
    });

    it('uses cached state when clean', async () => {
      const materializeGraphTrap = vi.fn(async () => {
        throw new Error('checkpoint controller must not materialize graph');
      });
      host['_stateDirty'] = false;
      host['_cachedState'] = stubState();
      host['_materializeGraph'] = materializeGraphTrap;
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      await ctrl.createCheckpoint();

      expect(host['materialize']).not.toHaveBeenCalled();
      expect(materializeGraphTrap).not.toHaveBeenCalled();
    });

    it('logs warning when index build fails and still creates checkpoint', async () => {
      const warnFn = vi.fn();
      host['_logger'] = { warn: warnFn, info: vi.fn() };
      host['_viewService'] = {
        build: vi.fn(() => { throw new Error('boom'); }),
      };
      host['_cachedIndexTree'] = null;
      host['_cachedState'] = stubState();
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      const result = await ctrl.createCheckpoint();

      expect(result).toBe('cp-sha');
      expect(warnFn).toHaveBeenCalledWith(
        expect.stringContaining('index build failed'),
        expect.objectContaining({ error: 'boom' }),
      );
    });
  });

  /* ================================================================ */
  /*  syncCoverage                                                    */
  /* ================================================================ */

  describe('syncCoverage', () => {
    it('creates an octopus anchor from writer tips', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('sha-alice');

      await ctrl.syncCoverage();

      expect((host['_checkpointStore'] as any).publishCoverage).toHaveBeenCalledWith({
        graphName: 'test-graph',
        parents: ['sha-alice'],
      });
    });

    it('returns early when no writers exist', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);

      await ctrl.syncCoverage();

      expect((host['_checkpointStore'] as any).publishCoverage).not.toHaveBeenCalled();
    });

    it('returns early when no writer SHAs are found', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('');

      await ctrl.syncCoverage();

      expect((host['_checkpointStore'] as any).publishCoverage).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  _loadLatestCheckpoint                                           */
  /* ================================================================ */

  describe('_loadLatestCheckpoint', () => {
    it('returns checkpoint when ref exists', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue('cp-sha');
      const cpData = { state: stubState(), frontier: new Map(), stateHash: 'abc', schema: 5, appliedVV: null, indexShardHandles: null };
      loadCheckpointMock.mockResolvedValue(cpData);

      const result = await ctrl._loadLatestCheckpoint();

      expect(result).toBe(cpData);
    });

    it('returns null when ref is empty', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue('');

      const result = await ctrl._loadLatestCheckpoint();

      expect(result).toBeNull();
    });

    it('returns null when ref is null', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue(null);

      const result = await ctrl._loadLatestCheckpoint();

      expect(result).toBeNull();
    });

    it('returns null for known load errors (missing, not found, ENOENT)', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue('cp-sha');

      for (const msg of ['object missing', 'ref not found', 'ENOENT: no such file', 'non-empty string']) {
        loadCheckpointMock.mockRejectedValueOnce(new Error(msg));
        const result = await ctrl._loadLatestCheckpoint();
        expect(result).toBeNull();
      }
    });

    it('rethrows unknown errors', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue('cp-sha');
      loadCheckpointMock.mockRejectedValue(new Error('disk on fire'));

      await expect(ctrl._loadLatestCheckpoint()).rejects.toThrow('disk on fire');
    });
  });

  /* ================================================================ */
  /*  _loadPatchesSince                                               */
  /* ================================================================ */

  describe('_loadPatchesSince', () => {
    it('loads patches from each discovered writer', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice', 'bob']);
      const patchA = { patch: { ops: [] }, sha: 'sha-a' };
      const patchB = { patch: { ops: [] }, sha: 'sha-b' };
      (host['_loadWriterPatches'] as any)
        .mockResolvedValueOnce([patchA])
        .mockResolvedValueOnce([patchB]);

      const checkpoint = ({ state: stubState(), frontier: new Map([['alice', 'old-sha']]), stateHash: 'h', schema: 5, appliedVV: null, indexShardHandles: null } as any);
      const result = await ctrl._loadPatchesSince(checkpoint);

      expect(result).toEqual([patchA, patchB]);
      expect(host['_loadWriterPatches']).toHaveBeenCalledWith('alice', 'old-sha');
      expect(host['_loadWriterPatches']).toHaveBeenCalledWith('bob', null);
    });

    it('validates the last patch per writer against the checkpoint', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      const patch = { patch: { ops: [] }, sha: 'tip-sha' };
      (host['_loadWriterPatches'] as any).mockResolvedValue([patch]);

      const checkpoint = ({ state: stubState(), frontier: new Map(), stateHash: 'h', schema: 5, appliedVV: null, indexShardHandles: null } as any);
      await ctrl._loadPatchesSince(checkpoint);

      expect(host['_validatePatchAgainstCheckpoint']).toHaveBeenCalledWith('alice', 'tip-sha', checkpoint);
    });

    it('skips validation when writer has no patches', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      (host['_loadWriterPatches'] as any).mockResolvedValue([]);

      const checkpoint = ({ state: stubState(), frontier: new Map(), stateHash: 'h', schema: 5, appliedVV: null, indexShardHandles: null } as any);
      await ctrl._loadPatchesSince(checkpoint);

      expect(host['_validatePatchAgainstCheckpoint']).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  _validateMigrationBoundary                                      */
  /* ================================================================ */

  describe('_validateMigrationBoundary', () => {
    it('passes when checkpoint has v5 schema', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue('cp-sha');
      ((host['_checkpointStore'] as any).readMetadata as any).mockResolvedValue({
        checkpointSha: 'cp-sha',
        stateHash: 'state-hash',
        schema: 5,
      });
      isCurrentCheckpointSchemaMock.mockReturnValue(true);

      await expect(ctrl._validateMigrationBoundary()).resolves.toBeUndefined();
      expect((host['_checkpointStore'] as any).readMetadata).toHaveBeenCalledWith('cp-sha');
    });

    it('throws SchemaUnsupportedError when schema:1 patches exist', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue(null);
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('tip-sha');
      isCurrentCheckpointSchemaMock.mockReturnValue(false);
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      ((host['_persistence'] as any).getNodeInfo as any).mockResolvedValue({ message: 'patch-msg', parents: [] });
      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ patchHandle: 'asset:patch' });
      (host['_readPatch'] as any).mockResolvedValue({ schema: 1 });

      await expect(ctrl._validateMigrationBoundary()).rejects.toThrow(SchemaUnsupportedError);
    });

    it('passes when no checkpoint and no schema:1 patches', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue(null);
      isCurrentCheckpointSchemaMock.mockReturnValue(false);
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);

      await expect(ctrl._validateMigrationBoundary()).resolves.toBeUndefined();
    });

    it('rejects checkpoint metadata from a retired schema', async () => {
      ((host['_checkpointStore'] as any).resolveHead as any).mockResolvedValue('cp-sha');
      ((host['_checkpointStore'] as any).readMetadata as any).mockResolvedValue({
        checkpointSha: 'cp-sha',
        stateHash: 'state-hash',
        schema: 4,
      });
      isCurrentCheckpointSchemaMock.mockReturnValue(false);

      await expect(ctrl._validateMigrationBoundary()).rejects.toMatchObject({
        code: 'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
        context: { checkpointSha: 'cp-sha', schema: 4 },
      });
      await expect(ctrl._validateMigrationBoundary()).rejects.toBeInstanceOf(PersistenceError);
    });
  });

  /* ================================================================ */
  /*  runGC                                                           */
  /* ================================================================ */

  describe('runGC', () => {
    it('runs GC on cached state and returns result', () => {
      const state = stubState();
      host['_cachedState'] = state;
      host['_materializedGraph'] = { stale: 'graph' };
      host['_logicalIndex'] = { stale: 'index' };
      host['_propertyReader'] = { stale: 'reader' };
      host['_cachedIndexTree'] = { 'stale.cbor': new Uint8Array([1]) };
      host['_cachedViewHash'] = 'stale-hash';
      const gcResult = stubGCResult();
      executeGCMock.mockReturnValue(gcResult);

      const result = ctrl.runGC();

      expect(result).toEqual(gcResult);
      expect(cloneStateMock).toHaveBeenCalledWith(state);
      expect(computeAppliedVVMock).toHaveBeenCalled();
      expect(host['_patchesSinceGC']).toBe(0);
      expect(host['_materializedGraph']).toBeNull();
      expect(host['_logicalIndex']).toBeNull();
      expect(host['_propertyReader']).toBeNull();
      expect(host['_cachedIndexTree']).toBeNull();
      expect(host['_cachedViewHash']).toBeNull();
    });

    it('throws E_NO_STATE when no cached state exists', () => {
      host['_cachedState'] = null;

      expect(() => ctrl.runGC()).toThrow(QueryError);
      expect(() => ctrl.runGC()).toThrow(/reading basis/i);
    });

    it('throws E_GC_STALE when frontier changes during compaction', () => {
      host['_cachedState'] = stubState();
      host['_lastFrontier'] = new Map([['alice', 'sha-1']]);
      frontierFingerprintMock
        .mockReturnValueOnce('fp-before')
        .mockReturnValueOnce('fp-after');

      expect(() => ctrl.runGC()).toThrow(QueryError);
      expect(() => {
        frontierFingerprintMock
          .mockReturnValueOnce('fp-x')
          .mockReturnValueOnce('fp-y');
        ctrl.runGC();
      }).toThrow(/concurrent write/i);
    });
  });

  /* ================================================================ */
  /*  maybeRunGC                                                      */
  /* ================================================================ */

  describe('maybeRunGC', () => {
    it('returns {ran: false} when no cached state', () => {
      host['_cachedState'] = null;
      const result = ctrl.maybeRunGC();
      expect(result).toEqual({ ran: false, result: null, reasons: [] });
    });

    it('returns {ran: false} when thresholds not met', () => {
      host['_cachedState'] = stubState();
      host['_gcPolicy'] = permissivePolicy(true);

      const result = ctrl.maybeRunGC();

      expect(result.ran).toBe(false);
    });

    it('runs GC when thresholds are met', () => {
      host['_cachedState'] = stubState();
      host['_gcPolicy'] = strictPolicy(true);
      collectGCMetricsMock.mockReturnValue({
        nodeLiveDots: 10, edgeLiveDots: 5, totalTombstones: 2, tombstoneRatio: 0.1,
        nodeEntries: 10, edgeEntries: 5, totalEntries: 15,
      });
      executeGCMock.mockReturnValue(stubGCResult());

      const result = ctrl.maybeRunGC();

      expect(result.ran).toBe(true);
      expect(result.result).toEqual(stubGCResult());
      expect(result.reasons[0]).toContain('Tombstone ratio');
    });
  });

  /* ================================================================ */
  /*  getGCMetrics                                                    */
  /* ================================================================ */

  describe('getGCMetrics', () => {
    it('returns metrics from cached state', () => {
      host['_cachedState'] = stubState();
      host['_patchesSinceGC'] = 7;
      host['_lastGCLamport'] = 42;

      const result = ctrl.getGCMetrics();

      expect(result).toEqual({
        nodeCount: 10,
        edgeCount: 5,
        tombstoneCount: 2,
        tombstoneRatio: 0.1,
        patchesSinceCompaction: 7,
        lastCompactionLamport: 42,
      });
    });

    it('returns null when no cached state', () => {
      host['_cachedState'] = null;

      expect(ctrl.getGCMetrics()).toBeNull();
    });
  });

  /* ================================================================ */
  /*  _maybeRunGC (internal post-materialize hook)                    */
  /* ================================================================ */

  describe('_maybeRunGC', () => {
    beforeEach(() => {
      collectGCMetricsMock.mockReturnValue({
        nodeLiveDots: 10, edgeLiveDots: 5, totalTombstones: 2, tombstoneRatio: 0.1,
        nodeEntries: 10, edgeEntries: 5, totalEntries: 15,
      });
    });

    it('runs GC when enabled and thresholds met', () => {
      host['_gcPolicy'] = strictPolicy(true);
      host['_cachedState'] = null;
      host['_materializedGraph'] = { stale: 'graph' };
      host['_logicalIndex'] = { stale: 'index' };
      host['_propertyReader'] = { stale: 'reader' };
      host['_cachedIndexTree'] = { 'stale.cbor': new Uint8Array([1]) };
      host['_cachedViewHash'] = 'stale-hash';

      const state = stubState();
      ctrl._maybeRunGC(state);

      expect(executeGCMock).toHaveBeenCalled();
      expect(host['_patchesSinceGC']).toBe(0);
      expect(host['_materializedGraph']).toBeNull();
      expect(host['_logicalIndex']).toBeNull();
      expect(host['_propertyReader']).toBeNull();
      expect(host['_cachedIndexTree']).toBeNull();
      expect(host['_cachedViewHash']).toBeNull();
    });

    it('logs warning when GC disabled but thresholds met', () => {
      const warnFn = vi.fn();
      host['_logger'] = { warn: warnFn, info: vi.fn() };
      host['_gcPolicy'] = strictPolicy(false);

      ctrl._maybeRunGC(stubState());

      expect(executeGCMock).not.toHaveBeenCalled();
      expect(warnFn).toHaveBeenCalledWith(
        expect.stringContaining('auto-GC is disabled'),
        expect.objectContaining({ reasons: expect.arrayContaining([expect.stringContaining('Tombstone ratio')]) }),
      );
    });

    it('does nothing when thresholds not met', () => {
      host['_gcPolicy'] = permissivePolicy(true);

      ctrl._maybeRunGC(stubState());

      expect(executeGCMock).not.toHaveBeenCalled();
    });

    it('discards GC result when frontier changes during compaction', () => {
      const warnFn = vi.fn();
      host['_logger'] = { warn: warnFn, info: vi.fn() };
      host['_gcPolicy'] = strictPolicy(true);
      host['_lastFrontier'] = new Map([['alice', 'sha-1']]);
      frontierFingerprintMock
        .mockReturnValueOnce('fp-before')
        .mockReturnValueOnce('fp-after');

      ctrl._maybeRunGC(stubState());

      expect(host['_stateDirty']).toBe(true);
      expect(host['_cachedViewHash']).toBeNull();
      expect(warnFn).toHaveBeenCalledWith(
        expect.stringContaining('frontier changed'),
        expect.objectContaining({ preGcFingerprint: 'fp-before', postGcFingerprint: 'fp-after' }),
      );
    });

    it('swallows exceptions to never break materialize', () => {
      collectGCMetricsMock.mockImplementation(() => {
        throw new WarpError('kaboom', 'E_GC_TEST');
      });

      expect(() => ctrl._maybeRunGC(stubState())).not.toThrow();
    });
  });
});
