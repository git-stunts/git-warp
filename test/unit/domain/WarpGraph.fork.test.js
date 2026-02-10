import { describe, it, expect, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import ForkError from '../../../src/domain/errors/ForkError.js';
import {
  createMockPersistence,
  createMockPatch,
} from '../../helpers/warpGraphTestUtils.js';

// Valid 40-char hex SHAs for testing
const SHA1 = '1111111111111111111111111111111111111111';
const SHA2 = '2222222222222222222222222222222222222222';
const SHA3 = '3333333333333333333333333333333333333333';
const POID1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const POID2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const POID3 = 'cccccccccccccccccccccccccccccccccccccccc';

describe('WarpGraph.fork', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName: 'test-graph',
      writerId: 'test-writer',
    });
  });

  describe('parameter validation', () => {
    it('throws E_FORK_INVALID_ARGS when from is missing', async () => {
      const err = await graph.fork({ at: SHA1 }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_INVALID_ARGS');
    });

    it('throws E_FORK_INVALID_ARGS when from is not a string', async () => {
      const err = await graph.fork({ from: 123, at: SHA1 }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_INVALID_ARGS');
    });

    it('throws E_FORK_INVALID_ARGS when at is missing', async () => {
      const err = await graph.fork({ from: 'alice' }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_INVALID_ARGS');
    });

    it('throws E_FORK_INVALID_ARGS when at is not a string', async () => {
      const err = await graph.fork({ from: 'alice', at: 123 }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_INVALID_ARGS');
    });
  });

  describe('writer validation', () => {
    it('throws E_FORK_WRITER_NOT_FOUND when writer does not exist', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const err = await graph.fork({ from: 'nonexistent', at: SHA1 }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_WRITER_NOT_FOUND');
      expect(err.context).toMatchObject({
        writerId: 'nonexistent',
        graphName: 'test-graph',
      });
    });

    it('validates writer exists before checking patch', async () => {
      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/alice']);
      persistence.nodeExists.mockResolvedValue(false);

      await expect(
        graph.fork({ from: 'bob', at: SHA1 })
      ).rejects.toMatchObject({
        code: 'E_FORK_WRITER_NOT_FOUND',
      });
    });
  });

  describe('patch validation', () => {
    it('throws E_FORK_PATCH_NOT_FOUND when patch SHA does not exist', async () => {
      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/alice']);
      persistence.nodeExists.mockResolvedValue(false);

      const err = await graph.fork({ from: 'alice', at: '4444444444444444444444444444444444444444' }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_PATCH_NOT_FOUND');
      expect(err.context).toMatchObject({
        patchSha: '4444444444444444444444444444444444444444',
      });
    });

    it('throws E_FORK_PATCH_NOT_IN_CHAIN when patch is not in writer chain', async () => {
      const patch1 = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });
      const patch2 = createMockPatch({ graphName: 'test-graph', sha: SHA2, writerId: 'alice', lamport: 2, patchOid: POID2, parentSha: SHA1 });

      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/alice']);
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA2;
        }
        return null;
      });
      // Simulate that '5555555555555555555555555555555555555555' is not an ancestor of SHA2
      persistence.getNodeInfo.mockImplementation(async (/** @type {any} */ sha) => {
        if (sha === SHA2) {
          return patch2.nodeInfo;
        }
        if (sha === SHA1) {
          return patch1.nodeInfo;
        }
        return { parents: [] };
      });

      const err = await graph.fork({ from: 'alice', at: '5555555555555555555555555555555555555555' }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_PATCH_NOT_IN_CHAIN');
      expect(err.context).toMatchObject({
        patchSha: '5555555555555555555555555555555555555555',
        writerId: 'alice',
      });
    });
  });

  describe('fork name validation', () => {
    it('throws E_FORK_NAME_INVALID for invalid fork name', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix.includes('test-graph')) {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockResolvedValue(SHA1);
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      const err = await graph.fork({ from: 'alice', at: SHA1, forkName: '../invalid' }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_NAME_INVALID');
    });

    it('throws E_FORK_ALREADY_EXISTS when fork graph already has refs', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix.includes('test-graph/')) {
          return ['refs/warp/test-graph/writers/alice'];
        }
        if (prefix.includes('existing-fork')) {
          return ['refs/warp/existing-fork/writers/bob'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockResolvedValue(SHA1);
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      const err = await graph.fork({ from: 'alice', at: SHA1, forkName: 'existing-fork' }).catch((/** @type {any} */ e) => e);
      expect(err).toBeInstanceOf(ForkError);
      expect(err.code).toBe('E_FORK_ALREADY_EXISTS');
      expect(err.context).toMatchObject({
        forkName: 'existing-fork',
      });
    });
  });

  describe('successful fork', () => {
    it('creates a fork with auto-generated name and writer ID', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA1;
        }
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      const fork = await graph.fork({ from: 'alice', at: SHA1 });

      expect(fork).toBeInstanceOf(WarpGraph);
      expect(fork.graphName).toMatch(/^test-graph-fork-\d+-[a-z0-9]{4}$/);
      expect(fork.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);

      // Verify updateRef was called to point fork writer at the fork point
      expect(persistence.updateRef).toHaveBeenCalledWith(
        expect.stringMatching(/^refs\/warp\/test-graph-fork-\d+-[a-z0-9]{4}\/writers\/w_/),
        SHA1
      );
    });

    it('creates a fork with custom name and writer ID', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA1;
        }
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      const fork = await graph.fork({
        from: 'alice',
        at: SHA1,
        forkName: 'my-experiment',
        forkWriterId: 'experiment-writer',
      });

      expect(fork).toBeInstanceOf(WarpGraph);
      expect(fork.graphName).toBe('my-experiment');
      expect(fork.writerId).toBe('experiment-writer');

      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/warp/my-experiment/writers/experiment-writer',
        SHA1
      );
    });

    it('fork shares the same persistence adapter', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA1;
        }
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      const fork = await graph.fork({ from: 'alice', at: SHA1 });

      // Fork should share the persistence adapter (content-addressed dedup)
      expect(fork.persistence).toBe(graph.persistence);
    });
  });

  describe('fork isolation', () => {
    it('fork gets independent graph name from original', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA1;
        }
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      const fork = await graph.fork({
        from: 'alice',
        at: SHA1,
        forkName: 'my-fork',
      });

      // Graphs have different names
      expect(fork.graphName).not.toBe(graph.graphName);
      expect(fork.graphName).toBe('my-fork');
      expect(graph.graphName).toBe('test-graph');
    });

    it('validates fork writer ID if explicitly provided', async () => {
      const patch = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA1;
        }
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch.nodeInfo);

      await expect(
        graph.fork({
          from: 'alice',
          at: SHA1,
          forkWriterId: 'invalid/writer',
        })
      ).rejects.toMatchObject({
        code: 'E_FORK_WRITER_ID_INVALID',
      });
    });
  });

  describe('fork at different points in chain', () => {
    it('can fork at the tip of a writer chain', async () => {
      const patch1 = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });
      const patch2 = createMockPatch({ graphName: 'test-graph', sha: SHA2, writerId: 'alice', lamport: 2, patchOid: POID2, parentSha: SHA1 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA2; // tip
        }
        return null;
      });
      persistence.getNodeInfo.mockImplementation(async (/** @type {any} */ sha) => {
        if (sha === SHA2) return patch2.nodeInfo;
        if (sha === SHA1) return patch1.nodeInfo;
        return { parents: [] };
      });

      const fork = await graph.fork({ from: 'alice', at: SHA2 });

      expect(fork).toBeInstanceOf(WarpGraph);
      expect(persistence.updateRef).toHaveBeenCalledWith(
        expect.stringContaining('writers/'),
        SHA2
      );
    });

    it('can fork at an earlier point in the chain', async () => {
      const patch1 = createMockPatch({ graphName: 'test-graph', sha: SHA1, writerId: 'alice', lamport: 1, patchOid: POID1 });
      const patch2 = createMockPatch({ graphName: 'test-graph', sha: SHA2, writerId: 'alice', lamport: 2, patchOid: POID2, parentSha: SHA1 });
      const patch3 = createMockPatch({ graphName: 'test-graph', sha: SHA3, writerId: 'alice', lamport: 3, patchOid: POID3, parentSha: SHA2 });

      persistence.listRefs.mockImplementation(async (/** @type {any} */ prefix) => {
        if (prefix === 'refs/warp/test-graph/writers/') {
          return ['refs/warp/test-graph/writers/alice'];
        }
        return [];
      });
      persistence.nodeExists.mockResolvedValue(true);
      persistence.readRef.mockImplementation(async (/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test-graph/writers/alice') {
          return SHA3; // tip
        }
        return null;
      });
      persistence.getNodeInfo.mockImplementation(async (/** @type {any} */ sha) => {
        if (sha === SHA3) return patch3.nodeInfo;
        if (sha === SHA2) return patch2.nodeInfo;
        if (sha === SHA1) return patch1.nodeInfo;
        return { parents: [] };
      });

      // Fork at sha1 (earliest commit)
      const fork = await graph.fork({ from: 'alice', at: SHA1 });

      expect(fork).toBeInstanceOf(WarpGraph);
      expect(persistence.updateRef).toHaveBeenCalledWith(
        expect.stringContaining('writers/'),
        SHA1
      );
    });
  });
});

describe('ForkError', () => {
  it('has correct name and code properties', () => {
    const err = new ForkError('test message', { code: 'E_FORK_TEST' });
    expect(err.name).toBe('ForkError');
    expect(err.code).toBe('E_FORK_TEST');
    expect(err.message).toBe('test message');
  });

  it('defaults code to FORK_ERROR', () => {
    const err = new ForkError('test message');
    expect(err.code).toBe('FORK_ERROR');
  });

  it('includes context in error', () => {
    const err = new ForkError('test message', {
      code: 'E_FORK_TEST',
      context: { foo: 'bar' },
    });
    expect(err.context).toEqual({ foo: 'bar' });
  });
});
