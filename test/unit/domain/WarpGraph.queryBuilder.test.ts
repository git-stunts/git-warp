import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { encodePropKey } from '../../../src/domain/services/JoinReducer.ts';
import QueryError from '../../../src/domain/errors/QueryError.ts';
import { addNodeToState, addEdgeToState, setupGraphState } from '../../helpers/warpGraphTestUtils.ts';

function addProp(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ key, /** @type {any} */ value) {
  const propKey = encodePropKey(nodeId, key);
  state.prop.set(propKey, { value, lamport: 1, writerId: 'w1' });
}

describe('WarpCore QueryBuilder', () => {
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

    graph = await openRuntimeHostProduct({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  it('throws E_QUERY_MATCH_TYPE for non-string/non-array match', () => {
    expect(() => graph.query().match(123)).toThrow(QueryError);
    try {
      graph.query().match(123);
    } catch (/** @type {any} */ err) {
      expect((err as any).code).toBe('E_QUERY_MATCH_TYPE');
    }
  });

  it('supports multiple glob match patterns', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'campaign:1', 1);
      addNodeToState(state, 'milestone:A', 2);
      addNodeToState(state, 'user:alice', 3);
    });

    const result = await graph.query().match(['campaign:*', 'milestone:*']).run();
    expect(result.nodes).toEqual([
      { id: 'campaign:1' },
      { id: 'milestone:A' },
    ]);
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

  it('rejects object shorthand with non-primitive values', () => {
    expect(() => graph.query().where({ role: { name: 'admin' } })).toThrow(QueryError);
    try {
      graph.query().where({ role: { name: 'admin' } });
    } catch (/** @type {any} */ err) {
      expect((err as any).code).toBe('E_QUERY_WHERE_VALUE_TYPE');
    }
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

  it('where snapshots sort edges by label then peer id', async () => {
    let seenEdges;
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addNodeToState(state, 'user:dave', 4);
      addEdgeToState(state, 'user:alice', 'user:dave', 'follows', 5);
      addEdgeToState(state, 'user:alice', 'user:bob', 'blocks', 6);
      addEdgeToState(state, 'user:alice', 'user:carol', 'follows', 7);
    });

    await graph
      .query()
      .match('user:alice')
      .where((/** @type {any} */ snapshot) => {
        seenEdges = snapshot.edgesOut;
        return true;
      })
      .run();

    expect(seenEdges).toEqual([
      { label: 'blocks', to: 'user:bob' },
      { label: 'follows', to: 'user:carol' },
      { label: 'follows', to: 'user:dave' },
    ]);
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
      expect((err as any).code).toBe('E_QUERY_SELECT_FIELD');
    }
  });

  it('select(undefined) resets selection to the default fields', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addProp(state, 'user:alice', 'role', 'admin');
    });

    const result = await graph.query().match('user:alice').select(['id']).select(undefined).run();
    expect(result.nodes).toEqual([{ id: 'user:alice', props: { role: 'admin' } }]);
  });

  it('select rejects non-array input', () => {
    expect(() => graph.query().select(('id' as any))).toThrow(QueryError);
    try {
      graph.query().select(('id' as any));
    } catch (/** @type {any} */ err) {
      expect((err as any).code).toBe('E_QUERY_SELECT_TYPE');
    }
  });

  it('outgoing rejects invalid labels and depth values', () => {
    expect(() => graph.query().outgoing((123 as any))).toThrow(QueryError);
    expect(() => graph.query().outgoing(undefined, { depth: (-1 as any) })).toThrow(QueryError);
    expect(() => graph.query().outgoing(undefined, { depth: ([2, 1] as any) })).toThrow(QueryError);
  });

  it('incoming rejects invalid labels and depth tuples', () => {
    expect(() => graph.query().incoming((123 as any))).toThrow(QueryError);
    expect(() => graph.query().incoming(undefined, { depth: (['a', 1] as any) })).toThrow(QueryError);
  });

  it('single-hop traversal skips non-matching labels', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'project:alpha', 3);
      addEdgeToState(state, 'user:alice', 'user:bob', 'manages', 4);
      addEdgeToState(state, 'user:alice', 'project:alpha', 'owns', 5);
    });

    const result = await graph.query().match('user:alice').outgoing('manages').select(['id']).run();
    expect(result.nodes).toEqual([{ id: 'user:bob' }]);
  });

  it('multi-hop traversal supports depth ranges, label filters, and visited-set dedupe', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addNodeToState(state, 'project:alpha', 4);
      addEdgeToState(state, 'user:alice', 'user:bob', 'manages', 5);
      addEdgeToState(state, 'user:alice', 'project:alpha', 'owns', 6);
      addEdgeToState(state, 'user:bob', 'user:alice', 'manages', 7);
      addEdgeToState(state, 'user:bob', 'user:carol', 'manages', 8);
    });

    const result = await graph
      .query()
      .match('user:alice')
      .outgoing('manages', { depth: [0, 2] })
      .select(['id'])
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice' },
      { id: 'user:bob' },
      { id: 'user:carol' },
    ]);
  });

  it('clones nested props with structuredClone when available', async () => {
    const meta = { tags: ['a', 'b'], nested: { level: 2 } };
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addProp(state, 'user:alice', 'meta', meta);
    });

    const result = await graph.query().match('user:alice').select(['props']).run();
    expect(result.nodes[0].props.meta).toEqual(meta);
    expect(result.nodes[0].props.meta).not.toBe(meta);
    expect(Object.isFrozen(result.nodes[0].props.meta)).toBe(true);
  });

  it('freezes nested props when structuredClone is unavailable', async () => {
    const originalStructuredClone = globalThis.structuredClone;
    const meta = { nested: { score: 7 } };
    globalThis.structuredClone = () => {
      throw new Error('force structuredClone failure');
    };

    try {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNodeToState(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'meta', meta);
      });

      const result = await graph.query().match('user:alice').select(['props']).run();
      expect(result.nodes[0].props.meta).toEqual(meta);
      expect(result.nodes[0].props.meta).not.toBe(meta);
    } finally {
      globalThis.structuredClone = originalStructuredClone;
    }
  });

  it('returns frozen snapshot props without JSON clone fallback', async () => {
    const originalStructuredClone = globalThis.structuredClone;
    const meta = {
      value: 7,
    };
    const originalPropertyReader = graph._propertyReader;
    const originalLogicalIndex = graph._logicalIndex;
    globalThis.structuredClone = () => {
      throw new Error('force fallback');
    };

    try {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNodeToState(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'meta', meta);
      });
      graph._propertyReader = null;
      graph._logicalIndex = null;

      const result = await graph.query().match('user:alice').select(['props']).run();
      expect(result.nodes[0].props.meta).toEqual(meta);
      expect(Object.isFrozen(result.nodes[0].props.meta)).toBe(true);
    } finally {
      globalThis.structuredClone = originalStructuredClone;
      graph._propertyReader = originalPropertyReader;
      graph._logicalIndex = originalLogicalIndex;
    }
  });

  it('aggregate validates spec types', () => {
    expect(() => graph.query().aggregate({ sum: (123 as any) })).toThrow(QueryError);
    expect(() => graph.query().aggregate({ count: ('yes' as any) })).toThrow(QueryError);
  });

  it('aggregate computes numeric summaries and ignores non-numeric nested misses', async () => {
    setupGraphState(graph, (/** @type {any} */ state) => {
      addNodeToState(state, 'user:alice', 1);
      addNodeToState(state, 'user:bob', 2);
      addNodeToState(state, 'user:carol', 3);
      addProp(state, 'user:alice', 'stats', { score: 10 });
      addProp(state, 'user:bob', 'stats', 'oops');
      addProp(state, 'user:carol', 'stats', { score: 20 });
    });

    const result = await graph
      .query()
      .match('user:*')
      .aggregate({
        count: true,
        sum: 'props.stats.score',
        avg: 'stats.score',
        min: 'stats.score',
        max: 'stats.score',
      })
      .run();

    expect(result).toEqual({
      stateHash: expect.any(String),
      count: 3,
      sum: 30,
      avg: 15,
      min: 10,
      max: 20,
    });
  });
});
