import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckpointController from '../../../../../src/domain/services/controllers/CheckpointController.js';
import { QueryError } from '../../../../../src/domain/warp/_internal.ts';
import SchemaUnsupportedError from '../../../../../src/domain/errors/SchemaUnsupportedError.ts';
import GCPolicy from '../../../../../src/domain/services/GCPolicy.ts';
import GCExecuteResult from '../../../../../src/domain/services/GCExecuteResult.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
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
  isV5CheckpointSchemaMock,
  decodePatchMessageMock,
  detectMessageKindMock,
  encodeAnchorMessageMock,
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
  isV5CheckpointSchemaMock: vi.fn(),
  decodePatchMessageMock: vi.fn(),
  detectMessageKindMock: vi.fn(),
  encodeAnchorMessageMock: vi.fn(),
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
  isV5CheckpointSchema: isV5CheckpointSchemaMock,
}));

vi.mock('../../../../../src/domain/services/codec/WarpMessageCodec.ts', () => ({
  decodePatchMessage: decodePatchMessageMock,
  detectMessageKind: detectMessageKindMock,
  encodeAnchorMessage: encodeAnchorMessageMock,
}));

vi.mock('../../../../../src/domain/services/executeGC.ts', () => ({
  default: executeGCMock,
}));

vi.mock('../../../../../src/domain/services/GCMetrics.ts', () => ({
  default: { fromState: collectGCMetricsMock },
}));

vi.mock('../../../../../src/domain/services/state/CheckpointSerializer.js', () => ({
  computeAppliedVV: computeAppliedVVMock,
}));

vi.mock('../../../../../src/domain/services/JoinReducer.ts', () => ({
  cloneState: cloneStateMock,
}));

vi.mock('../../../../../src/domain/services/Frontier.js', () => ({
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
      updateRef: vi.fn().mockResolvedValue(undefined),
      commitNode: vi.fn().mockResolvedValue('anchor-sha'),
      getNodeInfo: vi.fn().mockResolvedValue({ message: 'msg', parents: [] }),
    },
    _cachedState: null,
    _stateDirty: false,
    _checkpointing: false,
    _viewService: null,
    _checkpointStore: null,
    _stateHashService: null,
    _provenanceIndex: null,
    _codec: { decode: vi.fn() },
    _crypto: {},
    _logger: null,
    _gcPolicy: permissivePolicy(false),
    _patchesSinceGC: 0,
    _lastGCLamport: 0,
    _maxObservedLamport: 0,
    _lastFrontier: null,
    _cachedViewHash: null,
    _cachedIndexTree: null,
    discoverWriters: vi.fn().mockResolvedValue([]),
    materialize: vi.fn().mockResolvedValue(stubState()),
    _loadWriterPatches: vi.fn().mockResolvedValue([]),
    _validatePatchAgainstCheckpoint: vi.fn().mockResolvedValue(undefined),
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
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice', 'bob']);
      ((host['_persistence'] as any).readRef as any)
        .mockResolvedValueOnce('sha-alice')
        .mockResolvedValueOnce('sha-bob');
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      const result = await ctrl.createCheckpoint();

      expect(result).toBe('cp-sha');
      expect((host['_persistence'] as any).updateRef).toHaveBeenCalledWith(
        expect.stringContaining('checkpoints'),
        'cp-sha',
      );
      expect(updateFrontierMock).toHaveBeenCalledTimes(2);
    });

    it('materializes when stateDirty is true', async () => {
      host['_stateDirty'] = true;
      host['_cachedState'] = stubState();
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      await ctrl.createCheckpoint();

      expect(host['materialize']).toHaveBeenCalled();
    });

    it('uses cached state when clean', async () => {
      host['_stateDirty'] = false;
      host['_cachedState'] = stubState();
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);
      createCheckpointCommitMock.mockResolvedValue('cp-sha');

      await ctrl.createCheckpoint();

      expect(host['materialize']).not.toHaveBeenCalled();
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
      encodeAnchorMessageMock.mockReturnValue('anchor-msg');

      await ctrl.syncCoverage();

      expect((host['_persistence'] as any).commitNode).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'anchor-msg', parents: ['sha-alice'] }),
      );
      expect((host['_persistence'] as any).updateRef).toHaveBeenCalledWith(
        expect.stringContaining('coverage'),
        'anchor-sha',
      );
    });

    it('returns early when no writers exist', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);

      await ctrl.syncCoverage();

      expect((host['_persistence'] as any).commitNode).not.toHaveBeenCalled();
    });

    it('returns early when no writer SHAs are found', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('');

      await ctrl.syncCoverage();

      expect((host['_persistence'] as any).commitNode).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  _loadLatestCheckpoint                                           */
  /* ================================================================ */

  describe('_loadLatestCheckpoint', () => {
    it('returns checkpoint when ref exists', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('cp-sha');
      const cpData = { state: stubState(), frontier: new Map(), stateHash: 'abc', schema: 2, appliedVV: null, indexShardOids: null };
      loadCheckpointMock.mockResolvedValue(cpData);

      const result = await ctrl._loadLatestCheckpoint();

      expect(result).toBe(cpData);
    });

    it('returns null when ref is empty', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('');

      const result = await ctrl._loadLatestCheckpoint();

      expect(result).toBeNull();
    });

    it('returns null when ref is null', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue(null);

      const result = await ctrl._loadLatestCheckpoint();

      expect(result).toBeNull();
    });

    it('returns null for known load errors (missing, not found, ENOENT)', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('cp-sha');

      for (const msg of ['object missing', 'ref not found', 'ENOENT: no such file', 'non-empty string']) {
        loadCheckpointMock.mockRejectedValueOnce(new Error(msg));
        const result = await ctrl._loadLatestCheckpoint();
        expect(result).toBeNull();
      }
    });

    it('rethrows unknown errors', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('cp-sha');
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

      const checkpoint = ({ state: stubState(), frontier: new Map([['alice', 'old-sha']]), stateHash: 'h', schema: 2, appliedVV: null, indexShardOids: null } as any);
      const result = await ctrl._loadPatchesSince(checkpoint);

      expect(result).toEqual([patchA, patchB]);
      expect(host['_loadWriterPatches']).toHaveBeenCalledWith('alice', 'old-sha');
      expect(host['_loadWriterPatches']).toHaveBeenCalledWith('bob', null);
    });

    it('validates the last patch per writer against the checkpoint', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      const patch = { patch: { ops: [] }, sha: 'tip-sha' };
      (host['_loadWriterPatches'] as any).mockResolvedValue([patch]);

      const checkpoint = ({ state: stubState(), frontier: new Map(), stateHash: 'h', schema: 2, appliedVV: null, indexShardOids: null } as any);
      await ctrl._loadPatchesSince(checkpoint);

      expect(host['_validatePatchAgainstCheckpoint']).toHaveBeenCalledWith('alice', 'tip-sha', checkpoint);
    });

    it('skips validation when writer has no patches', async () => {
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      (host['_loadWriterPatches'] as any).mockResolvedValue([]);

      const checkpoint = ({ state: stubState(), frontier: new Map(), stateHash: 'h', schema: 2, appliedVV: null, indexShardOids: null } as any);
      await ctrl._loadPatchesSince(checkpoint);

      expect(host['_validatePatchAgainstCheckpoint']).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  _validateMigrationBoundary                                      */
  /* ================================================================ */

  describe('_validateMigrationBoundary', () => {
    it('passes when checkpoint has v5 schema', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('cp-sha');
      loadCheckpointMock.mockResolvedValue({ state: stubState(), frontier: new Map(), stateHash: 'h', schema: 5, appliedVV: null, indexShardOids: null });
      isV5CheckpointSchemaMock.mockReturnValue(true);

      await expect(ctrl._validateMigrationBoundary()).resolves.toBeUndefined();
    });

    it('throws SchemaUnsupportedError when schema:1 patches exist', async () => {
      ((host['_persistence'] as any).readRef as any)
        .mockResolvedValueOnce('') // checkpoint ref empty
        .mockResolvedValueOnce('tip-sha'); // writer ref
      isV5CheckpointSchemaMock.mockReturnValue(false);
      host['discoverWriters'] = vi.fn().mockResolvedValue(['alice']);
      ((host['_persistence'] as any).getNodeInfo as any).mockResolvedValue({ message: 'patch-msg', parents: [] });
      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ blobSha: 'blob-sha' });

      // Wire _readPatchBlob and _codec.decode on the host for _hasSchema1Patches
      host['_readPatchBlob'] = vi.fn().mockResolvedValue(new Uint8Array(0));
      ((host['_codec'] as any).decode as any).mockReturnValue({ schema: 1 });

      await expect(ctrl._validateMigrationBoundary()).rejects.toThrow(SchemaUnsupportedError);
    });

    it('passes when no checkpoint and no schema:1 patches', async () => {
      ((host['_persistence'] as any).readRef as any).mockResolvedValue('');
      isV5CheckpointSchemaMock.mockReturnValue(false);
      host['discoverWriters'] = vi.fn().mockResolvedValue([]);

      await expect(ctrl._validateMigrationBoundary()).resolves.toBeUndefined();
    });
  });

  /* ================================================================ */
  /*  runGC                                                           */
  /* ================================================================ */

  describe('runGC', () => {
    it('runs GC on cached state and returns result', () => {
      const state = stubState();
      host['_cachedState'] = state;
      const gcResult = stubGCResult();
      executeGCMock.mockReturnValue(gcResult);

      const result = ctrl.runGC();

      expect(result).toEqual(gcResult);
      expect(cloneStateMock).toHaveBeenCalledWith(state);
      expect(computeAppliedVVMock).toHaveBeenCalled();
      expect(host['_patchesSinceGC']).toBe(0);
    });

    it('throws E_NO_STATE when no cached state exists', () => {
      host['_cachedState'] = null;

      expect(() => ctrl.runGC()).toThrow(QueryError);
      expect(() => ctrl.runGC()).toThrow(/materialize/i);
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

      const state = stubState();
      ctrl._maybeRunGC(state);

      expect(executeGCMock).toHaveBeenCalled();
      expect(host['_patchesSinceGC']).toBe(0);
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
