import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot('w1', counter));
}

function createSeededState() {
  const state = createEmptyStateV5();
  addNode(state, 'node:a', 1);
  addNode(state, 'node:b', 2);
  addEdge(state, 'node:a', 'node:b', 'knows', 3);
  return state;
}

describe('WarpGraph adjacency cache', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
    };

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
      crypto,
    });
  });

  it('reuses adjacency for identical state hashes', async () => {
    graph.materialize = vi.fn().mockImplementation(async () => createSeededState());
    const buildSpy = vi.spyOn(graph, '_buildAdjacency');

    await graph._materializeGraph();
    await graph._materializeGraph();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(/** @type {any} */ (graph)._adjacencyCache.size).toBe(1);
  });

  it('evicts adjacency entries when over cache cap', async () => {
    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
      adjacencyCacheSize: 1,
      crypto,
    });

    const stateOne = createSeededState();
    const stateTwo = createEmptyStateV5();
    addNode(stateTwo, 'node:x', 1);
    addNode(stateTwo, 'node:y', 2);
    addEdge(stateTwo, 'node:x', 'node:y', 'likes', 3);
    const stateThree = createSeededState();

    graph.materialize = vi.fn()
      .mockResolvedValueOnce(stateOne)
      .mockResolvedValueOnce(stateTwo)
      .mockResolvedValueOnce(stateThree);

    const buildSpy = vi.spyOn(graph, '_buildAdjacency');

    await graph._materializeGraph();
    await graph._materializeGraph();
    await graph._materializeGraph();

    expect(buildSpy).toHaveBeenCalledTimes(3);
    expect(/** @type {any} */ (graph)._adjacencyCache.size).toBe(1);
  });
});
