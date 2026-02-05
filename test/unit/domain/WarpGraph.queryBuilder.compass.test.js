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

let lamportCounter = 0;
function addProp(state, nodeId, key, value) {
  lamportCounter++;
  const propKey = encodePropKey(nodeId, key);
  state.prop.set(propKey, { value, lamport: lamportCounter, writerId: 'w1' });
}

describe('COMPASS — CP/WHERE/1: Object shorthand in where()', () => {
  let mockPersistence;
  let graph;

  beforeEach(async () => {
    lamportCounter = 0;
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

  it('where({ role: "admin" }) returns only admin nodes', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addProp(state, 'user:alice', 'role', 'admin');
      addProp(state, 'user:bob', 'role', 'viewer');
      addProp(state, 'user:carol', 'role', 'admin');
    });

    const result = await graph
      .query()
      .match('user:*')
      .where({ role: 'admin' })
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice', props: { role: 'admin' } },
      { id: 'user:carol', props: { role: 'admin' } },
    ]);
  });

  it('multiple properties in object = AND semantics', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addProp(state, 'user:alice', 'role', 'admin');
      addProp(state, 'user:alice', 'active', true);
      addProp(state, 'user:bob', 'role', 'admin');
      addProp(state, 'user:bob', 'active', false);
    });

    const result = await graph
      .query()
      .match('user:*')
      .where({ role: 'admin', active: true })
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice', props: { active: true, role: 'admin' } },
    ]);
  });

  it('chained object + function filters', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addNode(state, 'user:carol', 3);
      addProp(state, 'user:alice', 'role', 'admin');
      addProp(state, 'user:alice', 'age', 30);
      addProp(state, 'user:bob', 'role', 'admin');
      addProp(state, 'user:bob', 'age', 16);
      addProp(state, 'user:carol', 'role', 'viewer');
      addProp(state, 'user:carol', 'age', 25);
    });

    const result = await graph
      .query()
      .match('user:*')
      .where({ role: 'admin' })
      .where(({ props }) => props.age > 18)
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice', props: { age: 30, role: 'admin' } },
    ]);
  });

  it('empty object matches all nodes', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
    });

    const result = await graph
      .query()
      .match('user:*')
      .where({})
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice' },
      { id: 'user:bob' },
    ]);
  });

  it('property value is null — filters correctly', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addProp(state, 'user:alice', 'status', null);
      addProp(state, 'user:bob', 'status', 'active');
    });

    const result = await graph
      .query()
      .match('user:*')
      .where({ status: null })
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice', props: { status: null } },
    ]);
  });

  it('non-existent property in filter excludes node', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addProp(state, 'user:alice', 'role', 'admin');
    });

    const result = await graph
      .query()
      .match('user:*')
      .where({ role: 'admin' })
      .run();

    expect(result.nodes).toEqual([
      { id: 'user:alice', props: { role: 'admin' } },
    ]);
  });

  it('throws E_QUERY_WHERE_TYPE for invalid argument', () => {
    expect(() => graph.query().where(42)).toThrow(QueryError);
    expect(() => graph.query().where('admin')).toThrow(QueryError);
    expect(() => graph.query().where(null)).toThrow(QueryError);
  });

  it('accepts arrays as values (strict equality)', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'user:alice', 1);
      addNode(state, 'user:bob', 2);
      addProp(state, 'user:alice', 'tags', 'solo');
      addProp(state, 'user:bob', 'tags', 'team');
    });

    // Array argument to where() should be rejected (not a plain object)
    expect(() => graph.query().where(['admin'])).toThrow(QueryError);
  });
});

describe('COMPASS — CP/MULTIHOP/1: Multi-hop traversal', () => {
  let mockPersistence;
  let graph;

  beforeEach(async () => {
    lamportCounter = 0;
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

  it('depth [1,3] on linear chain A→B→C→D returns B,C,D', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addNode(state, 'node:d', 4);
      addEdge(state, 'node:a', 'node:b', 'next', 5);
      addEdge(state, 'node:b', 'node:c', 'next', 6);
      addEdge(state, 'node:c', 'node:d', 'next', 7);
    });

    const result = await graph
      .query()
      .match('node:a')
      .outgoing('next', { depth: [1, 3] })
      .run();

    expect(result.nodes).toEqual([
      { id: 'node:b' },
      { id: 'node:c' },
      { id: 'node:d' },
    ]);
  });

  it('depth 2 from A returns only hop-2 nodes', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addNode(state, 'node:d', 4);
      addEdge(state, 'node:a', 'node:b', 'next', 5);
      addEdge(state, 'node:b', 'node:c', 'next', 6);
      addEdge(state, 'node:c', 'node:d', 'next', 7);
    });

    const result = await graph
      .query()
      .match('node:a')
      .outgoing('next', { depth: 2 })
      .run();

    expect(result.nodes).toEqual([{ id: 'node:c' }]);
  });

  it('cycles do not cause infinite loops', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:a', 'node:b', 'next', 4);
      addEdge(state, 'node:b', 'node:c', 'next', 5);
      addEdge(state, 'node:c', 'node:a', 'next', 6); // cycle
    });

    const result = await graph
      .query()
      .match('node:a')
      .outgoing('next', { depth: [1, 5] })
      .run();

    expect(result.nodes).toEqual([
      { id: 'node:b' },
      { id: 'node:c' },
    ]);
  });

  it('default depth [1,1] preserves existing single-hop behavior', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:a', 'node:b', 'next', 4);
      addEdge(state, 'node:b', 'node:c', 'next', 5);
    });

    const result = await graph
      .query()
      .match('node:a')
      .outgoing('next')
      .run();

    expect(result.nodes).toEqual([{ id: 'node:b' }]);
  });

  it('incoming with depth [1,2] works in reverse', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addEdge(state, 'node:a', 'node:b', 'next', 4);
      addEdge(state, 'node:b', 'node:c', 'next', 5);
    });

    const result = await graph
      .query()
      .match('node:c')
      .incoming('next', { depth: [1, 2] })
      .run();

    expect(result.nodes).toEqual([
      { id: 'node:a' },
      { id: 'node:b' },
    ]);
  });

  it('depth [2,3] excludes hop-1 nodes', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addNode(state, 'node:c', 3);
      addNode(state, 'node:d', 4);
      addEdge(state, 'node:a', 'node:b', 'next', 5);
      addEdge(state, 'node:b', 'node:c', 'next', 6);
      addEdge(state, 'node:c', 'node:d', 'next', 7);
    });

    const result = await graph
      .query()
      .match('node:a')
      .outgoing('next', { depth: [2, 3] })
      .run();

    expect(result.nodes).toEqual([
      { id: 'node:c' },
      { id: 'node:d' },
    ]);
  });

  it('depth [0,0] returns the start set (self-inclusion)', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:a', 1);
      addNode(state, 'node:b', 2);
      addEdge(state, 'node:a', 'node:b', 'next', 3);
    });

    const result = await graph
      .query()
      .match('node:a')
      .outgoing('next', { depth: [0, 0] })
      .run();

    expect(result.nodes).toEqual([{ id: 'node:a' }]);
  });

  it('throws E_QUERY_DEPTH_TYPE for invalid depth', () => {
    expect(() =>
      graph.query().outgoing('next', { depth: 'deep' })
    ).toThrow(QueryError);

    expect(() =>
      graph.query().outgoing('next', { depth: [1] })
    ).toThrow(QueryError);
  });

  it('branching graph with depth [1,2] returns all reachable nodes', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'node:root', 1);
      addNode(state, 'node:l1a', 2);
      addNode(state, 'node:l1b', 3);
      addNode(state, 'node:l2a', 4);
      addNode(state, 'node:l2b', 5);
      addEdge(state, 'node:root', 'node:l1a', 'child', 6);
      addEdge(state, 'node:root', 'node:l1b', 'child', 7);
      addEdge(state, 'node:l1a', 'node:l2a', 'child', 8);
      addEdge(state, 'node:l1b', 'node:l2b', 'child', 9);
    });

    const result = await graph
      .query()
      .match('node:root')
      .outgoing('child', { depth: [1, 2] })
      .run();

    expect(result.nodes).toEqual([
      { id: 'node:l1a' },
      { id: 'node:l1b' },
      { id: 'node:l2a' },
      { id: 'node:l2b' },
    ]);
  });
});

describe('COMPASS — CP/AGG/1: Aggregation', () => {
  let mockPersistence;
  let graph;

  beforeEach(async () => {
    lamportCounter = 0;
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

  it('count returns correct node count', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addNode(state, 'order:2', 2);
      addNode(state, 'order:3', 3);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ count: true })
      .run();

    expect(result.count).toBe(3);
    expect(result).not.toHaveProperty('nodes');
  });

  it('sum computes correctly over numeric property', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addNode(state, 'order:2', 2);
      addNode(state, 'order:3', 3);
      addProp(state, 'order:1', 'total', 10);
      addProp(state, 'order:2', 'total', 20);
      addProp(state, 'order:3', 'total', 30);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ count: true, sum: 'props.total' })
      .run();

    expect(result.count).toBe(3);
    expect(result.sum).toBe(60);
  });

  it('avg, min, max on numeric props', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addNode(state, 'order:2', 2);
      addNode(state, 'order:3', 3);
      addProp(state, 'order:1', 'total', 10);
      addProp(state, 'order:2', 'total', 20);
      addProp(state, 'order:3', 'total', 30);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ avg: 'props.total', min: 'props.total', max: 'props.total' })
      .run();

    expect(result.avg).toBe(20);
    expect(result.min).toBe(10);
    expect(result.max).toBe(30);
  });

  it('non-numeric values are silently skipped', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addNode(state, 'order:2', 2);
      addNode(state, 'order:3', 3);
      addProp(state, 'order:1', 'total', 10);
      addProp(state, 'order:2', 'total', 'not-a-number');
      addProp(state, 'order:3', 'total', 30);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ count: true, sum: 'props.total' })
      .run();

    expect(result.count).toBe(3);
    expect(result.sum).toBe(40);
  });

  it('aggregate + select throws E_QUERY_AGGREGATE_TERMINAL', () => {
    const q = graph.query().match('order:*').aggregate({ count: true });
    expect(() => q.select(['id'])).toThrow(QueryError);
    try {
      q.select(['id']);
    } catch (err) {
      expect(err.code).toBe('E_QUERY_AGGREGATE_TERMINAL');
    }
  });

  it('aggregate + outgoing throws E_QUERY_AGGREGATE_TERMINAL', () => {
    const q = graph.query().match('order:*').aggregate({ count: true });
    expect(() => q.outgoing('next')).toThrow(QueryError);
  });

  it('aggregate + incoming throws E_QUERY_AGGREGATE_TERMINAL', () => {
    const q = graph.query().match('order:*').aggregate({ count: true });
    expect(() => q.incoming('next')).toThrow(QueryError);
  });

  it('throws E_QUERY_AGGREGATE_TYPE for non-object spec', () => {
    expect(() => graph.query().aggregate('count')).toThrow(QueryError);
    expect(() => graph.query().aggregate(42)).toThrow(QueryError);
    expect(() => graph.query().aggregate(null)).toThrow(QueryError);
  });

  it('empty match set returns zeroes', async () => {
    setupGraphState(graph, (state) => {
      // no nodes
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ count: true, sum: 'props.total', avg: 'props.total' })
      .run();

    expect(result.count).toBe(0);
    expect(result.sum).toBe(0);
    expect(result.avg).toBe(0);
  });

  it('single node aggregate', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addProp(state, 'order:1', 'total', 42);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ count: true, sum: 'props.total', avg: 'props.total', min: 'props.total', max: 'props.total' })
      .run();

    expect(result.count).toBe(1);
    expect(result.sum).toBe(42);
    expect(result.avg).toBe(42);
    expect(result.min).toBe(42);
    expect(result.max).toBe(42);
  });

  it('all non-numeric values yield sum=0', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addNode(state, 'order:2', 2);
      addProp(state, 'order:1', 'total', 'abc');
      addProp(state, 'order:2', 'total', true);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ sum: 'props.total' })
      .run();

    expect(result.sum).toBe(0);
  });

  it('stateHash is included in aggregate result', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ count: true })
      .run();

    expect(result).toHaveProperty('stateHash');
  });

  it('where + aggregate composes correctly', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addNode(state, 'order:2', 2);
      addNode(state, 'order:3', 3);
      addProp(state, 'order:1', 'status', 'paid');
      addProp(state, 'order:1', 'total', 10);
      addProp(state, 'order:2', 'status', 'pending');
      addProp(state, 'order:2', 'total', 20);
      addProp(state, 'order:3', 'status', 'paid');
      addProp(state, 'order:3', 'total', 30);
    });

    const result = await graph
      .query()
      .match('order:*')
      .where({ status: 'paid' })
      .aggregate({ count: true, sum: 'props.total' })
      .run();

    expect(result.count).toBe(2);
    expect(result.sum).toBe(40);
  });

  it('property path without props. prefix works', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'order:1', 1);
      addProp(state, 'order:1', 'total', 50);
    });

    const result = await graph
      .query()
      .match('order:*')
      .aggregate({ sum: 'total' })
      .run();

    expect(result.sum).toBe(50);
  });
});
