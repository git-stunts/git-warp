import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';
import Observer from '../../../../src/domain/services/query/Observer.ts';
import { createEmptyState, encodeEdgeKey, encodePropKey } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
  QueryReadModelProvider,
} from '../../../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../../../src/domain/services/query/QueryPlan.ts';

const EMPTY_QUERY_PROPS: QueryPropertyBag = Object.freeze({});

type TraversalFixtureEdge = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

function nodeSnapshot(id: string): QueryNodeSnapshot {
  return Object.freeze({
    id,
    props: EMPTY_QUERY_PROPS,
    edgesOut: Object.freeze([]),
    edgesIn: Object.freeze([]),
  });
}

class ObserverTraversalReadModel implements QueryReadModel {
  readonly stateHash = 'observer-traversal-read-model';
  readonly #nodes = new Set(['user:alice', 'user:bob', 'user:carol', 'team:eng']);
  readonly #edges: readonly TraversalFixtureEdge[] = Object.freeze([
    Object.freeze({ from: 'user:alice', to: 'user:bob', label: 'follows' }),
    Object.freeze({ from: 'user:bob', to: 'user:carol', label: 'follows' }),
    Object.freeze({ from: 'user:alice', to: 'team:eng', label: 'belongs-to' }),
  ]);

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    void request;
    for (const nodeId of this.#nodes) {
      yield nodeSnapshot(nodeId);
    }
  }

  async *neighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    for (const edge of this.#edges) {
      const neighbor = this.#neighborFor(edge, nodeId, options.direction);
      if (neighbor !== null && this.#labelMatches(edge.label, options.label)) {
        yield Object.freeze({ nodeId: neighbor, label: edge.label });
      }
    }
  }

  nodeProps(nodeId: string): Promise<QueryPropertyBag | null> {
    return Promise.resolve(this.#nodes.has(nodeId) ? EMPTY_QUERY_PROPS : null);
  }

  #neighborFor(
    edge: TraversalFixtureEdge,
    nodeId: string,
    direction: 'outgoing' | 'incoming',
  ): string | null {
    if (direction === 'outgoing') {
      return edge.from === nodeId ? edge.to : null;
    }
    return edge.to === nodeId ? edge.from : null;
  }

  #labelMatches(label: string, filter: string | undefined): boolean {
    return filter === undefined || label === filter;
  }
}

class ObserverTraversalReadModelProvider implements QueryReadModelProvider {
  opened = 0;

  openQueryReadModel(): Promise<QueryReadModel> {
    this.opened += 1;
    return Promise.resolve(new ObserverTraversalReadModel());
  }
}

/** @param {any} graph @param {(state: any) => void} seedFn */
function setupGraphState(graph, seedFn) {
  const state = createEmptyState();
  graph._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

/** @param {any} state @param {any} nodeId @param {any} counter */
function addNode(state, nodeId, counter) {
  state.nodeAlive.add(nodeId, Dot.create('w1', counter));
}

/** @param {any} state @param {any} from @param {any} to @param {any} label @param {any} counter */
function addEdge(state, from, to, label, counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  state.edgeAlive.add(edgeKey, Dot.create('w1', counter));
}

/** @param {any} state @param {any} nodeId @param {any} key @param {any} value */
function addProp(state, nodeId, key, value) {
  const propKey = encodePropKey(nodeId, key);
  state.prop.set(propKey, { value, lamport: 1, writerId: 'w1' });
}

describe('Observer', () => {
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

  describe('node visibility via match pattern', () => {
    it('observer matching user:* shows only user nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'team:eng', 3);
        addNode(state, 'project:warp', 4);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const nodes = await view.getNodes();

      expect(nodes).toEqual(['user:alice', 'user:bob']);
    });

    it('observer matching * shows all nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'team:eng', 2);
      });

      const view = await graph.observer('allView', { match: '*' });
      const nodes = await view.getNodes();

      expect(nodes.sort()).toEqual(['team:eng', 'user:alice']);
    });

    it('observer matching array of patterns shows nodes matching any pattern', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'campaign:1', 1);
        addNode(state, 'milestone:A', 2);
        addNode(state, 'user:alice', 3);
        addNode(state, 'team:eng', 4);
      });

      const view = await graph.observer('multiView', { match: ['campaign:*', 'milestone:*'] });
      const nodes = await view.getNodes();

      expect(nodes.sort()).toEqual(['campaign:1', 'milestone:A']);
    });

    it('empty match pattern shows no nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
      });

      const view = await graph.observer('emptyView', { match: 'nonexistent:*' });
      const nodes = await view.getNodes();

      expect(nodes).toEqual([]);
    });

    it('rejects empty array as match pattern', async () => {
      await expect(graph.observer('bad', { match: [] }))
        .rejects.toThrow('non-empty');
    });

    it('observer on empty graph returns no nodes', async () => {
      setupGraphState(graph, () => {});

      const view = await graph.observer('emptyGraph', { match: 'user:*' });
      const nodes = await view.getNodes();

      expect(nodes).toEqual([]);
    });
  });

  describe('hasNode', () => {
    it('returns true for matching visible node', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'team:eng', 2);
      });

      const view = await graph.observer('userView', { match: 'user:*' });

      expect(await view.hasNode('user:alice')).toBe(true);
    });

    it('returns false for non-matching node', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'team:eng', 2);
      });

      const view = await graph.observer('userView', { match: 'user:*' });

      expect(await view.hasNode('team:eng')).toBe(false);
    });

    it('returns false for non-existent node', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
      });

      const view = await graph.observer('userView', { match: 'user:*' });

      expect(await view.hasNode('user:unknown')).toBe(false);
    });
  });

  describe('property filtering', () => {
    it('redact removes specified properties', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:alice', 'ssn', '123-45-6789');
        addProp(state, 'user:alice', 'email', 'alice@example.com');
      });

      const view = await graph.observer('safeView', {
        match: 'user:*',
        redact: ['ssn'],
      });

      const props = await view.getNodeProps('user:alice');
      expect(props.name).toBe('Alice');
      expect(props.email).toBe('alice@example.com');
      expect('ssn' in props).toBe(false);
    });

    it('expose limits to specified properties', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:alice', 'ssn', '123-45-6789');
        addProp(state, 'user:alice', 'email', 'alice@example.com');
      });

      const view = await graph.observer('limitedView', {
        match: 'user:*',
        expose: ['name', 'email'],
      });

      const props = await view.getNodeProps('user:alice');
      expect(props.name).toBe('Alice');
      expect(props.email).toBe('alice@example.com');
      expect('ssn' in props).toBe(false);
    });

    it('redact takes precedence over expose', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:alice', 'ssn', '123-45-6789');
        addProp(state, 'user:alice', 'email', 'alice@example.com');
      });

      const view = await graph.observer('overlapView', {
        match: 'user:*',
        expose: ['name', 'ssn', 'email'],
        redact: ['ssn'],
      });

      const props = await view.getNodeProps('user:alice');
      expect(props.name).toBe('Alice');
      expect(props.email).toBe('alice@example.com');
      expect('ssn' in props).toBe(false);
    });

    it('returns null for non-matching node', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'team:eng', 1);
        addProp(state, 'team:eng', 'name', 'Engineering');
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const props = await view.getNodeProps('team:eng');

      expect(props).toBeNull();
    });

    it('returns all props when no expose/redact specified', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:alice', 'ssn', '123-45-6789');
      });

      const view = await graph.observer('openView', { match: 'user:*' });
      const props = await view.getNodeProps('user:alice');

      expect(props.name).toBe('Alice');
      expect(props.ssn).toBe('123-45-6789');
    });
  });

  describe('edge visibility', () => {
    it('edges visible when both endpoints match', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addEdge(state, 'user:alice', 'user:bob', 'follows', 3);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const edges = await view.getEdges();

      expect(edges).toEqual([
        { from: 'user:alice', to: 'user:bob', label: 'follows', props: {} },
      ]);
    });

    it('edges hidden when source does not match', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'team:eng', 1);
        addNode(state, 'user:alice', 2);
        addEdge(state, 'team:eng', 'user:alice', 'manages', 3);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const edges = await view.getEdges();

      expect(edges).toEqual([]);
    });

    it('edges hidden when target does not match', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'team:eng', 2);
        addEdge(state, 'user:alice', 'team:eng', 'belongs-to', 3);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const edges = await view.getEdges();

      expect(edges).toEqual([]);
    });
  });

  describe('query() through observer', () => {
    it('query returns only matching nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'team:eng', 3);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:bob', 'name', 'Bob');
        addProp(state, 'team:eng', 'name', 'Engineering');
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const result = await view.query().match('user:*').run();

      expect(result.nodes.map((/** @type {any} */ n) => n.id)).toEqual(['user:alice', 'user:bob']);
    });

    it('query with where filter works through observer', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'team:eng', 3);
        addProp(state, 'user:alice', 'role', 'admin');
        addProp(state, 'user:bob', 'role', 'user');
        addProp(state, 'team:eng', 'role', 'admin');
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const result = await view.query().match('*').where({ role: 'admin' }).run();

      // Only user:alice should show, not team:eng (filtered by observer)
      expect(result.nodes.map((/** @type {any} */ n) => n.id)).toEqual(['user:alice']);
    });

    it('query respects property redaction in results', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addProp(state, 'user:alice', 'name', 'Alice');
        addProp(state, 'user:alice', 'ssn', '123-45-6789');
      });

      const view = await graph.observer('safeView', {
        match: 'user:*',
        redact: ['ssn'],
      });
      const result = await view.query().match('user:alice').select(['id', 'props']).run();

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('user:alice');
      expect(result.nodes[0].props.name).toBe('Alice');
      expect(result.nodes[0].props).not.toHaveProperty('ssn');
    });

    it('query outgoing traversal respects observer filter', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'team:eng', 3);
        addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
        addEdge(state, 'user:alice', 'team:eng', 'belongs-to', 5);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const result = await view.query().match('user:alice').outgoing().run();

      // Should only see user:bob, not team:eng
      expect(result.nodes.map((/** @type {any} */ n) => n.id)).toEqual(['user:bob']);
    });
  });

  describe('traverse through observer', () => {
    it('reads traversal neighbors from a query read model without a graph materializer', async () => {
      const readModelProvider = new ObserverTraversalReadModelProvider();
      const view = new Observer({
        name: 'read-model-traversal',
        config: { match: 'user:*' },
        readModelProvider,
      });

      const visited = await view.traverse.bfs('user:alice', { dir: 'out' });

      expect(visited).toEqual(['user:alice', 'user:bob', 'user:carol']);
      expect(readModelProvider.opened).toBe(1);
    });

    it('BFS only visits matching nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'user:carol', 3);
        addNode(state, 'team:eng', 4);
        addEdge(state, 'user:alice', 'user:bob', 'follows', 5);
        addEdge(state, 'user:bob', 'user:carol', 'follows', 6);
        addEdge(state, 'user:alice', 'team:eng', 'belongs-to', 7);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const visited = await view.traverse.bfs('user:alice', { dir: 'out' });

      // Should visit user:alice -> user:bob -> user:carol but NOT team:eng
      expect(visited).toEqual(['user:alice', 'user:bob', 'user:carol']);
    });

    it('DFS only visits matching nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'team:eng', 3);
        addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
        addEdge(state, 'user:alice', 'team:eng', 'belongs-to', 5);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const visited = await view.traverse.dfs('user:alice', { dir: 'out' });

      expect(visited).toEqual(['user:alice', 'user:bob']);
    });

    it('shortestPath respects observer filter', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
        addNode(state, 'user:carol', 3);
        addEdge(state, 'user:alice', 'user:bob', 'follows', 4);
        addEdge(state, 'user:bob', 'user:carol', 'follows', 5);
      });

      const view = await graph.observer('userView', { match: 'user:*' });
      const result = await view.traverse.shortestPath('user:alice', 'user:carol', { dir: 'out' });

      expect(result).toEqual({
        found: true,
        path: ['user:alice', 'user:bob', 'user:carol'],
        length: 2,
      });
    });
  });

  describe('live-backed observer internals', () => {
    it('seek clones filter config and defaults to a live source', async () => {
      const graphStub = {
        observer: vi.fn().mockResolvedValue('next-observer'),
      };

      const view = new Observer({
        name: 'focused',
        config: {
          match: ['user:*'],
          expose: ['name'],
          redact: ['secret'],
        },
        graph: (graphStub as any),
        source: {
          kind: 'coordinate',
          frontier: { 'writer-1': 'abc123' },
          ceiling: 7,
        },
      });

      const result = await view.seek();

      expect(result).toBe('next-observer');
      expect(graphStub.observer).toHaveBeenCalledTimes(1);

      const [name, config, options] = (graphStub.observer.mock.calls[0] as any[]);
      expect(name).toBe('focused');
      expect(config).toEqual({
        match: ['user:*'],
        expose: ['name'],
        redact: ['secret'],
      });
      expect(options).toEqual({ source: { kind: 'live' } });
      expect(config.match).not.toBe((view as any)._matchPattern);
      expect(config.expose).not.toBe((view as any)._expose);
      expect(config.redact).not.toBe((view as any)._redact);
    });

    it('throws when a live backing graph is required but absent', () => {
      const state = createEmptyState();
      const view = new Observer({
        name: 'snapshot',
        config: { match: '*' },
        snapshot: { state, stateHash: 'hash-1' },
      });

      expect(() => (view as any)._requireGraph())
        .toThrow('Observer has no live backing graph');
    });

    it('delegates live-backed node and edge reads through the graph', async () => {
      const graphStub = {
        hasNode: vi.fn().mockResolvedValue(true),
        getNodes: vi.fn().mockResolvedValue(['team:eng', 'user:bob', 'user:alice']),
        getNodeProps: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ name: 'Alice', secret: 'hidden' }),
        getEdges: vi.fn().mockResolvedValue([
          { from: 'team:eng', to: 'user:alice', label: 'manages', props: { ignored: true } },
          { from: 'user:alice', to: 'user:bob', label: 'follows', props: { name: 'visible', secret: 'hidden' } },
        ]),
      };

      const view = new Observer({
        name: 'live',
        config: {
          match: 'user:*',
          expose: ['name'],
          redact: ['secret'],
        },
        graph: (graphStub as any),
      });

      expect(await view.hasNode('user:alice')).toBe(true);
      expect(graphStub.hasNode).toHaveBeenCalledWith('user:alice');

      expect(await view.getNodes()).toEqual(['user:bob', 'user:alice']);

      expect(await view.getNodeProps('user:missing')).toBeNull();
      expect(await view.getNodeProps('user:alice')).toEqual({ name: 'Alice' });

      expect(await view.getEdges()).toEqual([
        {
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
          props: { name: 'visible' },
        },
      ]);
    });
  });

  describe('observer name', () => {
    it('exposes the observer name', async () => {
      setupGraphState(graph, () => {});

      const view = await graph.observer('myObserver', { match: '*' });
      expect(view.name).toBe('myObserver');
    });

    it('exposes pinned source and snapshot hash metadata', () => {
      const state = createEmptyState();
      const view = new Observer({
        name: 'snapshotMeta',
        config: { match: '*' },
        snapshot: { state, stateHash: 'snapshot-hash' },
        source: {
          kind: 'coordinate',
          frontier: { 'writer-1': 'abc123' },
          ceiling: 4,
        },
      });

      expect(view.source).toEqual({
        kind: 'coordinate',
        frontier: new Map([['writer-1', 'abc123']]),
        ceiling: 4,
      });
      expect(view.stateHash).toBe('snapshot-hash');
    });

    it('defaults the observer name when created without an explicit label', async () => {
      setupGraphState(graph, () => {});

      const view = await graph.observer({ match: '*' });
      expect(view.name).toBe('observer');
    });

    it('preserves the default observer name across seek()', async () => {
      setupGraphState(graph, () => {});

      const view = await graph.observer({ match: '*' });
      const next = await view.seek();

      expect(next.name).toBe('observer');
    });
  });
});
