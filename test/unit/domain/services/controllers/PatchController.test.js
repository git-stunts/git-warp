/**
 * Tests for PatchController — patch creation, commit lifecycle,
 * auto-materialize, writer discovery, tick discovery, join, and
 * the post-commit hook that updates version vectors / provenance.
 *
 * @see src/domain/services/controllers/PatchController.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import PatchController from '../../../../../src/domain/services/controllers/PatchController.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { QueryError } from '../../../../../src/domain/warp/_internal.ts';
import EncryptionError from '../../../../../src/domain/errors/EncryptionError.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';

// ── Mocks ───────────────────────────────────────────────────────────────────

const { patchBuilderMock } = vi.hoisted(() => {
  const patchBuilderMock = vi.fn();
  return { patchBuilderMock };
});

vi.mock('../../../../../src/domain/services/PatchBuilder.ts', () => ({
  PatchBuilder: patchBuilderMock,
}));

const { joinStatesMock, applyWithDiffMock, applyWithReceiptMock } = vi.hoisted(() => ({
  joinStatesMock: vi.fn(),
  applyWithDiffMock: vi.fn(),
  applyWithReceiptMock: vi.fn(),
}));

vi.mock('../../../../../src/domain/services/JoinReducer.ts', async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
    joinStates: joinStatesMock,
    applyWithDiff: applyWithDiffMock,
    applyWithReceipt: applyWithReceiptMock,
  };
});

const { decodePatchMessageMock, detectMessageKindMock } = vi.hoisted(() => ({
  decodePatchMessageMock: vi.fn(),
  detectMessageKindMock: vi.fn(),
}));

vi.mock('../../../../../src/domain/services/codec/WarpMessageCodec.ts', async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
    decodePatchMessage: decodePatchMessageMock,
    detectMessageKind: detectMessageKindMock,
  };
});

const { resolveWriterIdMock } = vi.hoisted(() => ({
  resolveWriterIdMock: vi.fn(),
}));

vi.mock('../../../../../src/domain/utils/WriterId.ts', () => ({
  resolveWriterId: resolveWriterIdMock,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a mock host that mimics WarpRuntime fields used by PatchController.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const host = {
    _writerId: 'alice',
    _graphName: 'test-graph',
    _persistence: createMockPersistence(),
    _cachedState: null,
    _stateDirty: false,
    _autoMaterialize: false,
    _codec: { decode: vi.fn() },
    _clock: { now: vi.fn(() => 1000) },
    _maxObservedLamport: 0,
    _versionVector: VersionVector.empty(),
    _blobStorage: null,
    _effectSink: null,
    _logger: null,
    _patchesSinceCheckpoint: 0,
    _onDeleteWithData: 'reject',
    _patchJournal: null,
    _patchBlobStorage: null,
    _patchInProgress: false,
    _provenanceIndex: null,
    _lastFrontier: null,
    _auditService: null,
    _auditSkipCount: 0,
    _cachedViewHash: null,
    _materializedGraph: null,
    _logicalIndex: null,
    _propertyReader: null,
    _cachedIndexTree: null,
    materialize: vi.fn(),
    _setMaterializedState: vi.fn(),
    _buildAdjacency: vi.fn(() => ({})),
    _logTiming: vi.fn(),
    ...overrides,
  };
  return host;
}

/**
 * Creates a mock persistence adapter.
 */
function createMockPersistence() {
  return {
    readRef: vi.fn(),
    updateRef: vi.fn(),
    showNode: vi.fn(),
    getNodeInfo: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    commitNodeWithTree: vi.fn(),
    readBlob: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    configGet: vi.fn(),
    configSet: vi.fn(),
  };
}

/**
 * Creates a minimal WarpState with an alive node.
 *
 * @param {string} [nodeId]
 * @returns {WarpState}
 */
function createStateWithNode(nodeId = 'n1') {
  const state = WarpState.empty();
  state.nodeAlive.add(nodeId, Dot.create('alice', 1));
  return state;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PatchController', () => {
  /** @type {Record<string, unknown>} */
  let host;
  /** @type {PatchController} */
  let ctrl;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createMockHost();
    ctrl = new PatchController(/** @type {import('../../../../../src/domain/WarpRuntime.ts').default} */ (/** @type {unknown} */ (host)));
  });

  // ────────────────────────────────────────────────────────────────────────
  // createPatch
  // ────────────────────────────────────────────────────────────────────────

  describe('createPatch()', () => {
    it('returns a PatchBuilder for a brand-new writer (no parent)', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      patchBuilderMock.mockImplementation(function () {
        return { fake: 'builder' };
      });

      const builder = await ctrl.createPatch();
      expect(builder).toEqual({ fake: 'builder' });
      expect(patchBuilderMock).toHaveBeenCalledOnce();

      // Should NOT auto-materialize when parentSha is null (nothing to materialize)
      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).not.toHaveBeenCalled();
    });

    it('reads lamport from existing writer ref and increments', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('abc123');
      persistence.showNode.mockResolvedValue('patch-message-data');

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ lamport: 5, patchOid: 'oid1' });

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      // PatchBuilder should receive lamport = max(5, 0) + 1 = 6
      const constructorArgs = patchBuilderMock.mock.calls[0][0];
      expect(constructorArgs.lamport).toBe(6);
      expect(constructorArgs.expectedParentSha).toBe('abc123');
    });

    it('uses maxObservedLamport when it exceeds own tick', async () => {
      host._maxObservedLamport = 10;
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('abc123');
      persistence.showNode.mockResolvedValue('msg');

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ lamport: 3, patchOid: 'oid1' });

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const constructorArgs = patchBuilderMock.mock.calls[0][0];
      // max(3, 10) + 1 = 11
      expect(constructorArgs.lamport).toBe(11);
    });

    it('auto-materializes when enabled, state is null, and parent exists', async () => {
      host._autoMaterialize = true;
      host._cachedState = null;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('parentsha');
      persistence.showNode.mockResolvedValue('msg');

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ lamport: 1, patchOid: 'oid1' });

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).toHaveBeenCalledOnce();
    });

    it('skips auto-materialize when state is already cached', async () => {
      host._autoMaterialize = true;
      host._cachedState = WarpState.empty();

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('parentsha');
      persistence.showNode.mockResolvedValue('msg');

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ lamport: 1, patchOid: 'oid1' });

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).not.toHaveBeenCalled();
    });

    it('skips auto-materialize for the very first patch (no parent)', async () => {
      host._autoMaterialize = true;
      host._cachedState = null;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).not.toHaveBeenCalled();
    });

    it('skips auto-materialize when autoMaterialize is off', async () => {
      host._autoMaterialize = false;
      host._cachedState = null;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('parentsha');
      persistence.showNode.mockResolvedValue('msg');

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ lamport: 1, patchOid: 'oid1' });

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).not.toHaveBeenCalled();
    });

    it('throws when lamport parsing fails on existing ref', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('abc123');
      persistence.showNode.mockResolvedValue('msg');

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockImplementation(() => {
        throw new Error('CBOR decode error');
      });

      await expect(ctrl.createPatch()).rejects.toThrow(/Failed to parse lamport/);
    });

    it('passes optional deps to PatchBuilder when available', async () => {
      const journal = { readPatch: vi.fn(), writePatch: vi.fn() };
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const blobStorage = { store: vi.fn(), retrieve: vi.fn() };
      host._patchJournal = journal;
      host._logger = logger;
      host._blobStorage = blobStorage;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const args = patchBuilderMock.mock.calls[0][0];
      expect(args.patchJournal).toBe(journal);
      expect(args.logger).toBe(logger);
      expect(args.blobStorage).toBe(blobStorage);
    });

    it('omits optional deps from PatchBuilder when null', async () => {
      host._patchJournal = null;
      host._logger = null;
      host._blobStorage = null;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      patchBuilderMock.mockImplementation(function () {
        return {};
      });

      await ctrl.createPatch();

      const args = patchBuilderMock.mock.calls[0][0];
      expect(args).not.toHaveProperty('patchJournal');
      expect(args).not.toHaveProperty('logger');
      expect(args).not.toHaveProperty('blobStorage');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // patch() — convenience wrapper
  // ────────────────────────────────────────────────────────────────────────

  describe('patch()', () => {
    it('creates a patch, runs the build callback, and commits', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      const commitMock = vi.fn().mockResolvedValue('sha-abc');
      patchBuilderMock.mockImplementation(function () {
        return { commit: commitMock };
      });

      const buildFn = vi.fn();
      const sha = await ctrl.patch(buildFn);

      expect(sha).toBe('sha-abc');
      expect(buildFn).toHaveBeenCalledOnce();
      expect(commitMock).toHaveBeenCalledOnce();
    });

    it('rejects reentrant calls', async () => {
      host._patchInProgress = true;

      await expect(ctrl.patch(() => {})).rejects.toThrow(/not reentrant/);
    });

    it('resets _patchInProgress even when build callback throws', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      patchBuilderMock.mockImplementation(function () {
        return { commit: vi.fn() };
      });

      await expect(ctrl.patch(() => {
        throw new Error('build failed');
      })).rejects.toThrow('build failed');

      expect(host._patchInProgress).toBe(false);
    });

    it('resets _patchInProgress even when commit throws', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      patchBuilderMock.mockImplementation(function () {
        return { commit: vi.fn().mockRejectedValue(new Error('commit failed')) };
      });

      await expect(ctrl.patch(() => {})).rejects.toThrow('commit failed');

      expect(host._patchInProgress).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // patchMany()
  // ────────────────────────────────────────────────────────────────────────

  describe('patchMany()', () => {
    it('returns empty array when no builds provided', async () => {
      const result = await ctrl.patchMany();
      expect(result).toEqual([]);
    });

    it('applies multiple patches sequentially', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      let callCount = 0;
      patchBuilderMock.mockImplementation(function () {
        return { commit: vi.fn().mockResolvedValue(`sha-${++callCount}`) };
      });

      const shas = await ctrl.patchMany(
        () => {},
        () => {},
        () => {},
      );

      expect(shas).toEqual(['sha-1', 'sha-2', 'sha-3']);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _onPatchCommitted (post-commit hook)
  // ────────────────────────────────────────────────────────────────────────

  describe('_onPatchCommitted()', () => {
    it('increments version vector for the writer', async () => {
      const vv = VersionVector.empty();
      host._versionVector = vv;

      await ctrl._onPatchCommitted('alice', {});

      expect(vv.get('alice')).toBe(1);
    });

    it('updates maxObservedLamport when patch lamport exceeds it', async () => {
      host._maxObservedLamport = 3;

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 7 } });

      expect(host._maxObservedLamport).toBe(7);
    });

    it('does not decrease maxObservedLamport', async () => {
      host._maxObservedLamport = 10;

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 5 } });

      expect(host._maxObservedLamport).toBe(10);
    });

    it('increments _patchesSinceCheckpoint', async () => {
      host._patchesSinceCheckpoint = 2;

      await ctrl._onPatchCommitted('alice', {});

      expect(host._patchesSinceCheckpoint).toBe(3);
    });

    it('eagerly applies patch to cached state via applyWithDiff when state is clean', async () => {
      const state = createStateWithNode('n1');
      host._cachedState = state;
      host._stateDirty = false;

      const diff = { nodesAdded: ['n2'], nodesRemoved: [], edgesAdded: [], edgesRemoved: [], propsChanged: [] };
      applyWithDiffMock.mockReturnValue({ diff });

      const patch = { lamport: 1, ops: [] };
      await ctrl._onPatchCommitted('alice', { patch, sha: 'sha-1' });

      expect(applyWithDiffMock).toHaveBeenCalledWith(state, patch, 'sha-1');
      const setMat = /** @type {import('vitest').Mock} */ (host._setMaterializedState);
      expect(setMat).toHaveBeenCalledWith(state, { diff });
    });

    it('uses applyWithReceipt when audit service is present', async () => {
      const state = createStateWithNode('n1');
      host._cachedState = state;
      host._stateDirty = false;

      const auditService = { commit: vi.fn().mockResolvedValue(undefined) };
      host._auditService = auditService;

      const receipt = { accepted: 1, rejected: 0 };
      applyWithReceiptMock.mockReturnValue({ receipt });

      const patch = { lamport: 1, ops: [] };
      await ctrl._onPatchCommitted('alice', { patch, sha: 'sha-1' });

      expect(applyWithReceiptMock).toHaveBeenCalledWith(state, patch, 'sha-1');
      expect(auditService.commit).toHaveBeenCalledWith(receipt);
    });

    it('swallows audit commit errors (data already persisted)', async () => {
      const state = createStateWithNode('n1');
      host._cachedState = state;
      host._stateDirty = false;

      const auditService = { commit: vi.fn().mockRejectedValue(new Error('audit fail')) };
      host._auditService = auditService;

      applyWithReceiptMock.mockReturnValue({ receipt: {} });

      // Should not throw
      await ctrl._onPatchCommitted('alice', { patch: { lamport: 1 }, sha: 'sha-1' });
    });

    it('updates provenance index when present', async () => {
      const state = createStateWithNode('n1');
      host._cachedState = state;
      host._stateDirty = false;

      const provenanceIndex = { addPatch: vi.fn() };
      host._provenanceIndex = provenanceIndex;

      applyWithDiffMock.mockReturnValue({ diff: null });

      const patch = { lamport: 1, reads: ['r1'], writes: ['w1'] };
      await ctrl._onPatchCommitted('alice', { patch, sha: 'sha-1' });

      expect(provenanceIndex.addPatch).toHaveBeenCalledWith('sha-1', ['r1'], ['w1']);
    });

    it('updates lastFrontier when present', async () => {
      const state = createStateWithNode('n1');
      host._cachedState = state;
      host._stateDirty = false;

      const frontier = new Map();
      host._lastFrontier = frontier;

      applyWithDiffMock.mockReturnValue({ diff: null });

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 1 }, sha: 'sha-1' });

      expect(frontier.get('alice')).toBe('sha-1');
    });

    it('marks state dirty when cachedState is null', async () => {
      host._cachedState = null;
      host._stateDirty = false;

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 1 }, sha: 'sha-1' });

      expect(host._stateDirty).toBe(true);
      expect(host._cachedViewHash).toBeNull();
    });

    it('marks state dirty when state was already dirty', async () => {
      host._cachedState = createStateWithNode('n1');
      host._stateDirty = true;

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 1 }, sha: 'sha-1' });

      expect(host._stateDirty).toBe(true);
    });

    it('marks state dirty when sha is missing', async () => {
      host._cachedState = createStateWithNode('n1');
      host._stateDirty = false;

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 1 } });

      expect(host._stateDirty).toBe(true);
    });

    it('increments audit skip count and logs warning when state is dirty with audit service', async () => {
      host._cachedState = null;
      host._stateDirty = false;
      host._auditSkipCount = 0;

      const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
      host._logger = logger;

      const auditService = { commit: vi.fn() };
      host._auditService = auditService;

      await ctrl._onPatchCommitted('alice', { patch: { lamport: 1 }, sha: 'sha-1' });

      expect(host._auditSkipCount).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        '[warp:audit]',
        expect.objectContaining({ code: 'AUDIT_SKIPPED_DIRTY_STATE' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _nextLamport
  // ────────────────────────────────────────────────────────────────────────

  describe('_nextLamport()', () => {
    it('returns lamport 1 for a new writer with no ref', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      const result = await ctrl._nextLamport();

      expect(result.lamport).toBe(1);
      expect(result.parentSha).toBeNull();
    });

    it('returns lamport 1 for empty string ref', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('');

      const result = await ctrl._nextLamport();

      expect(result.lamport).toBe(1);
      // readRef returns '' which is falsy but ?? null only triggers for null/undefined
      expect(result.parentSha).toBe('');
    });

    it('skips lamport parsing for non-patch commits', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('sha-checkpoint');
      persistence.showNode.mockResolvedValue('checkpoint-msg');

      detectMessageKindMock.mockReturnValue('checkpoint');

      const result = await ctrl._nextLamport();

      // ownTick stays 0, so lamport = max(0, 0) + 1 = 1
      expect(result.lamport).toBe(1);
      expect(result.parentSha).toBe('sha-checkpoint');
      expect(decodePatchMessageMock).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _loadWriterPatches / _loadPatchChainFromSha
  // ────────────────────────────────────────────────────────────────────────

  describe('_loadWriterPatches()', () => {
    it('returns empty array when writer has no ref', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      const result = await ctrl._loadWriterPatches('alice');

      expect(result).toEqual([]);
    });

    it('returns empty array when writer ref is empty string', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('');

      const result = await ctrl._loadWriterPatches('alice');

      expect(result).toEqual([]);
    });

    it('walks the commit chain and returns patches in chronological order', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('sha-2');

      // Chain: sha-2 -> sha-1 -> (no parent)
      persistence.getNodeInfo
        .mockResolvedValueOnce({ message: 'msg2', parents: ['sha-1'] })
        .mockResolvedValueOnce({ message: 'msg1', parents: [] });

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock
        .mockReturnValueOnce({ lamport: 2, patchOid: 'oid2', encrypted: false })
        .mockReturnValueOnce({ lamport: 1, patchOid: 'oid1', encrypted: false });

      const journal = { readPatch: vi.fn() };
      journal.readPatch
        .mockResolvedValueOnce({ ops: ['op2'] })
        .mockResolvedValueOnce({ ops: ['op1'] });
      host._patchJournal = journal;

      const result = await ctrl._loadWriterPatches('alice');

      // Reversed: chronological order (oldest first)
      expect(result).toHaveLength(2);
      expect(result[0].sha).toBe('sha-1');
      expect(result[1].sha).toBe('sha-2');
    });

    it('stops at stopAtSha', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('sha-3');

      // Chain: sha-3 -> sha-2 -> sha-1
      persistence.getNodeInfo
        .mockResolvedValueOnce({ message: 'msg3', parents: ['sha-2'] });

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock
        .mockReturnValueOnce({ lamport: 3, patchOid: 'oid3', encrypted: false });

      const journal = { readPatch: vi.fn().mockResolvedValue({ ops: ['op3'] }) };
      host._patchJournal = journal;

      const result = await ctrl._loadWriterPatches('alice', 'sha-2');

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('sha-3');
    });

    it('stops when a non-patch commit is encountered', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('sha-2');

      persistence.getNodeInfo
        .mockResolvedValueOnce({ message: 'msg2', parents: ['sha-1'] })
        .mockResolvedValueOnce({ message: 'checkpoint-msg', parents: ['sha-0'] });

      detectMessageKindMock
        .mockReturnValueOnce('patch')
        .mockReturnValueOnce('checkpoint');

      decodePatchMessageMock
        .mockReturnValueOnce({ lamport: 2, patchOid: 'oid2', encrypted: false });

      const journal = { readPatch: vi.fn().mockResolvedValue({ ops: ['op2'] }) };
      host._patchJournal = journal;

      const result = await ctrl._loadWriterPatches('alice');

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('sha-2');
    });

    it('falls back to codec decode when no patchJournal is set', async () => {
      host._patchJournal = null;
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('sha-1');

      persistence.getNodeInfo.mockResolvedValue({ message: 'msg1', parents: [] });

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock.mockReturnValue({ lamport: 1, patchOid: 'blob-oid' });

      const rawBytes = new Uint8Array([1, 2, 3]);
      persistence.readBlob.mockResolvedValue(rawBytes);

      const decodedPatch = {
        writer: 'alice',
        lamport: 1,
        context: { alice: 0 },
        ops: [{ type: 'NodeAdd', id: 'n1', dot: ['alice', 1] }],
      };
      const codec = /** @type {{ decode: import('vitest').Mock }} */ (host._codec);
      codec.decode.mockReturnValue(decodedPatch);

      const result = await ctrl._loadWriterPatches('alice');

      expect(result).toHaveLength(1);
      expect(result[0].patch).toMatchObject({ writer: 'alice', lamport: 1 });
      expect(result[0].patch.ops[0]).toMatchObject({
        type: 'NodeAdd',
        node: 'n1',
        dot: Dot.create('alice', 1),
      });
      expect(persistence.readBlob).toHaveBeenCalledWith('blob-oid');
      expect(codec.decode).toHaveBeenCalledWith(rawBytes);
    });

    it('continues legacy fallback decoding across parent commits', async () => {
      host._patchJournal = null;
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue('sha-2');
      persistence.getNodeInfo
        .mockResolvedValueOnce({ message: 'msg2', parents: ['sha-1'] })
        .mockResolvedValueOnce({ message: 'msg1', parents: [] });

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock
        .mockReturnValueOnce({ lamport: 2, patchOid: 'blob-oid-2' })
        .mockReturnValueOnce({ lamport: 1, patchOid: 'blob-oid-1' });

      const blob2 = new Uint8Array([2]);
      const blob1 = new Uint8Array([1]);
      persistence.readBlob
        .mockResolvedValueOnce(blob2)
        .mockResolvedValueOnce(blob1);

      const codec = /** @type {{ decode: import('vitest').Mock }} */ (host._codec);
      codec.decode
        .mockReturnValueOnce({
          writer: 'alice',
          lamport: 2,
          context: { alice: 1 },
          ops: [{ type: 'NodeAdd', id: 'n2', dot: ['alice', 2] }],
        })
        .mockReturnValueOnce({
          writer: 'alice',
          lamport: 1,
          context: { alice: 0 },
          ops: [{ type: 'NodeAdd', id: 'n1', dot: ['alice', 1] }],
        });

      const result = await ctrl._loadWriterPatches('alice');

      expect(result).toHaveLength(2);
      expect(result.map((entry) => entry.sha)).toEqual(['sha-1', 'sha-2']);
      expect(persistence.readBlob).toHaveBeenNthCalledWith(1, 'blob-oid-2');
      expect(persistence.readBlob).toHaveBeenNthCalledWith(2, 'blob-oid-1');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _ensureFreshState
  // ────────────────────────────────────────────────────────────────────────

  describe('_ensureFreshState()', () => {
    it('auto-materializes when enabled and state is null', async () => {
      host._autoMaterialize = true;
      host._cachedState = null;

      await ctrl._ensureFreshState();

      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).toHaveBeenCalledOnce();
    });

    it('auto-materializes when enabled and state is dirty', async () => {
      host._autoMaterialize = true;
      host._cachedState = WarpState.empty();
      host._stateDirty = true;

      await ctrl._ensureFreshState();

      const materialize = /** @type {import('vitest').Mock} */ (host.materialize);
      expect(materialize).toHaveBeenCalledOnce();
    });

    it('throws E_NO_STATE when no state and auto-materialize is off', async () => {
      host._autoMaterialize = false;
      host._cachedState = null;

      await expect(ctrl._ensureFreshState()).rejects.toThrow(QueryError);
    });

    it('throws E_STALE_STATE when state is dirty and auto-materialize is off', async () => {
      host._autoMaterialize = false;
      host._cachedState = WarpState.empty();
      host._stateDirty = true;

      await expect(ctrl._ensureFreshState()).rejects.toThrow(QueryError);
    });

    it('succeeds silently when state is cached and clean', async () => {
      host._autoMaterialize = false;
      host._cachedState = WarpState.empty();
      host._stateDirty = false;

      await expect(ctrl._ensureFreshState()).resolves.toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // _readPatchBlob
  // ────────────────────────────────────────────────────────────────────────

  describe('_readPatchBlob()', () => {
    it('reads unencrypted blob from persistence', async () => {
      const blob = new Uint8Array([10, 20, 30]);
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readBlob.mockResolvedValue(blob);

      const result = await ctrl._readPatchBlob({ patchOid: 'oid1', encrypted: false });

      expect(result).toBe(blob);
      expect(persistence.readBlob).toHaveBeenCalledWith('oid1');
    });

    it('throws PersistenceError when unencrypted blob is missing', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readBlob.mockResolvedValue(null);

      await expect(ctrl._readPatchBlob({ patchOid: 'oid1', encrypted: false }))
        .rejects.toThrow(PersistenceError);
    });

    it('reads encrypted blob from patchBlobStorage', async () => {
      const blob = new Uint8Array([40, 50, 60]);
      const patchBlobStorage = { retrieve: vi.fn().mockResolvedValue(blob), store: vi.fn() };
      host._patchBlobStorage = patchBlobStorage;

      const result = await ctrl._readPatchBlob({ patchOid: 'oid1', encrypted: true });

      expect(result).toBe(blob);
      expect(patchBlobStorage.retrieve).toHaveBeenCalledWith('oid1');
    });

    it('throws EncryptionError when encrypted but no patchBlobStorage', async () => {
      host._patchBlobStorage = null;

      await expect(ctrl._readPatchBlob({ patchOid: 'oid1', encrypted: true }))
        .rejects.toThrow(EncryptionError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // discoverWriters
  // ────────────────────────────────────────────────────────────────────────

  describe('discoverWriters()', () => {
    it('returns sorted writer IDs from ref listing', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([
        'refs/warp/test-graph/writers/charlie',
        'refs/warp/test-graph/writers/alice',
        'refs/warp/test-graph/writers/bob',
      ]);

      const writers = await ctrl.discoverWriters();

      expect(writers).toEqual(['alice', 'bob', 'charlie']);
    });

    it('returns empty array when no writers exist', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([]);

      const writers = await ctrl.discoverWriters();

      expect(writers).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // discoverTicks
  // ────────────────────────────────────────────────────────────────────────

  describe('discoverTicks()', () => {
    it('collects ticks from all writers and returns sorted global ticks', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([
        'refs/warp/test-graph/writers/alice',
        'refs/warp/test-graph/writers/bob',
      ]);

      // Alice: one patch at lamport=2
      persistence.readRef
        .mockResolvedValueOnce('sha-a1')  // alice
        .mockResolvedValueOnce('sha-b1'); // bob

      persistence.getNodeInfo
        .mockResolvedValueOnce({ message: 'msg-a1', parents: [] })   // alice sha-a1
        .mockResolvedValueOnce({ message: 'msg-b1', parents: [] });  // bob sha-b1

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock
        .mockReturnValueOnce({ lamport: 2 })  // alice
        .mockReturnValueOnce({ lamport: 1 }); // bob

      const result = await ctrl.discoverTicks();

      expect(result.ticks).toEqual([1, 2]);
      expect(result.maxTick).toBe(2);
      expect(result.perWriter.get('alice')).toEqual(
        expect.objectContaining({ ticks: [2], tipSha: 'sha-a1' }),
      );
      expect(result.perWriter.get('bob')).toEqual(
        expect.objectContaining({ ticks: [1], tipSha: 'sha-b1' }),
      );
    });

    it('returns maxTick 0 when no writers exist', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([]);

      const result = await ctrl.discoverTicks();

      expect(result.ticks).toEqual([]);
      expect(result.maxTick).toBe(0);
      expect(result.perWriter.size).toBe(0);
    });

    it('logs warning for non-monotonic lamport timestamps', async () => {
      const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
      host._logger = logger;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([
        'refs/warp/test-graph/writers/alice',
      ]);

      persistence.readRef.mockResolvedValue('sha-2');

      // Chain: sha-2(lamport=1) -> sha-1(lamport=3) — non-monotonic going backward
      persistence.getNodeInfo
        .mockResolvedValueOnce({ message: 'msg2', parents: ['sha-1'] })
        .mockResolvedValueOnce({ message: 'msg1', parents: [] });

      detectMessageKindMock.mockReturnValue('patch');
      decodePatchMessageMock
        .mockReturnValueOnce({ lamport: 1 })
        .mockReturnValueOnce({ lamport: 3 });

      await ctrl.discoverTicks();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('non-monotonic lamport'),
      );
    });

    it('reports null tipSha for writers with empty ref', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([
        'refs/warp/test-graph/writers/alice',
      ]);
      persistence.readRef.mockResolvedValue('');

      const result = await ctrl.discoverTicks();

      const aliceInfo = result.perWriter.get('alice');
      expect(aliceInfo).toBeDefined();
      expect(aliceInfo?.tipSha).toBeNull();
      expect(aliceInfo?.ticks).toEqual([]);
    });

    it('stops walking a writer when it hits a non-patch commit', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.listRefs.mockResolvedValue([
        'refs/warp/test-graph/writers/alice',
      ]);
      persistence.readRef.mockResolvedValue('sha-stop');
      persistence.getNodeInfo.mockResolvedValue({ message: 'checkpoint-msg', parents: ['older-sha'] });

      detectMessageKindMock.mockReturnValue('checkpoint');

      const result = await ctrl.discoverTicks();

      expect(result.ticks).toEqual([]);
      expect(result.maxTick).toBe(0);
      expect(result.perWriter.get('alice')).toEqual(
        expect.objectContaining({ ticks: [], tipSha: 'sha-stop' }),
      );
      expect(decodePatchMessageMock).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // join()
  // ────────────────────────────────────────────────────────────────────────

  describe('join()', () => {
    it('throws E_NO_STATE when no cached state', () => {
      host._cachedState = null;

      expect(() => ctrl.join(WarpState.empty())).toThrow(QueryError);
    });

    it('throws when otherState is null', () => {
      host._cachedState = WarpState.empty();

      expect(() => ctrl.join(/** @type {import('../../../../../src/domain/services/JoinReducer.ts').WarpState} */ (/** @type {unknown} */ (null)))).toThrow(/Invalid state/);
    });

    it('throws when otherState is missing required fields', () => {
      host._cachedState = WarpState.empty();

      expect(() => ctrl.join(/** @type {import('../../../../../src/domain/services/JoinReducer.ts').WarpState} */ (/** @type {unknown} */ ({ prop: new Map() })))).toThrow(/Invalid state/);
    });

    it('merges states and returns receipt with change counts', () => {
      const localState = createStateWithNode('n1');
      host._cachedState = localState;
      host._versionVector = localState.observedFrontier.clone();

      const remoteState = WarpState.empty();
      remoteState.nodeAlive.add('n2', Dot.create('bob', 1));
      remoteState.observedFrontier.increment('bob');

      // joinStates returns the merged state
      const merged = WarpState.empty();
      merged.nodeAlive.add('n1', Dot.create('alice', 1));
      merged.nodeAlive.add('n2', Dot.create('bob', 1));
      merged.observedFrontier.increment('alice');
      merged.observedFrontier.increment('bob');
      joinStatesMock.mockReturnValue(merged);

      const { state, receipt } = ctrl.join(remoteState);

      expect(state).toBe(merged);
      expect(receipt.nodesAdded).toBe(1);
      expect(receipt.frontierMerged).toBe(true);
      expect(joinStatesMock).toHaveBeenCalledWith(localState, remoteState);
    });

    it('counts property additions and value changes in the join receipt', () => {
      const localState = createStateWithNode('n1');
      localState.prop.set('n1:name', { value: 'Alice' });
      host._cachedState = localState;
      host._versionVector = localState.observedFrontier.clone();

      const remoteState = WarpState.empty();
      const merged = WarpState.empty();
      merged.nodeAlive.add('n1', Dot.create('alice', 1));
      merged.prop.set('n1:name', { value: 'Bob' });
      merged.prop.set('n1:title', { value: 'Engineer' });
      merged.observedFrontier.increment('alice');
      joinStatesMock.mockReturnValue(merged);

      const { receipt } = ctrl.join(remoteState);

      expect(receipt.propsChanged).toBe(2);
    });

    it('invalidates caches after join', () => {
      host._cachedState = createStateWithNode('n1');
      host._logicalIndex = { some: 'index' };
      host._propertyReader = { some: 'reader' };
      host._cachedViewHash = 'old-hash';
      host._cachedIndexTree = { some: 'tree' };

      const merged = WarpState.empty();
      merged.observedFrontier = VersionVector.empty();
      joinStatesMock.mockReturnValue(merged);

      ctrl.join(WarpState.empty());

      expect(host._logicalIndex).toBeNull();
      expect(host._propertyReader).toBeNull();
      expect(host._cachedViewHash).toBeNull();
      expect(host._cachedIndexTree).toBeNull();
      expect(host._stateDirty).toBe(false);
    });

    it('updates host version vector to merged frontier clone', () => {
      const localState = WarpState.empty();
      localState.observedFrontier.increment('alice');
      host._cachedState = localState;

      const merged = WarpState.empty();
      merged.observedFrontier.increment('alice');
      merged.observedFrontier.increment('bob');
      joinStatesMock.mockReturnValue(merged);

      ctrl.join(WarpState.empty());

      const vv = /** @type {import('../../../../../src/domain/crdt/VersionVector.js').default} */ (host._versionVector);
      expect(vv.get('alice')).toBe(1);
      expect(vv.get('bob')).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // writer()
  // ────────────────────────────────────────────────────────────────────────

  describe('writer()', () => {
    it('resolves writer ID and returns a Writer instance', async () => {
      resolveWriterIdMock.mockResolvedValue('resolved-alice');

      // Writer requires patchJournal
      const journal = { readPatch: vi.fn(), writePatch: vi.fn() };
      host._patchJournal = journal;

      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      const w = await ctrl.writer('alice');

      expect(resolveWriterIdMock).toHaveBeenCalledWith(
        expect.objectContaining({
          graphName: 'test-graph',
          explicitWriterId: 'alice',
        }),
      );
      expect(w).toBeDefined();
    });

    it('wires writer callbacks back to the controller host state', async () => {
      resolveWriterIdMock.mockResolvedValue('resolved-alice');
      const journal = { readPatch: vi.fn(), writePatch: vi.fn() };
      host._patchJournal = journal;
      host._cachedState = createStateWithNode('n1');
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);
      const onPatchCommitted = vi.spyOn(ctrl, '_onPatchCommitted')
        .mockImplementation(() => undefined);

      const writer = /** @type {any} */ (await ctrl.writer('alice'));
      const currentState = writer._getCurrentState();

      expect(currentState).toBe(host._cachedState);

      await writer._onCommitSuccess({ patch: { lamport: 1, ops: [] }, sha: 'sha-1' });

      expect(onPatchCommitted).toHaveBeenCalledWith('resolved-alice', {
        patch: { lamport: 1, ops: [] },
        sha: 'sha-1',
      });
    });

    it('throws when patchJournal is not configured', async () => {
      resolveWriterIdMock.mockResolvedValue('resolved-alice');
      host._patchJournal = null;

      await expect(ctrl.writer('alice')).rejects.toThrow(/patchJournal is required/);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getWriterPatches (public API)
  // ────────────────────────────────────────────────────────────────────────

  describe('getWriterPatches()', () => {
    it('delegates to _loadWriterPatches', async () => {
      const persistence = /** @type {ReturnType<typeof createMockPersistence>} */ (host._persistence);
      persistence.readRef.mockResolvedValue(null);

      const result = await ctrl.getWriterPatches('alice');

      expect(result).toEqual([]);
    });
  });
});
