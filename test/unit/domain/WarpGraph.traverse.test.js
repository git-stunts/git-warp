import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';

function setupGraphState(graph, seedFn) {
  const state = createEmptyStateV5();
  graph._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

function addNode(state, nodeId, counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot('w1', counter));
}

function addEdge(state, from, to, label, counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot('w1', counter));
}

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
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:a', 'node:c', 'z', 4);
      addEdge(state, 'node:a', 'node:b', 'a', 5);
    });

    const result = await graph.traverse.bfs('node:a', { dir: 'out', maxDepth: 1 });
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('dfs follows canonical neighbor order', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:a', 'node:c', 'z', 4);
      addEdge(state, 'node:a', 'node:b', 'a', 5);
    });

    const result = await graph.traverse.dfs('node:a', { dir: 'out', maxDepth: 1 });
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('shortestPath uses canonical tie-breaks', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addNode(state, 'node:d', 4);
      addEdge(state, 'node:a', 'node:b', 'x', 5);
      addEdge(state, 'node:a', 'node:c', 'x', 6);
      addEdge(state, 'node:b', 'node:d', 'x', 7);
      addEdge(state, 'node:c', 'node:d', 'x', 8);
    });

    const result = await graph.traverse.shortestPath('node:a', 'node:d', { dir: 'out' });
    expect(result).toEqual({ found: true, path: ['node:a', 'node:b', 'node:d'], length: 2 });
  });

  it('labelFilter supports string and array (OR semantics)', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:a', 'node:b', 'follows', 4);
      addEdge(state, 'node:a', 'node:c', 'blocks', 5);
    });

    const followsOnly = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: 'follows' });
    expect(followsOnly).toEqual(['node:a', 'node:b']);

    const orFilter = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: ['blocks', 'follows'] });
    expect(orFilter).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('labelFilter empty array returns only the start node', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addEdge(state, 'node:a', 'node:b', 'follows', 3);
    });

    const result = await graph.traverse.bfs('node:a', { dir: 'out', labelFilter: [] });
    expect(result).toEqual(['node:a']);
  });

  it('connectedComponent uses both directions', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:b', 'node:a', 'follows', 4);
      addEdge(state, 'node:c', 'node:b', 'follows', 5);
    });

    const result = await graph.traverse.connectedComponent('node:a');
    expect(result).toEqual(['node:a', 'node:b', 'node:c']);
  });
});
