import { describe, it, expect, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { addNodeToState, addEdgeToState, setupGraphState, createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph logical traversal', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = createMockPersistence();

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  it('bfs visits neighbors in canonical order', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:c', 'z', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'a', 5);
    });

    const result = await graph.traverse.bfs('node:a', { dir: 'out', maxDepth: 1 });
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('dfs follows canonical neighbor order', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:c', 'z', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'a', 5);
    });

    const result = await graph.traverse.dfs('node:a', { dir: 'out', maxDepth: 1 });
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('shortestPath uses canonical tie-breaks', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addNodeToState(state, 'node:d', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 5);
      addEdgeToState(state, 'node:a', 'node:c', 'x', 6);
      addEdgeToState(state, 'node:b', 'node:d', 'x', 7);
      addEdgeToState(state, 'node:c', 'node:d', 'x', 8);
    });

    const result = await graph.traverse.shortestPath('node:a', 'node:d', { dir: 'out' });
    expect(result).toEqual({ found: true, path: ['node:a', 'node:b', 'node:d'], length: 2 });
  });

  it('labelFilter supports string and array (OR semantics)', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:b', 'follows', 4);
      addEdgeToState(state, 'node:a', 'node:c', 'blocks', 5);
    });

    const followsOnly = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: 'follows' });
    expect(followsOnly).toEqual(['node:a', 'node:b']);

    const orFilter = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: ['blocks', 'follows'] });
    expect(orFilter).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('labelFilter empty array returns only the start node', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addEdgeToState(state, 'node:a', 'node:b', 'follows', 3);
    });

    const result = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: [] });
    expect(result).toEqual(['node:a']);
  });

  it('connectedComponent uses both directions', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:b', 'node:a', 'follows', 4);
      addEdgeToState(state, 'node:c', 'node:b', 'follows', 5);
    });

    const result = await graph.traverse.connectedComponent('node:a');
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });

  // ========================================================================
  // New facade methods
  // ========================================================================

  it('isReachable returns true for reachable pair', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 4);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 5);
    });

    const result = await graph.traverse.isReachable('node:a', 'node:c', { dir: 'out' });
    expect(result).toEqual({ reachable: true });
  });

  it('isReachable returns false for unreachable pair', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 3);
    });

    const result = await graph.traverse.isReachable('node:b', 'node:a', { dir: 'out' });
    expect(result).toEqual({ reachable: false });
  });

  it('weightedShortestPath finds path with weightFn', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 4);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 5);
      addEdgeToState(state, 'node:a', 'node:c', 'expensive', 6);
    });

    const result = await graph.traverse.weightedShortestPath('node:a', 'node:c', {
      dir: 'out',
      weightFn: (/** @type {string} */ _f, /** @type {string} */ _t, /** @type {string} */ label) => (label === 'expensive' ? 100 : 1),
    });
    expect(result.path).toEqual(['node:a', 'node:b', 'node:c']);
    expect(result.totalCost).toBe(2);
  });

  it('weightedShortestPath throws NO_PATH when unreachable', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
    });

    await expect(
      graph.traverse.weightedShortestPath('node:a', 'node:b', { dir: 'out' })
    ).rejects.toThrow(expect.objectContaining({ code: 'NO_PATH' }));
  });

  it('aStarSearch finds path', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 4);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 5);
    });

    const result = await graph.traverse.aStarSearch('node:a', 'node:c', { dir: 'out' });
    expect(result.path).toEqual(['node:a', 'node:b', 'node:c']);
    expect(result.totalCost).toBe(2);
    expect(typeof result.nodesExplored).toBe('number');
  });

  it('bidirectionalAStar finds path', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 4);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 5);
    });

    const result = await graph.traverse.bidirectionalAStar('node:a', 'node:c');
    expect(result.path).toEqual(['node:a', 'node:b', 'node:c']);
    expect(result.totalCost).toBe(2);
    expect(typeof result.nodesExplored).toBe('number');
  });

  it('transitiveClosureStream yields closure edges lazily', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addNodeToState(state, 'node:d', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 5);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 6);
      addEdgeToState(state, 'node:c', 'node:d', 'x', 7);
    });

    const edges = [];
    for await (const edge of graph.traverse.transitiveClosureStream('node:a', { dir: 'out' })) {
      edges.push(edge);
      if (edges.length === 3) {
        break;
      }
    }

    expect(edges).toEqual([
      { from: 'node:a', to: 'node:b' },
      { from: 'node:a', to: 'node:c' },
      { from: 'node:a', to: 'node:d' },
    ]);
  });

  it('topologicalSort returns DAG sorted order', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 4);
      addEdgeToState(state, 'node:a', 'node:c', 'x', 5);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 6);
    });

    const result = await graph.traverse.topologicalSort('node:a', { dir: 'out' });
    expect(result.hasCycle).toBe(false);
    expect(result.sorted).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('topologicalSort detects cycles', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 3);
      addEdgeToState(state, 'node:b', 'node:a', 'x', 4);
    });

    const result = await graph.traverse.topologicalSort('node:a', { dir: 'out' });
    expect(result.hasCycle).toBe(true);
  });

  it('topologicalSort accepts string[] start', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:a', 'node:c', 'x', 4);
      addEdgeToState(state, 'node:b', 'node:c', 'x', 5);
    });

    const result = await graph.traverse.topologicalSort(['node:a', 'node:b'], { dir: 'out' });
    expect(result.hasCycle).toBe(false);
    expect(result.sorted).toContain('node:a');
    expect(result.sorted).toContain('node:b');
    expect(result.sorted).toContain('node:c');
    // c must come after both a and b
    expect(result.sorted.indexOf('node:c')).toBeGreaterThan(result.sorted.indexOf('node:a'));
    expect(result.sorted.indexOf('node:c')).toBeGreaterThan(result.sorted.indexOf('node:b'));
  });

  it('commonAncestors finds shared ancestors in a diamond graph', async () => {
    // Diamond: root -> a, root -> b, a -> leaf, b -> leaf
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:root', 1);
      addNodeToState(state, 'node:a', 2);
      addNodeToState(state, 'node:b', 3);
      addNodeToState(state, 'node:leaf', 4);
      addEdgeToState(state, 'node:root', 'node:a', 'x', 5);
      addEdgeToState(state, 'node:root', 'node:b', 'x', 6);
      addEdgeToState(state, 'node:a', 'node:leaf', 'x', 7);
      addEdgeToState(state, 'node:b', 'node:leaf', 'x', 8);
    });

    const result = await graph.traverse.commonAncestors(['node:a', 'node:b']);
    expect(result.ancestors).toContain('node:root');
  });

  it('weightedLongestPath finds critical path in DAG', async () => {
    // a --(3)--> b --(3)--> d
    // a --(1)--> c --(1)--> d
    // longest: a -> b -> d = 6
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addNodeToState(state, 'node:d', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'heavy', 5);
      addEdgeToState(state, 'node:a', 'node:c', 'light', 6);
      addEdgeToState(state, 'node:b', 'node:d', 'heavy', 7);
      addEdgeToState(state, 'node:c', 'node:d', 'light', 8);
    });

    /** @param {string} _f @param {string} _t @param {string} label */
    const weightFn = (_f, _t, label) => (label === 'heavy' ? 3 : 1);

    const result = await graph.traverse.weightedLongestPath('node:a', 'node:d', {
      dir: 'out',
      weightFn,
    });
    expect(result.path).toEqual(['node:a', 'node:b', 'node:d']);
    expect(result.totalCost).toBe(6);
  });

  // ========================================================================
  // nodeWeightFn facade tests
  // ========================================================================

  it('weightedShortestPath with nodeWeightFn picks cheapest path', async () => {
    // A --(x)--> B --(x)--> D
    // A --(x)--> C --(x)--> D
    // Node weights: A=0, B=1, C=10, D=0
    // Shortest via nodes: A→B→D = 1+0 = 1
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addNodeToState(state, 'node:d', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 5);
      addEdgeToState(state, 'node:a', 'node:c', 'x', 6);
      addEdgeToState(state, 'node:b', 'node:d', 'x', 7);
      addEdgeToState(state, 'node:c', 'node:d', 'x', 8);
    });

    const weights = new Map([['node:a', 0], ['node:b', 1], ['node:c', 10], ['node:d', 0]]);
    const result = await graph.traverse.weightedShortestPath('node:a', 'node:d', {
      dir: 'out',
      nodeWeightFn: (/** @type {string} */ id) => weights.get(id) ?? 1,
    });
    expect(result.path).toEqual(['node:a', 'node:b', 'node:d']);
    expect(result.totalCost).toBe(1);
  });

  it('weightedLongestPath with nodeWeightFn picks longest path', async () => {
    // Same graph as above but longest path
    // Longest via nodes: A→C→D = 10+0 = 10
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addNodeToState(state, 'node:d', 4);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 5);
      addEdgeToState(state, 'node:a', 'node:c', 'x', 6);
      addEdgeToState(state, 'node:b', 'node:d', 'x', 7);
      addEdgeToState(state, 'node:c', 'node:d', 'x', 8);
    });

    const weights = new Map([['node:a', 0], ['node:b', 1], ['node:c', 10], ['node:d', 0]]);
    const result = await graph.traverse.weightedLongestPath('node:a', 'node:d', {
      dir: 'out',
      nodeWeightFn: (/** @type {string} */ id) => weights.get(id) ?? 1,
    });
    expect(result.path).toEqual(['node:a', 'node:c', 'node:d']);
    expect(result.totalCost).toBe(10);
  });

  // ========================================================================
  // Negative / edge-case tests
  // ========================================================================

  it('topologicalSort throwOnCycle throws ERR_GRAPH_HAS_CYCLES', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 3);
      addEdgeToState(state, 'node:b', 'node:a', 'x', 4);
    });

    await expect(
      graph.traverse.topologicalSort('node:a', { dir: 'out', throwOnCycle: true })
    ).rejects.toThrow(expect.objectContaining({ code: 'ERR_GRAPH_HAS_CYCLES' }));
  });

  it('topologicalSort non-existent start throws NODE_NOT_FOUND', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
    });

    await expect(
      graph.traverse.topologicalSort('node:ghost', { dir: 'out' })
    ).rejects.toThrow(expect.objectContaining({ code: 'NODE_NOT_FOUND' }));
  });

  it('commonAncestors non-existent node throws NODE_NOT_FOUND', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
    });

    await expect(
      graph.traverse.commonAncestors(['node:a', 'node:ghost'])
    ).rejects.toThrow(expect.objectContaining({ code: 'NODE_NOT_FOUND' }));
  });

  it('commonAncestors with empty array returns empty ancestors', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
    });

    const result = await graph.traverse.commonAncestors([]);
    expect(result).toEqual({ ancestors: [] });
  });

  it('bidirectionalAStar throws NO_PATH when unreachable', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
    });

    await expect(
      graph.traverse.bidirectionalAStar('node:a', 'node:b')
    ).rejects.toThrow(expect.objectContaining({ code: 'NO_PATH' }));
  });

  it('weightedLongestPath throws ERR_GRAPH_HAS_CYCLES on cyclic graph', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addEdgeToState(state, 'node:a', 'node:b', 'x', 3);
      addEdgeToState(state, 'node:b', 'node:a', 'x', 4);
    });

    await expect(
      graph.traverse.weightedLongestPath('node:a', 'node:b', { dir: 'out' })
    ).rejects.toThrow(expect.objectContaining({ code: 'ERR_GRAPH_HAS_CYCLES' }));
  });
});
