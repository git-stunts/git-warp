import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { addNodeToState, addEdgeToState, setupGraphState } from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph logical traversal', () => {
  let mockPersistence;
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(),
    };

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  it('bfs visits neighbors in canonical order', async () => {
    setupGraphState(graph, (state) => {
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
    setupGraphState(graph, (state) => {
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
    setupGraphState(graph, (state) => {
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
    setupGraphState(graph, (state) => {
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
    setupGraphState(graph, (state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addEdgeToState(state, 'node:a', 'node:b', 'follows', 3);
    });

    const result = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: [] });
    expect(result).toEqual(['node:a']);
  });

  it('connectedComponent uses both directions', async () => {
    setupGraphState(graph, (state) => {
      addNodeToState(state, 'node:a', 1);
      addNodeToState(state, 'node:b', 2);
      addNodeToState(state, 'node:c', 3);
      addEdgeToState(state, 'node:b', 'node:a', 'follows', 4);
      addEdgeToState(state, 'node:c', 'node:b', 'follows', 5);
    });

    const result = await graph.traverse.connectedComponent('node:a');
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });
});
