import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodeEdgePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';

function setupGraphState(/** @type {any} */ graph, /** @type {any} */ seedFn) {
  const state = createEmptyStateV5();
  /** @type {any} */ (graph)._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot('w1', counter));
  state.edgeBirthEvent.set(edgeKey, { lamport: 1, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 });
}

function addEdgeProp(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ key, /** @type {any} */ value) {
  const propKey = encodeEdgePropKey(from, to, label, key);
  state.prop.set(propKey, { eventId: { lamport: 1, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value });
}

describe('WarpGraph edge properties', () => {
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
    });
  });

  // ============================================================================
  // getEdges() with props
  // ============================================================================

  it('getEdges returns edge props in props field', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
    });

    const edges = await graph.getEdges();
    expect(edges).toEqual([
      { from: 'user:alice', to: 'user:bob', label: 'follows', props: { weight: 0.8 } },
    ]);
  });

  it('getEdges returns empty props for edge with no properties', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
    });

    const edges = await graph.getEdges();
    expect(edges).toEqual([
      { from: 'user:alice', to: 'user:bob', label: 'follows', props: {} },
    ]);
  });

  it('getEdges returns multiple props on a single edge', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'since', '2025-01-01');
    });

    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].props).toEqual({ weight: 0.8, since: '2025-01-01' });
  });

  it('getEdges assigns props to correct edges when multiple edges exist', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdge(state, 'user:alice', 'user:carol', 'manages', 5);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.9);
      addEdgeProp(state, 'user:alice', 'user:carol', 'manages', 'since', '2024-06-15');
    });

    const edges = await graph.getEdges();
    const followsEdge = edges.find((/** @type {any} */ e) => e.label === 'follows');
    const managesEdge = edges.find((/** @type {any} */ e) => e.label === 'manages');

    expect(followsEdge.props).toEqual({ weight: 0.9 });
    expect(managesEdge.props).toEqual({ since: '2024-06-15' });
  });

  // ============================================================================
  // getEdgeProps()
  // ============================================================================

  it('getEdgeProps returns correct props for an edge', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
    });

    const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
    expect(props).toEqual({ weight: 0.8 });
  });

  it('getEdgeProps returns empty object for edge with no props', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
    });

    const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
    expect(props).toEqual({});
  });

  it('getEdgeProps returns null for non-existent edge', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
    });

    const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
    expect(props).toBeNull();
  });

  it('getEdgeProps returns multiple properties', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'since', '2025-01-01');
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'mutual', true);
    });

    const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
    expect(props).toEqual({ weight: 0.8, since: '2025-01-01', mutual: true });
  });

  it('getEdgeProps does not leak props from other edges', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdge(state, 'user:alice', 'user:carol', 'follows', 5);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
      addEdgeProp(state, 'user:alice', 'user:carol', 'follows', 'weight', 0.5);
    });

    const propsAB = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
    const propsAC = await graph.getEdgeProps('user:alice', 'user:carol', 'follows');

    expect(propsAB).toEqual({ weight: 0.8 });
    expect(propsAC).toEqual({ weight: 0.5 });
  });

  it('getEdgeProps throws E_NO_STATE when no cached state', async () => {
    try {
      await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
      expect.unreachable('should have thrown');
    } catch (/** @type {any} */ err) {
      expect(err.code).toBe('E_NO_STATE');
    }
  });

  // ============================================================================
  // Edge props do not interfere with node props
  // ============================================================================

  it('edge props do not appear in getNodeProps results', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
      state.prop.set('user:alice\0name', { value: 'Alice', lamport: 1, writerId: 'w1' });
    });

    const nodeProps = await graph.getNodeProps('user:alice');
    expect(nodeProps.get('name')).toBe('Alice');
    expect(nodeProps.has('weight')).toBe(false);
    expect(nodeProps.size).toBe(1);
  });

  // ============================================================================
  // Query results with edge props via outgoing/incoming
  // ============================================================================

  it('query outgoing traversal works with edges that have props', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
    });

    const result = await graph.query().match('user:alice').outgoing('follows').run();
    expect(result.nodes).toEqual([{ id: 'user:bob' }]);
  });

  it('query incoming traversal works with edges that have props', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      addEdgeProp(state, 'user:alice', 'user:bob', 'follows', 'weight', 0.8);
    });

    const result = await graph.query().match('user:bob').incoming('follows').run();
    expect(result.nodes).toEqual([{ id: 'user:alice' }]);
  });
});
