import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.js';
import { createEmptyStateV5, encodeEdgeKey } from '../../../src/domain/services/JoinReducer.js';
import ORSet from '../../../src/domain/crdt/ORSet.ts';
import { createDot } from '../../../src/domain/crdt/Dot.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  state.nodeAlive.add(nodeId, createDot('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  state.edgeAlive.add(edgeKey, createDot('w1', counter));
}

function createSeededState() {
  const state = createEmptyStateV5();
  addNode(state, 'node:a', 1);
  addNode(state, 'node:b', 2);
  addEdge(state, 'node:a', 'node:b', 'knows', 3);
  return state;
}

describe('WarpRuntime adjacency cache', () => {
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
      readBlob: vi.fn(),
      writeBlob: vi.fn(),
      getNodeInfo: vi.fn(),
      readTreeOids: vi.fn(),
      writeTree: vi.fn(),
    };

    graph = await WarpRuntime.open({
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
    graph = await WarpRuntime.open({
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
    graph._stateDirty = true;
    await graph._materializeGraph();
    graph._stateDirty = true;
    await graph._materializeGraph();

    expect(buildSpy).toHaveBeenCalledTimes(3);
    expect(/** @type {any} */ (graph)._adjacencyCache.size).toBe(1);
  });
});
