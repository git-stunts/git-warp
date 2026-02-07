import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodePropKey } from '../../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';

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

describe('ObserverView', () => {
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

    it('empty match pattern shows no nodes', async () => {
      setupGraphState(graph, (state) => {
        addNode(state, 'user:alice', 1);
        addNode(state, 'user:bob', 2);
      });

      const view = await graph.observer('emptyView', { match: 'nonexistent:*' });
      const nodes = await view.getNodes();

      expect(nodes).toEqual([]);
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
      expect(props.get('name')).toBe('Alice');
      expect(props.get('email')).toBe('alice@example.com');
      expect(props.has('ssn')).toBe(false);
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
      expect(props.get('name')).toBe('Alice');
      expect(props.get('email')).toBe('alice@example.com');
      expect(props.has('ssn')).toBe(false);
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
      expect(props.get('name')).toBe('Alice');
      expect(props.get('email')).toBe('alice@example.com');
      expect(props.has('ssn')).toBe(false);
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

      expect(props.get('name')).toBe('Alice');
      expect(props.get('ssn')).toBe('123-45-6789');
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

      expect(result.nodes.map((n) => n.id)).toEqual(['user:alice', 'user:bob']);
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
      expect(result.nodes.map((n) => n.id)).toEqual(['user:alice']);
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
      expect(result.nodes.map((n) => n.id)).toEqual(['user:bob']);
    });
  });

  describe('traverse through observer', () => {
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

  describe('observer name', () => {
    it('exposes the observer name', async () => {
      setupGraphState(graph, () => {});

      const view = await graph.observer('myObserver', { match: '*' });
      expect(view.name).toBe('myObserver');
    });
  });
});
