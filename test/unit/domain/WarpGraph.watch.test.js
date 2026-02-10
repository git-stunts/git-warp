import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph.watch() (PL/WATCH/1)', () => {
  /** @type {any} */
  let repo;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    repo = await createGitRepo('watch');
    graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'test',
      writerId: 'w1',
    });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('validation', () => {
    it('returns an object with unsubscribe method', () => {
      const result = graph.watch('user:*', { onChange: () => {} });

      expect(result).toHaveProperty('unsubscribe');
      expect(typeof result.unsubscribe).toBe('function');
    });

    it('throws if pattern is not a string', () => {
      expect(() => graph.watch(123, { onChange: () => {} }))
        .toThrow('pattern must be a string');
    });

    it('throws if onChange is not a function', () => {
      expect(() => graph.watch('user:*', { onChange: 'not a function' }))
        .toThrow('onChange must be a function');
    });

    it('allows watching without onError', () => {
      expect(() => graph.watch('user:*', { onChange: () => {} }))
        .not.toThrow();
    });
  });

  describe('pattern filtering - nodes', () => {
    it('fires for matching user node changes', async () => {
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
    });

    it('does not fire for non-matching node changes', async () => {
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      await (await graph.createPatch()).addNode('order:123').commit();
      await graph.materialize();

      expect(onChange).not.toHaveBeenCalled();
    });

    it('filters mixed node changes to only matching ones', async () => {
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      patch.addNode('user:bob');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toEqual(['user:alice', 'user:bob']);
      expect(diff.nodes.added).not.toContain('order:123');
    });

    it('handles removed nodes', async () => {
      // Setup: create nodes
      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      // Start watching
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      // Remove both nodes
      const patch2 = await graph.createPatch();
      patch2.removeNode('user:alice');
      patch2.removeNode('order:123');
      await patch2.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.removed).toContain('user:alice');
      expect(diff.nodes.removed).not.toContain('order:123');
    });
  });

  describe('pattern filtering - edges', () => {
    it('includes edges where "from" matches the pattern', async () => {
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      patch.addEdge('user:alice', 'order:123', 'placed');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.edges.added).toContainEqual({
        from: 'user:alice',
        to: 'order:123',
        label: 'placed',
      });
    });

    it('includes edges where "to" matches the pattern', async () => {
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      patch.addEdge('order:123', 'user:alice', 'belongs-to');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.edges.added).toContainEqual({
        from: 'order:123',
        to: 'user:alice',
        label: 'belongs-to',
      });
    });

    it('excludes edges where neither from nor to matches', async () => {
      // Setup: create user first
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('order:123');
      patch.addNode('product:456');
      patch.addEdge('order:123', 'product:456', 'contains');
      await patch.commit();
      await graph.materialize();

      // Handler not called because no user nodes/edges changed
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('pattern filtering - properties', () => {
    it('includes props for matching nodes', async () => {
      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.setProperty('user:alice', 'name', 'Alice');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.props.set.some((/** @type {any} */ p) => p.nodeId === 'user:alice' && p.propKey === 'name')).toBe(true);
    });

    it('excludes props for non-matching nodes', async () => {
      // Setup: create a user first
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange = vi.fn();
      graph.watch('user:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('order:123');
      patch.setProperty('order:123', 'total', 99);
      await patch.commit();
      await graph.materialize();

      // Only order changes, no user changes
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('pattern variations', () => {
    it('pattern "*" matches all changes', async () => {
      const onChange = vi.fn();
      graph.watch('*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.added).toContain('order:123');
    });

    it('exact pattern matches only that node', async () => {
      const onChange = vi.fn();
      graph.watch('user:alice', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('user:bob');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toEqual(['user:alice']);
    });

    it('pattern with multiple wildcards works', async () => {
      const onChange = vi.fn();
      graph.watch('*:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:alice');
      expect(diff.nodes.added).toContain('order:123');
    });

    it('pattern with middle wildcard works', async () => {
      const onChange = vi.fn();
      graph.watch('user:*:profile', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice:profile');
      patch.addNode('user:bob:settings');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toEqual(['user:alice:profile']);
    });

    it('escapes regex special characters in pattern', async () => {
      const onChange = vi.fn();
      // Pattern with regex special chars: . and ()
      graph.watch('user.(test)*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user.(test)alice');
      patch.addNode('user.test.bob'); // Should NOT match (dots not escaped as wildcard)
      await patch.commit();
      await graph.materialize();

      expect(onChange).toHaveBeenCalledTimes(1);
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toEqual(['user.(test)alice']);
    });
  });

  describe('unsubscribe', () => {
    it('stops notifications after unsubscribe', async () => {
      const onChange = vi.fn();
      const { unsubscribe } = graph.watch('user:*', { onChange });

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
      const { unsubscribe } = graph.watch('user:*', { onChange });

      unsubscribe();
      unsubscribe(); // Should not throw
      unsubscribe();

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls onError when handler throws', async () => {
      const error = new Error('Handler failed');
      const onChange = vi.fn(() => {
        throw error;
      });
      const onError = vi.fn();

      graph.watch('user:*', { onChange, onError });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('error in watch handler does not block other subscribers', async () => {
      const onChange1 = vi.fn(() => {
        throw new Error('Watch handler failed');
      });
      const onChange2 = vi.fn();

      graph.watch('user:*', { onChange: onChange1 });
      graph.subscribe({ onChange: onChange2 });

      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      expect(onChange1).toHaveBeenCalledTimes(1);
      expect(onChange2).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('does not fire when pattern matches no changes', async () => {
      const onChange = vi.fn();
      graph.watch('product:*', { onChange });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      expect(onChange).not.toHaveBeenCalled();
    });

    it('handles empty diff after filtering', async () => {
      // Setup: create a user
      await (await graph.createPatch()).addNode('user:alice').commit();
      await graph.materialize();

      const onChange = vi.fn();
      graph.watch('product:*', { onChange });

      // Only user changes
      await (await graph.createPatch()).setProperty('user:alice', 'name', 'Alice').commit();
      await graph.materialize();

      // No product changes, handler not called
      expect(onChange).not.toHaveBeenCalled();
    });

    it('multiple watch handlers can coexist with different patterns', async () => {
      const userHandler = vi.fn();
      const orderHandler = vi.fn();

      graph.watch('user:*', { onChange: userHandler });
      graph.watch('order:*', { onChange: orderHandler });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      expect(userHandler).toHaveBeenCalledTimes(1);
      expect(orderHandler).toHaveBeenCalledTimes(1);

      const userDiff = userHandler.mock.calls[0][0];
      const orderDiff = orderHandler.mock.calls[0][0];

      expect(userDiff.nodes.added).toEqual(['user:alice']);
      expect(orderDiff.nodes.added).toEqual(['order:123']);
    });

    it('watch and subscribe can coexist', async () => {
      const watchHandler = vi.fn();
      const subscribeHandler = vi.fn();

      graph.watch('user:*', { onChange: watchHandler });
      graph.subscribe({ onChange: subscribeHandler });

      const patch = await graph.createPatch();
      patch.addNode('user:alice');
      patch.addNode('order:123');
      await patch.commit();
      await graph.materialize();

      expect(watchHandler).toHaveBeenCalledTimes(1);
      expect(subscribeHandler).toHaveBeenCalledTimes(1);

      // Watch only sees user
      const watchDiff = watchHandler.mock.calls[0][0];
      expect(watchDiff.nodes.added).toEqual(['user:alice']);

      // Subscribe sees everything
      const subscribeDiff = subscribeHandler.mock.calls[0][0];
      expect(subscribeDiff.nodes.added).toContain('user:alice');
      expect(subscribeDiff.nodes.added).toContain('order:123');
    });
  });
});

describe('WarpGraph.watch() polling (PL/WATCH/2)', () => {
  /** @type {any} */
  let repo;
  /** @type {any} */
  let graph;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    repo = await createGitRepo('watch');
    graph = await WarpGraph.open({
      persistence: repo.persistence,
      graphName: 'test',
      writerId: 'w1',
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await repo.cleanup();
  });

  describe('validation', () => {
    it('throws if poll is less than 1000', () => {
      expect(() => graph.watch('user:*', { onChange: () => {}, poll: 500 }))
        .toThrow('poll must be a number >= 1000');
    });

    it('throws if poll is not a number', () => {
      expect(() => graph.watch('user:*', { onChange: () => {}, poll: 'fast' }))
        .toThrow('poll must be a number >= 1000');
    });

    it('accepts poll of exactly 1000', () => {
      const { unsubscribe } = graph.watch('user:*', { onChange: () => {}, poll: 1000 });
      expect(unsubscribe).toBeDefined();
      unsubscribe();
    });

    it('accepts poll greater than 1000', () => {
      const { unsubscribe } = graph.watch('user:*', { onChange: () => {}, poll: 5000 });
      expect(unsubscribe).toBeDefined();
      unsubscribe();
    });
  });

  describe('polling behavior', () => {
    it('calls hasFrontierChanged on poll interval', async () => {
      const onChange = vi.fn();
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(false);

      const { unsubscribe } = graph.watch('user:*', { onChange, poll: 2000 });

      // No calls yet
      expect(hasFrontierChangedSpy).not.toHaveBeenCalled();

      // Advance past first interval
      await vi.advanceTimersByTimeAsync(2000);

      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(1);

      // Advance past second interval
      await vi.advanceTimersByTimeAsync(2000);

      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(2);

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
    });

    it('calls materialize when frontier has changed', async () => {
      const onChange = vi.fn();
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(true);
      const materializeSpy = vi.spyOn(graph, 'materialize').mockResolvedValue(undefined);

      const { unsubscribe } = graph.watch('user:*', { onChange, poll: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(1);
      expect(materializeSpy).toHaveBeenCalledTimes(1);

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
      materializeSpy.mockRestore();
    });

    it('does not call materialize when frontier has not changed', async () => {
      const onChange = vi.fn();
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(false);
      const materializeSpy = vi.spyOn(graph, 'materialize').mockResolvedValue(undefined);

      const { unsubscribe } = graph.watch('user:*', { onChange, poll: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(1);
      expect(materializeSpy).not.toHaveBeenCalled();

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
      materializeSpy.mockRestore();
    });

    it('unsubscribe stops polling', async () => {
      const onChange = vi.fn();
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(false);

      const { unsubscribe } = graph.watch('user:*', { onChange, poll: 1000 });

      await vi.advanceTimersByTimeAsync(1000);
      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Advance more time — should not call again
      await vi.advanceTimersByTimeAsync(5000);
      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(1);

      hasFrontierChangedSpy.mockRestore();
    });

    it('unsubscribe is idempotent with polling', async () => {
      const onChange = vi.fn();
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(false);

      const { unsubscribe } = graph.watch('user:*', { onChange, poll: 1000 });

      unsubscribe();
      unsubscribe(); // Should not throw
      unsubscribe();

      await vi.advanceTimersByTimeAsync(5000);
      expect(hasFrontierChangedSpy).not.toHaveBeenCalled();

      hasFrontierChangedSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('calls onError when hasFrontierChanged throws', async () => {
      const onChange = vi.fn();
      const onError = vi.fn();
      const error = new Error('Frontier check failed');
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockRejectedValue(error);

      const { unsubscribe } = graph.watch('user:*', { onChange, onError, poll: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      expect(onError).toHaveBeenCalledWith(error);

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
    });

    it('calls onError when materialize throws', async () => {
      const onChange = vi.fn();
      const onError = vi.fn();
      const error = new Error('Materialize failed');
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(true);
      const materializeSpy = vi.spyOn(graph, 'materialize').mockRejectedValue(error);

      const { unsubscribe } = graph.watch('user:*', { onChange, onError, poll: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      expect(onError).toHaveBeenCalledWith(error);

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
      materializeSpy.mockRestore();
    });

    it('swallows error if onError throws', async () => {
      const onChange = vi.fn();
      const onError = vi.fn(() => {
        throw new Error('onError itself failed');
      });
      const error = new Error('Frontier check failed');
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockRejectedValue(error);

      const { unsubscribe } = graph.watch('user:*', { onChange, onError, poll: 1000 });

      // Should not throw
      await vi.advanceTimersByTimeAsync(1000);

      expect(onError).toHaveBeenCalled();

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
    });

    it('continues polling after error', async () => {
      const onChange = vi.fn();
      const onError = vi.fn();
      const error = new Error('Frontier check failed');
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged')
        .mockRejectedValueOnce(error)
        .mockResolvedValue(false);

      const { unsubscribe } = graph.watch('user:*', { onChange, onError, poll: 1000 });

      // First poll - error
      await vi.advanceTimersByTimeAsync(1000);
      expect(onError).toHaveBeenCalledTimes(1);

      // Second poll - success
      await vi.advanceTimersByTimeAsync(1000);
      expect(hasFrontierChangedSpy).toHaveBeenCalledTimes(2);

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
    });
  });

  describe('integration with subscription', () => {
    it('subscription receives diff when poll triggers materialize', async () => {
      // This test verifies the integration: poll -> hasFrontierChanged -> materialize -> handler
      const onChange = vi.fn();

      // Mock hasFrontierChanged to return true (simulating remote changes)
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(true);

      // Mock materialize to call _notifySubscribers with a diff containing user:bob
      const mockDiff = {
        nodes: { added: ['user:bob'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      };
      const materializeSpy = vi.spyOn(graph, 'materialize').mockImplementation(async () => {
        // Simulate what materialize does: notify subscribers
        graph._notifySubscribers(mockDiff, {});
      });

      const { unsubscribe } = graph.watch('user:*', { onChange, poll: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      // Handler should have been called with user:bob
      expect(hasFrontierChangedSpy).toHaveBeenCalled();
      expect(materializeSpy).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalled();
      const diff = onChange.mock.calls[0][0];
      expect(diff.nodes.added).toContain('user:bob');

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
      materializeSpy.mockRestore();
    });

    it('no polling without poll option', async () => {
      const onChange = vi.fn();
      const hasFrontierChangedSpy = vi.spyOn(graph, 'hasFrontierChanged').mockResolvedValue(false);

      const { unsubscribe } = graph.watch('user:*', { onChange });

      await vi.advanceTimersByTimeAsync(10000);

      expect(hasFrontierChangedSpy).not.toHaveBeenCalled();

      unsubscribe();
      hasFrontierChangedSpy.mockRestore();
    });
  });
});
