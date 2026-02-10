import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodePropKey } from '../../../src/domain/services/JoinReducer.js';
import QueryError from '../../../src/domain/errors/QueryError.js';
import { addNodeToState, addEdgeToState, setupGraphState } from '../../helpers/warpGraphTestUtils.js';

function addProp(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ key, /** @type {any} */ value) {
  const propKey = encodePropKey(nodeId, key);
  state.prop.set(propKey, { value, lamport: 1, writerId: 'w1' });
}

describe('WarpGraph QueryBuilder', () => {
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

  it('throws E_QUERY_MATCH_TYPE for non-string match', () => {
    expect(() => graph.query().match(['user:*'])).toThrow(QueryError);
    try {
      graph.query().match(['user:*']);
    } catch (/** @type {any} */ err) {
      expect(err.code).toBe('E_QUERY_MATCH_TYPE');
    }
  });

  it('supports two-hop traversal with ordered results', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addEdgeToState(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdgeToState(state, 'user:bob', 'user:carol', 'follows', 5);
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
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'team:eng', 3);
    });

    const result = await graph.query().match('user:*').run();
    expect(result.nodes).toEqual([
      { id: 'user:alice' },
      { id: 'user:bob' },
    ]);
  });

  it('match(*) returns all nodes in canonical order', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'team:eng', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:alice', 3);
    });

    const result = await graph.query().match('*').run();
    expect(result.nodes).toEqual([
      { id: 'team:eng' },
      { id: 'user:alice' },
      { id: 'user:bob' },
    ]);
  });

  it('produces deterministic JSON across runs', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addEdgeToState(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdgeToState(state, 'user:alice', 'user:carol', 'follows', 5);
    });

    const resultA = await graph.query().match('user:*').outgoing('follows').run();
    const resultB = await graph.query().match('user:*').outgoing('follows').run();

    expect(JSON.stringify(resultA)).toBe(JSON.stringify(resultB));
  });

  it('chaining order matters', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addEdgeToState(state, 'user:alice', 'user:bob', 'follows', 4);
      addEdgeToState(state, 'user:carol', 'user:bob', 'follows', 5);
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
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addEdgeToState(state, 'user:alice', 'user:bob', 'follows', 4);
      addProp(state, 'user:alice', 'role', 'admin');
    });

    const result = await graph
      .query()
      .match('user:alice')
      .where((/** @type {any} */ { edgesOut, props }) => {
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
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
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
    } catch (/** @type {any} */ err) {
      expect(err).toBeInstanceOf(QueryError);
      expect(err.code).toBe('E_QUERY_SELECT_FIELD');
    }
  });
});
