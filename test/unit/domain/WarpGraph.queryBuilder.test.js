import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import QueryError from '../../../src/domain/errors/QueryError.js';

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

function addProp(state, nodeId, key, value) {
  const propKey = encodePropKey(nodeId, key);
  state.prop.set(propKey, { value, lamport: 1, writerId: 'w1' });
}

describe('WarpGraph QueryBuilder', () => {
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

  it('throws E_QUERY_MATCH_TYPE for non-string match', () => {
    expect(() => graph.query().match(['user:*'])).toThrow(QueryError);
    try {
      graph.query().match(['user:*']);
    } catch (err) {
      expect(err.code).toBe('E_QUERY_MATCH_TYPE');
    }
  });

  it('supports two-hop traversal with ordered results', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdge(state, 'user:bob', 'user:carol', 'follows', 5);
    });

    const result = await graph
      .query()
      .match('user:alice')
      .outgoing()
      .outgoing()
      .run();

    expect(result.nodes).toEqual([{ id: 'user:carol' }]);
  });

  it('supports glob match patterns', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'team:eng', 3);
    });

    const result = await graph.query().match('user:*').run();
    expect(result.nodes).toEqual([
      { id: 'user:alice' },
      { id: 'user:bob' },
    ]);
  });

  it('match(*) returns all nodes in canonical order', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'team:eng', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:alice', 3);
    });

    const result = await graph.query().match('*').run();
    expect(result.nodes).toEqual([
      { id: 'team:eng' },
      { id: 'user:alice' },
      { id: 'user:bob' },
    ]);
  });

  it('produces deterministic JSON across runs', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdge(state, 'user:alice', 'user:carol', 'follows', 5);
    });

    const resultA = await graph.query().match('user:*').outgoing('follows').run();
    const resultB = await graph.query().match('user:*').outgoing('follows').run();

    expect(JSON.stringify(resultA)).toBe(JSON.stringify(resultB));
  });

  it('chaining order matters', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdge(state, 'user:carol', 'user:bob', 'follows', 5);
    });

    const outgoingThenIncoming = await graph
      .query()
      .match('user:alice')
      .outgoing()
      .incoming()
      .run();

    const incomingThenOutgoing = await graph
      .query()
      .match('user:alice')
      .incoming()
      .outgoing()
      .run();

    expect(outgoingThenIncoming.nodes).toEqual([
      { id: 'user:alice' },
      { id: 'user:carol' },
    ]);
    expect(incomingThenOutgoing.nodes).toEqual([]);
  });

  it('where snapshots are read-only and mutation does not affect traversal', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
      addProp(state, 'user:alice', 'role', 'admin');
    });

    const result = await graph
      .query()
      .match('user:alice')
      .where(({ edgesOut, props }) => {
        try {
          edgesOut.push({ label: 'follows', to: 'user:carol' });
        } catch {
          // Ignore mutation errors
        }
        try {
          props.role = 'hacked';
        } catch {
          // Ignore mutation errors
        }
        return true;
      })
      .outgoing()
      .run();

    expect(result.nodes).toEqual([{ id: 'user:bob' }]);
  });

  it('selects fields and enforces allowed fields', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addProp(state, 'user:alice', 'role', 'admin');
    });

    const idOnly = await graph.query().match('user:alice').select(['id']).run();
    expect(idOnly.nodes).toEqual([{ id: 'user:alice' }]);

    const propsOnly = await graph.query().match('user:alice').select(['props']).run();
    expect(propsOnly.nodes).toEqual([{ props: { role: 'admin' } }]);

    const defaultSelect = await graph.query().match('user:alice').select([]).run();
    expect(defaultSelect.nodes).toEqual([{ id: 'user:alice', props: { role: 'admin' } }]);

    try {
      await graph.query().match('user:alice').select(['id', 'bogus']).run();
    } catch (err) {
      expect(err).toBeInstanceOf(QueryError);
      expect(err.code).toBe('E_QUERY_SELECT_FIELD');
    }
  });
});
