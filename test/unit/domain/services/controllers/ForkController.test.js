import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForkController from '../../../../../src/domain/services/controllers/ForkController.js';
import ForkError from '../../../../../src/domain/errors/ForkError.ts';
import { CHECKPOINT_SCHEMA_STANDARD, CHECKPOINT_SCHEMA_V5_INTERMEDIATE } from '../../../../../src/domain/services/state/checkpointHelpers.ts';
import { buildWriterRef, buildWritersPrefix } from '../../../../../src/domain/utils/RefLayout.ts';

// ---------------------------------------------------------------------------
// WormholeService mock
// ---------------------------------------------------------------------------
vi.mock('../../../../../src/domain/services/WormholeService.js', () => ({
  createWormhole: vi.fn(),
}));

// ---------------------------------------------------------------------------
// WarpRuntime mock (dynamic import in fork())
// ---------------------------------------------------------------------------
const mockRuntimeOpen = vi.fn();
vi.mock('../../../../../src/domain/WarpRuntime.ts', () => ({
  default: { open: (...args) => mockRuntimeOpen(...args) },
}));

// ---------------------------------------------------------------------------
// WriterId mock
// ---------------------------------------------------------------------------
vi.mock('../../../../../src/domain/utils/WriterId.ts', () => ({
  generateWriterId: vi.fn(() => 'generated-writer-id'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock host with sensible defaults.
 * Every persistence method is a vi.fn() so tests can override per-case.
 */
function createMockHost(overrides = {}) {
  return {
    _clock: { now: () => 0 },
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn().mockResolvedValue('tip-sha'),
      nodeExists: vi.fn().mockResolvedValue(true),
      getNodeInfo: vi.fn().mockResolvedValue({ parents: [] }),
      updateRef: vi.fn().mockResolvedValue(undefined),
      deleteRef: vi.fn().mockResolvedValue(undefined),
      listRefs: vi.fn().mockResolvedValue([]),
      commitNode: vi.fn(),
    },
    discoverWriters: vi.fn().mockResolvedValue(['alice']),
    _logTiming: vi.fn(),
    _gcPolicy: null,
    _autoMaterialize: false,
    _onDeleteWithData: 'throw',
    _logger: null,
    _crypto: null,
    _codec: null,
    _checkpointPolicy: null,
    _adjacencyCache: { maxSize: 3 },
    ...overrides,
  };
}

/**
 * Build a linear commit chain: sha-0 <- sha-1 <- sha-2 (tip).
 * getNodeInfo returns the previous SHA as parent.
 */
function setupLinearChain(host, chain) {
  host._persistence.getNodeInfo.mockImplementation(async (sha) => {
    const idx = chain.indexOf(sha);
    if (idx <= 0) {
      return { parents: [] };
    }
    return { parents: [chain[idx - 1]] };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForkController', () => {
  /** @type {ReturnType<typeof createMockHost>} */
  let host;
  /** @type {ForkController} */
  let ctrl;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createMockHost();
    ctrl = new ForkController(host);

    // Default: WarpRuntime.open succeeds
    mockRuntimeOpen.mockResolvedValue({ _graphName: 'fork-graph' });
  });

  // =========================================================================
  // fork()
  // =========================================================================
  describe('fork()', () => {
    it('happy path — creates fork ref, opens WarpRuntime, returns graph', async () => {
      // Chain: base-sha <- tip-sha
      const chain = ['base-sha', 'tip-sha'];
      setupLinearChain(host, chain);
      host._persistence.readRef.mockResolvedValue('tip-sha');

      const result = await ctrl.fork({
        from: 'alice',
        at: 'base-sha',
        forkName: 'my-fork',
        forkWriterId: 'fork-writer',
      });

      // Ref was created
      const expectedRef = buildWriterRef('my-fork', 'fork-writer');
      expect(host._persistence.updateRef).toHaveBeenCalledWith(expectedRef, 'base-sha');

      // WarpRuntime.open was called with correct graphName + writerId
      expect(mockRuntimeOpen).toHaveBeenCalledOnce();
      const openArgs = mockRuntimeOpen.mock.calls[0][0];
      expect(openArgs.graphName).toBe('my-fork');
      expect(openArgs.writerId).toBe('fork-writer');
      expect(openArgs.persistence).toBe(host._persistence);

      // Returns the opened runtime
      expect(result).toEqual({ _graphName: 'fork-graph' });

      // Timing logged
      expect(host._logTiming).toHaveBeenCalledWith('fork', 0, expect.objectContaining({ metrics: expect.any(String) }));
    });

    it('generates fork name and writer ID when not provided', async () => {
      // at === tip  => _isAncestor returns true immediately
      host._persistence.readRef.mockResolvedValue('sha-abc');

      const result = await ctrl.fork({ from: 'alice', at: 'sha-abc' });

      expect(result).toBeDefined();
      // updateRef was called (fork ref was created)
      expect(host._persistence.updateRef).toHaveBeenCalledOnce();
    });

    it('throws E_FORK_INVALID_ARGS when from is missing', async () => {
      await expect(ctrl.fork({ from: '', at: 'sha-abc' }))
        .rejects.toThrow(ForkError);

      await expect(ctrl.fork({ from: '', at: 'sha-abc' }))
        .rejects.toThrow(/Required parameter 'from'/);
    });

    it('throws E_FORK_INVALID_ARGS when at is missing', async () => {
      await expect(ctrl.fork({ from: 'alice', at: '' }))
        .rejects.toThrow(ForkError);

      await expect(ctrl.fork({ from: 'alice', at: '' }))
        .rejects.toThrow(/Required parameter 'at'/);
    });

    it('throws E_FORK_INVALID_ARGS when from is not a string', async () => {
      await expect(ctrl.fork({ from: /** @type {*} */ (42), at: 'sha-abc' }))
        .rejects.toThrow(ForkError);
    });

    it('throws E_FORK_WRITER_NOT_FOUND when writer does not exist', async () => {
      host.discoverWriters.mockResolvedValue(['bob']);

      const err = await ctrl.fork({ from: 'alice', at: 'sha-abc' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_WRITER_NOT_FOUND');
    });

    it('throws E_FORK_PATCH_NOT_FOUND when patch SHA does not exist', async () => {
      host._persistence.nodeExists.mockResolvedValue(false);

      const err = await ctrl.fork({ from: 'alice', at: 'nonexistent' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_PATCH_NOT_FOUND');
    });

    it('throws E_FORK_WRITER_NOT_FOUND when writer ref has no commits', async () => {
      host._persistence.readRef.mockResolvedValue(null);

      const err = await ctrl.fork({ from: 'alice', at: 'sha-abc' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_WRITER_NOT_FOUND');
    });

    it('throws E_FORK_PATCH_NOT_IN_CHAIN when at is not ancestor of tip', async () => {
      host._persistence.readRef.mockResolvedValue('tip-sha');
      // getNodeInfo: tip has no parents => chain is just [tip]
      host._persistence.getNodeInfo.mockResolvedValue({ parents: [] });

      const err = await ctrl.fork({ from: 'alice', at: 'orphan-sha' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_PATCH_NOT_IN_CHAIN');
    });

    it('throws E_FORK_ALREADY_EXISTS when fork graph already has refs', async () => {
      host._persistence.readRef.mockResolvedValue('sha-abc');
      host._persistence.listRefs.mockResolvedValue(['refs/warp/my-fork/writers/w1']);

      const err = await ctrl.fork({ from: 'alice', at: 'sha-abc', forkName: 'my-fork' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_ALREADY_EXISTS');
    });

    it('throws E_FORK_NAME_INVALID for invalid fork name', async () => {
      host._persistence.readRef.mockResolvedValue('sha-abc');

      // A name with path-traversal is invalid per RefLayout
      const err = await ctrl.fork({ from: 'alice', at: 'sha-abc', forkName: '../escape' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_NAME_INVALID');
    });

    it('rolls back ref on WarpRuntime.open failure', async () => {
      host._persistence.readRef.mockResolvedValue('sha-abc');
      mockRuntimeOpen.mockRejectedValue(new Error('open failed'));

      await expect(ctrl.fork({ from: 'alice', at: 'sha-abc', forkName: 'rollback-fork', forkWriterId: 'rw' }))
        .rejects.toThrow('open failed');

      const expectedRef = buildWriterRef('rollback-fork', 'rw');
      expect(host._persistence.deleteRef).toHaveBeenCalledWith(expectedRef);
    });

    it('rollback failure does not mask original error', async () => {
      host._persistence.readRef.mockResolvedValue('sha-abc');
      mockRuntimeOpen.mockRejectedValue(new Error('open failed'));
      host._persistence.deleteRef.mockRejectedValue(new Error('deleteRef failed'));

      const err = await ctrl.fork({ from: 'alice', at: 'sha-abc', forkName: 'rb-fork', forkWriterId: 'rw' }).catch((e) => e);
      expect(err.message).toBe('open failed');
    });

    it('checks listRefs with the correct prefix for the fork name', async () => {
      host._persistence.readRef.mockResolvedValue('sha-abc');

      await ctrl.fork({ from: 'alice', at: 'sha-abc', forkName: 'custom-fork', forkWriterId: 'fw' });

      const expectedPrefix = buildWritersPrefix('custom-fork');
      expect(host._persistence.listRefs).toHaveBeenCalledWith(expectedPrefix);
    });
  });

  // =========================================================================
  // _isAncestor()
  // =========================================================================
  describe('_isAncestor()', () => {
    it('returns true when ancestor and descendant are the same SHA', async () => {
      expect(await ctrl._isAncestor('sha-a', 'sha-a')).toBe(true);
    });

    it('returns true when ancestor is direct parent', async () => {
      const chain = ['sha-a', 'sha-b'];
      setupLinearChain(host, chain);

      expect(await ctrl._isAncestor('sha-a', 'sha-b')).toBe(true);
    });

    it('returns true for grandparent ancestry', async () => {
      const chain = ['sha-a', 'sha-b', 'sha-c'];
      setupLinearChain(host, chain);

      expect(await ctrl._isAncestor('sha-a', 'sha-c')).toBe(true);
    });

    it('returns false when ancestorSha is empty', async () => {
      expect(await ctrl._isAncestor('', 'sha-b')).toBe(false);
    });

    it('returns false when descendantSha is empty', async () => {
      expect(await ctrl._isAncestor('sha-a', '')).toBe(false);
    });

    it('returns false when both are null/undefined', async () => {
      expect(await ctrl._isAncestor(/** @type {*} */ (null), /** @type {*} */ (null))).toBe(false);
    });

    it('returns false when ancestor is not in the chain', async () => {
      const chain = ['sha-a', 'sha-b', 'sha-c'];
      setupLinearChain(host, chain);

      expect(await ctrl._isAncestor('sha-orphan', 'sha-c')).toBe(false);
    });

    it('throws E_FORK_CYCLE_DETECTED on cycle', async () => {
      // sha-a -> sha-b -> sha-a (cycle)
      host._persistence.getNodeInfo.mockImplementation(async (sha) => {
        if (sha === 'sha-b') {
          return { parents: ['sha-a'] };
        }
        if (sha === 'sha-a') {
          return { parents: ['sha-b'] };
        }
        return { parents: [] };
      });

      const err = await ctrl._isAncestor('sha-target', 'sha-b').catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_CYCLE_DETECTED');
    });
  });

  // =========================================================================
  // _relationToCheckpointHead()
  // =========================================================================
  describe('_relationToCheckpointHead()', () => {
    it('returns "same" when incoming SHA equals checkpoint head', async () => {
      expect(await ctrl._relationToCheckpointHead('sha-a', 'sha-a')).toBe('same');
    });

    it('returns "ahead" when checkpoint head is ancestor of incoming', async () => {
      const chain = ['sha-ck', 'sha-mid', 'sha-incoming'];
      setupLinearChain(host, chain);

      expect(await ctrl._relationToCheckpointHead('sha-ck', 'sha-incoming')).toBe('ahead');
    });

    it('returns "behind" when incoming is ancestor of checkpoint head', async () => {
      const chain = ['sha-incoming', 'sha-mid', 'sha-ck'];
      setupLinearChain(host, chain);

      expect(await ctrl._relationToCheckpointHead('sha-ck', 'sha-incoming')).toBe('behind');
    });

    it('returns "diverged" when neither is ancestor of the other', async () => {
      // Two independent chains — getNodeInfo returns no parents for both
      host._persistence.getNodeInfo.mockResolvedValue({ parents: [] });

      expect(await ctrl._relationToCheckpointHead('sha-ck', 'sha-incoming')).toBe('diverged');
    });
  });

  // =========================================================================
  // _validatePatchAgainstCheckpoint()
  // =========================================================================
  describe('_validatePatchAgainstCheckpoint()', () => {
    it('no-op when checkpoint is null', async () => {
      await expect(ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', null)).resolves.toBeUndefined();
    });

    it('no-op when checkpoint is undefined', async () => {
      await expect(ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', undefined)).resolves.toBeUndefined();
    });

    it('no-op when checkpoint schema is unsupported', async () => {
      const checkpoint = { state: {}, frontier: new Map(), stateHash: '', schema: 999 };
      await expect(ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', checkpoint)).resolves.toBeUndefined();
    });

    it('no-op when writer is not in checkpoint frontier (new writer)', async () => {
      const checkpoint = {
        state: {},
        frontier: new Map([['other-writer', 'sha-x']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_STANDARD,
      };
      await expect(ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', checkpoint)).resolves.toBeUndefined();
    });

    it('passes silently when relation is "ahead"', async () => {
      const chain = ['sha-ck', 'sha-incoming'];
      setupLinearChain(host, chain);

      const checkpoint = {
        state: {},
        frontier: new Map([['w1', 'sha-ck']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_STANDARD,
      };

      await expect(ctrl._validatePatchAgainstCheckpoint('w1', 'sha-incoming', checkpoint)).resolves.toBeUndefined();
    });

    it('throws E_FORK_BACKFILL_REJECTED when relation is "same"', async () => {
      const checkpoint = {
        state: {},
        frontier: new Map([['w1', 'sha-a']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_STANDARD,
      };

      const err = await ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', checkpoint).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_BACKFILL_REJECTED');
    });

    it('throws E_FORK_BACKFILL_REJECTED when relation is "behind"', async () => {
      const chain = ['sha-incoming', 'sha-ck'];
      setupLinearChain(host, chain);

      const checkpoint = {
        state: {},
        frontier: new Map([['w1', 'sha-ck']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_STANDARD,
      };

      const err = await ctrl._validatePatchAgainstCheckpoint('w1', 'sha-incoming', checkpoint).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_BACKFILL_REJECTED');
    });

    it('throws E_FORK_WRITER_DIVERGED when relation is "diverged"', async () => {
      host._persistence.getNodeInfo.mockResolvedValue({ parents: [] });

      const checkpoint = {
        state: {},
        frontier: new Map([['w1', 'sha-ck']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_STANDARD,
      };

      const err = await ctrl._validatePatchAgainstCheckpoint('w1', 'sha-incoming', checkpoint).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_WRITER_DIVERGED');
    });

    it('works with CHECKPOINT_SCHEMA_V5_INTERMEDIATE', async () => {
      const checkpoint = {
        state: {},
        frontier: new Map([['w1', 'sha-a']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_V5_INTERMEDIATE,
      };

      const err = await ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', checkpoint).catch((e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_BACKFILL_REJECTED');
    });

    it('no-op when frontier entry for writer is empty string', async () => {
      const checkpoint = {
        state: {},
        frontier: new Map([['w1', '']]),
        stateHash: '',
        schema: CHECKPOINT_SCHEMA_STANDARD,
      };

      await expect(ctrl._validatePatchAgainstCheckpoint('w1', 'sha-a', checkpoint)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // createWormhole()
  // =========================================================================
  describe('createWormhole()', () => {
    it('delegates to WormholeService.createWormhole', async () => {
      const { createWormhole: mockCreateWormhole } = await import('../../../../../src/domain/services/WormholeService.js');

      const wormholeResult = { fromSha: 'sha-a', toSha: 'sha-b', writerId: 'w1', payload: {}, patchCount: 5 };
      /** @type {import('vitest').Mock} */ (mockCreateWormhole).mockResolvedValue(wormholeResult);

      const result = await ctrl.createWormhole('sha-a', 'sha-b');

      expect(mockCreateWormhole).toHaveBeenCalledWith({
        persistence: host._persistence,
        graphName: 'test-graph',
        fromSha: 'sha-a',
        toSha: 'sha-b',
        codec: host._codec,
      });
      expect(result).toEqual(wormholeResult);
      expect(host._logTiming).toHaveBeenCalledWith('createWormhole', 0, expect.objectContaining({ metrics: expect.any(String) }));
    });

    it('re-throws WormholeService errors and logs timing', async () => {
      const { createWormhole: mockCreateWormhole } = await import('../../../../../src/domain/services/WormholeService.js');
      /** @type {import('vitest').Mock} */ (mockCreateWormhole).mockRejectedValue(new Error('wormhole boom'));

      await expect(ctrl.createWormhole('sha-a', 'sha-b')).rejects.toThrow('wormhole boom');
      expect(host._logTiming).toHaveBeenCalledWith('createWormhole', 0, expect.objectContaining({ error: expect.any(Error) }));
    });
  });
});
