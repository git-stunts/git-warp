import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import Plumbing from '@git-stunts/plumbing';
import GitGraphAdapter from '../../../src/infrastructure/adapters/GitGraphAdapter.js';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { isEmptyDiff } from '../../../src/domain/services/StateDiff.js';

async function createRepo() {
  const tempDir = await mkdtemp(join(tmpdir(), 'warp-subscribe-'));
  const plumbing = Plumbing.createDefault({ cwd: tempDir });
  await plumbing.execute({ args: ['init'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  const persistence = new GitGraphAdapter({ plumbing });

  return {
    tempDir,
    persistence,
    async cleanup() {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

describe('WarpGraph.subscribe() (PL/SUB/1)', () => {
  let repo;
  let graph;

  beforeEach(async () => {
    repo = await createRepo();
    graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'test',
      writerId: 'w1',
    });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('subscribe/unsubscribe', () => {
    it('returns an object with unsubscribe method', () => {
      const result = graph.subscribe({ onChange: () => {} });

      expect(result).toHaveProperty('unsubscribe');
      expect(typeof result.unsubscribe).toBe('function');
    });

    it('throws if onChange is not a function', () => {
      expect(() => graph.subscribe({ onChange: 'not a function' }))
        .toThrow('onChange must be a function');
    });

    it('allows subscribing without onError', () => {
      expect(() => graph.subscribe({ onChange: () => {} }))
        .not.toThrow();
    });
  });

  describe('onChange called after materialize', () => {
    it('calls onChange with diff after commit → materialize', async () => {
      const onChange = vi.fn();
      graph.subscribe({ onChange });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
    });

    it('does not call onChange if state unchanged', async () => {
      const onChange = vi.fn();

      // First materialize to establish baseline
      await graph.materialize();

      graph.subscribe({ onChange });

      // Materialize again with no changes
      await graph.materialize();

      expect(onChange).not.toHaveBeenCalled();
    });

    it('includes edges and props in diff', async () => {
      const onChange = vi.fn();
      graph.subscribe({ onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('user:bob');
      patch.addEdge('user:alice', 'user:bob', 'follows');
      patch.setProperty('user:alice', 'name', 'Alice');
      await patch.commit();

      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.added).toContain('user:bob');
      expect(diff.edges.added).toContainEqual({
        from: 'user:alice',
        to: 'user:bob',
        label: 'follows',
      });
      expect(diff.props.set.some(p => p.nodeId === 'user:alice' && p.propKey === 'name')).toBe(true);
    });
  });

  describe('unsubscribe stops notifications', () => {
    it('does not call onChange after unsubscribe', async () => {
      const onChange = vi.fn();
      const { unsubscribe } = graph.subscribe({ onChange });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);

      unsubscribe();

      await (await graph.createPatch()).addNode('user:bob').commit();
      await graph.materialize();

      // Still only 1 call from before unsubscribe
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe is idempotent', async () => {
      const onChange = vi.fn();
      const { unsubscribe } = graph.subscribe({ onChange });

      unsubscribe();
      unsubscribe(); // Should not throw
      unsubscribe();

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('multiple subscribers', () => {
    it('notifies all subscribers', async () => {
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();
      const onChange3 = vi.fn();

      graph.subscribe({ onChange: onChange1 });
      graph.subscribe({ onChange: onChange2 });
      graph.subscribe({ onChange: onChange3 });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange1).toHaveBeenCalledTimes(1);
      expect(onChange2).toHaveBeenCalledTimes(1);
      expect(onChange3).toHaveBeenCalledTimes(1);

      // All receive the same diff
      expect(onChange1.mock.calls[0][0]).toEqual(onChange2.mock.calls[0][0]);
      expect(onChange2.mock.calls[0][0]).toEqual(onChange3.mock.calls[0][0]);
    });

    it('unsubscribing one does not affect others', async () => {
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();

      const sub1 = graph.subscribe({ onChange: onChange1 });
      graph.subscribe({ onChange: onChange2 });

      sub1.unsubscribe();

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange1).not.toHaveBeenCalled();
      expect(onChange2).toHaveBeenCalledTimes(1);
    });
  });

  describe('error isolation', () => {
    it('error in one handler does not block others', async () => {
      const onChange1 = vi.fn(() => {
        throw new Error('Handler 1 failed');
      });
      const onChange2 = vi.fn();
      const onChange3 = vi.fn();

      graph.subscribe({ onChange: onChange1 });
      graph.subscribe({ onChange: onChange2 });
      graph.subscribe({ onChange: onChange3 });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange1).toHaveBeenCalledTimes(1);
      expect(onChange2).toHaveBeenCalledTimes(1);
      expect(onChange3).toHaveBeenCalledTimes(1);
    });

    it('calls onError when handler throws', async () => {
      const error = new Error('Handler failed');
      const onChange = vi.fn(() => {
        throw error;
      });
      const onError = vi.fn();

      graph.subscribe({ onChange, onError });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('swallows error if onError also throws', async () => {
      const onChange = vi.fn(() => {
        throw new Error('Handler failed');
      });
      const onError = vi.fn(() => {
        throw new Error('onError also failed');
      });
      const onChange2 = vi.fn();

      graph.subscribe({ onChange, onError });
      graph.subscribe({ onChange: onChange2 });

      await (await graph.createPatch()).addNode('user:alice').commit();

      // Should not throw
      await expect(graph.materialize()).resolves.toBeDefined();

      // Second handler still called
      expect(onChange2).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('handles subscribe with no prior state (null before)', async () => {
      const onChange = vi.fn();
      graph.subscribe({ onChange });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.removed).toEqual([]);
    });

    it('handles removed nodes in diff', async () => {
      // Setup: create and materialize a node
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      // Subscribe after initial state
      const onChange = vi.fn();
      graph.subscribe({ onChange });

      // Remove the node
      await (await graph.createPatch()).removeNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.removed).toContain('user:alice');
    });

    it('handles unsubscribe called during handler execution', async () => {
      let sub;
      const onChange = vi.fn(() => {
        sub.unsubscribe();
      });

      sub = graph.subscribe({ onChange });

      await (await graph.createPatch()).addNode('user:alice').commit();

      // Should not throw
      await expect(graph.materialize()).resolves.toBeDefined();

      // Handler was called
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});

describe('WarpGraph.subscribe() with replay option (PL/SUB/2)', () => {
  let repo;
  let graph;

  beforeEach(async () => {
    repo = await createRepo();
    graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'test',
      writerId: 'w1',
    });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('replay: true with cached state', () => {
    it('immediately fires onChange with full state as additions', async () => {
      // Setup: create some state and materialize
      await (await graph.createPatch()).addNode('user:alice').commit();
      await (await graph.createPatch()).addNode('user:bob').commit();
      await graph.materialize();

      // Subscribe with replay: true
      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: true });

      // Should be called immediately (synchronously)
      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.added).toContain('user:bob');
      expect(diff.nodes.removed).toEqual([]);
    });

    it('includes edges and props in initial replay', async () => {
      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('user:bob');
      patch.addEdge('user:alice', 'user:bob', 'follows');
      patch.setProperty('user:alice', 'name', 'Alice');
      await patch.commit();
      await graph.materialize();

      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: true });

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.added).toContain('user:bob');
      expect(diff.edges.added).toContainEqual({
        from: 'user:alice',
        to: 'user:bob',
        label: 'follows',
      });
      expect(diff.props.set.some(p => p.nodeId === 'user:alice' && p.propKey === 'name')).toBe(true);
    });

    it('does not fire if state is empty', async () => {
      // Materialize empty graph (no commits)
      await graph.materialize();

      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: true });

      // No call because empty state → empty diff
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('replay: true without cached state (deferred)', () => {
    it('defers replay until first materialize', async () => {
      // Add some data but don't materialize
      await (await graph.createPatch()).addNode('user:alice').commit();

      // Subscribe with replay before materialize
      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: true });

      // Not called yet (no cached state)
      expect(onChange).not.toHaveBeenCalled();

      // Now materialize
      await graph.materialize();

      // Should receive full state as additions (deferred replay)
      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
    });

    it('deferred replay shows full state, not incremental diff', async () => {
      // Subscribe with replay before any materialize
      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: true });

      // Add data and materialize
      await (await graph.createPatch()).addNode('user:alice').commit();
      await (await graph.createPatch()).addNode('user:bob').commit();
      await graph.materialize();

      // Should receive full state (both nodes as additions)
      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.added).toContain('user:bob');
    });

    it('subsequent materialize calls get normal incremental diffs', async () => {
      // Subscribe with replay before any materialize
      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: true });

      // First materialize with some data
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      // First call is replay (full state)
      expect(onChange.mock.calls[0][0].nodes.added).toContain('user:alice');

      // Second commit + materialize
      await (await graph.createPatch()).addNode('user:bob').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(2);
      // Second call is incremental (only bob)
      const secondDiff = onChange.mock.calls[1][0];
      expect(secondDiff.nodes.added).toContain('user:bob');
      expect(secondDiff.nodes.added).not.toContain('user:alice');
    });
  });

  describe('replay: false (default behavior)', () => {
    it('does not fire immediately even with cached state', async () => {
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange = vi.fn();
      graph.subscribe({ onChange, replay: false });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('default (omitted replay) does not fire immediately', async () => {
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange = vi.fn();
      graph.subscribe({ onChange }); // replay not specified, defaults to false

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('error handling with replay', () => {
    it('calls onError if replay handler throws', async () => {
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const error = new Error('Replay handler failed');
      const onChange = vi.fn(() => {
        throw error;
      });
      const onError = vi.fn();

      graph.subscribe({ onChange, onError, replay: true });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('swallows error if onError also throws during replay', async () => {
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange = vi.fn(() => {
        throw new Error('Replay handler failed');
      });
      const onError = vi.fn(() => {
        throw new Error('onError also failed');
      });

      // Should not throw
      expect(() => {
        graph.subscribe({ onChange, onError, replay: true });
      }).not.toThrow();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple subscribers with replay', () => {
    it('replay fires independently for each subscriber', async () => {
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange1 = vi.fn();
      const onChange2 = vi.fn();
      const onChange3 = vi.fn();

      graph.subscribe({ onChange: onChange1, replay: true });
      graph.subscribe({ onChange: onChange2, replay: true });
      graph.subscribe({ onChange: onChange3, replay: false });

      expect(onChange1).toHaveBeenCalledTimes(1);
      expect(onChange2).toHaveBeenCalledTimes(1);
      expect(onChange3).not.toHaveBeenCalled();
    });

    it('mixed deferred and immediate replay', async () => {
      // Subscribe with replay before materialize
      const onChange1 = vi.fn();
      graph.subscribe({ onChange: onChange1, replay: true });

      // Add data and materialize
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      // Now subscribe with replay (will be immediate)
      const onChange2 = vi.fn();
      graph.subscribe({ onChange: onChange2, replay: true });

      // First subscriber got deferred replay on materialize
      expect(onChange1).toHaveBeenCalledTimes(1);
      // Second subscriber got immediate replay on subscribe
      expect(onChange2).toHaveBeenCalledTimes(1);

      // Both received the same state
      expect(onChange1.mock.calls[0][0].nodes.added).toContain('user:alice');
      expect(onChange2.mock.calls[0][0].nodes.added).toContain('user:alice');
    });
  });
});
