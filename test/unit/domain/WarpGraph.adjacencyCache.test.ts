import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.ts';
import { createEmptyState, encodeEdgeKey } from '../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

const crypto = new NodeCryptoAdapter();

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  state.nodeAlive.add(nodeId, Dot.create('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  state.edgeAlive.add(edgeKey, Dot.create('w1', counter));
}

function createSeededState() {
  const state = createEmptyState();
  addNode(state, 'node:a', 1);
  addNode(state, 'node:b', 2);
  addEdge(state, 'node:a', 'node:b', 'knows', 3);
  return state;
}

describe('WarpRuntime adjacency cache', () => {
    let mockPersistence;
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

  it('reuses adjacency for identical state hashes (materializedGraph not rebuilt)', async () => {
    // _materializeGraph() short-circuits on the second call when _stateDirty is false
    // and _materializedGraph is already set. The adjacency is stored inside
    // _materializedGraph rather than in the old _adjacencyCache LRU.
    graph.materialize = vi.fn().mockImplementation(async () => createSeededState());
    const buildSpy = vi.spyOn(graph, '_buildAdjacency');

    await graph._materializeGraph();
    await graph._materializeGraph();

    // _buildAdjacency is called once; the second call reuses _materializedGraph.
    expect(buildSpy).toHaveBeenCalledTimes(1);
    // _materializedGraph is populated (not null) after the first call.
    expect((graph)._materializedGraph).not.toBeNull();
  });

  it('rebuilds adjacency each time _stateDirty is set (no LRU eviction path)', async () => {
    // _materializeGraph() triggers _buildAdjacency whenever _stateDirty=true forces a
    // fresh materialize. The old _adjacencyCache LRU is initialised but not actively
    // used; state is stored in _materializedGraph instead.
    graph = await WarpRuntime.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
      adjacencyCacheSize: 1,
      crypto,
    });

    const stateOne = createSeededState();
    const stateTwo = createEmptyState();
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
    graph._materializedGraph = null;
    await graph._materializeGraph();
    graph._stateDirty = true;
    graph._materializedGraph = null;
    await graph._materializeGraph();

    // _buildAdjacency is called once per unique state transition.
    expect(buildSpy).toHaveBeenCalledTimes(3);
    // _materializedGraph holds the most recent state.
    expect((graph)._materializedGraph).not.toBeNull();
  });
});
