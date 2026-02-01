/**
 * Tests for WarpGraph Query API (Task 7)
 *
 * Tests the query surface required by TECH-SPEC-V7.md:
 * - hasNode(nodeId)
 * - getNodeProps(nodeId)
 * - neighbors(nodeId, dir)
 * - getNodes()
 * - getEdges()
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';

describe('WarpGraph Query API', () => {
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

  describe('hasNode()', () => {
    it('throws if no cached state', () => {
      expect(() => graph.hasNode('node-1')).toThrow('No cached state');
    });

    it('returns true for existing nodes', async () => {
      // Materialize to get empty state
      await graph.materialize();

      // Manually add a node to cached state for testing
      const state = graph._cachedState;
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));

      expect(graph.hasNode('user:alice')).toBe(true);
    });

    it('returns false for non-existing nodes', async () => {
      await graph.materialize();
      expect(graph.hasNode('user:nonexistent')).toBe(false);
    });
  });

  describe('getNodeProps()', () => {
    it('throws if no cached state', () => {
      expect(() => graph.getNodeProps('node-1')).toThrow('No cached state');
    });

    it('returns null for non-existing nodes', async () => {
      await graph.materialize();
      expect(graph.getNodeProps('user:nonexistent')).toBe(null);
    });

    it('returns empty map for node with no props', async () => {
      await graph.materialize();
      const state = graph._cachedState;
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));

      const props = graph.getNodeProps('user:alice');
      expect(props).toBeInstanceOf(Map);
      expect(props.size).toBe(0);
    });

    it('returns props for node with properties', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add node
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));

      // Add properties using LWW registers directly
      const propKey1 = encodePropKey('user:alice', 'name');
      const propKey2 = encodePropKey('user:alice', 'age');

      // LWW registers store {value, lamport, writerId}
      state.prop.set(propKey1, { value: 'Alice', lamport: 1, writerId: 'w1' });
      state.prop.set(propKey2, { value: 30, lamport: 1, writerId: 'w1' });

      const props = graph.getNodeProps('user:alice');
      expect(props.get('name')).toBe('Alice');
      expect(props.get('age')).toBe(30);
    });
  });

  describe('neighbors()', () => {
    it('throws if no cached state', () => {
      expect(() => graph.neighbors('node-1')).toThrow('No cached state');
    });

    it('returns empty array for node with no edges', async () => {
      await graph.materialize();
      const state = graph._cachedState;
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));

      expect(graph.neighbors('user:alice')).toEqual([]);
    });

    it('returns outgoing neighbors', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add nodes
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'user:bob', createDot('w1', 2));

      // Add edge: alice --follows--> bob
      const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
      orsetAdd(state.edgeAlive, edgeKey, createDot('w1', 3));

      const outgoing = graph.neighbors('user:alice', 'outgoing');
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0]).toEqual({
        nodeId: 'user:bob',
        label: 'follows',
        direction: 'outgoing',
      });
    });

    it('returns incoming neighbors', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add nodes
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'user:bob', createDot('w1', 2));

      // Add edge: alice --follows--> bob
      const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
      orsetAdd(state.edgeAlive, edgeKey, createDot('w1', 3));

      const incoming = graph.neighbors('user:bob', 'incoming');
      expect(incoming).toHaveLength(1);
      expect(incoming[0]).toEqual({
        nodeId: 'user:alice',
        label: 'follows',
        direction: 'incoming',
      });
    });

    it('returns both directions by default', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add nodes
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'user:bob', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'user:carol', createDot('w1', 3));

      // alice --follows--> bob
      orsetAdd(state.edgeAlive, encodeEdgeKey('user:alice', 'user:bob', 'follows'), createDot('w1', 4));
      // carol --follows--> alice
      orsetAdd(state.edgeAlive, encodeEdgeKey('user:carol', 'user:alice', 'follows'), createDot('w1', 5));

      const neighbors = graph.neighbors('user:alice');
      expect(neighbors).toHaveLength(2);
      expect(neighbors.find(n => n.nodeId === 'user:bob' && n.direction === 'outgoing')).toBeDefined();
      expect(neighbors.find(n => n.nodeId === 'user:carol' && n.direction === 'incoming')).toBeDefined();
    });

    it('filters by edge label', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add nodes
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'user:bob', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'user:carol', createDot('w1', 3));

      // alice --follows--> bob
      orsetAdd(state.edgeAlive, encodeEdgeKey('user:alice', 'user:bob', 'follows'), createDot('w1', 4));
      // alice --blocks--> carol
      orsetAdd(state.edgeAlive, encodeEdgeKey('user:alice', 'user:carol', 'blocks'), createDot('w1', 5));

      const follows = graph.neighbors('user:alice', 'outgoing', 'follows');
      expect(follows).toHaveLength(1);
      expect(follows[0].nodeId).toBe('user:bob');
    });

    it('excludes edges with non-visible endpoints', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add only alice (bob is NOT added)
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));

      // Add edge to non-existent bob
      orsetAdd(state.edgeAlive, encodeEdgeKey('user:alice', 'user:bob', 'follows'), createDot('w1', 2));

      // Should not return bob since it doesn't exist
      const neighbors = graph.neighbors('user:alice', 'outgoing');
      expect(neighbors).toHaveLength(0);
    });
  });

  describe('getNodes()', () => {
    it('throws if no cached state', () => {
      expect(() => graph.getNodes()).toThrow('No cached state');
    });

    it('returns empty array for empty graph', async () => {
      await graph.materialize();
      expect(graph.getNodes()).toEqual([]);
    });

    it('returns all visible nodes', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      orsetAdd(state.nodeAlive, 'node-a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'node-b', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'node-c', createDot('w1', 3));

      const nodes = graph.getNodes();
      expect(nodes).toHaveLength(3);
      expect(nodes).toContain('node-a');
      expect(nodes).toContain('node-b');
      expect(nodes).toContain('node-c');
    });
  });

  describe('getEdges()', () => {
    it('throws if no cached state', () => {
      expect(() => graph.getEdges()).toThrow('No cached state');
    });

    it('returns empty array for empty graph', async () => {
      await graph.materialize();
      expect(graph.getEdges()).toEqual([]);
    });

    it('returns all visible edges', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Add nodes
      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'b', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'c', createDot('w1', 3));

      // Add edges
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'e1'), createDot('w1', 4));
      orsetAdd(state.edgeAlive, encodeEdgeKey('b', 'c', 'e2'), createDot('w1', 5));

      const edges = graph.getEdges();
      expect(edges).toHaveLength(2);
      expect(edges.find(e => e.from === 'a' && e.to === 'b' && e.label === 'e1')).toBeDefined();
      expect(edges.find(e => e.from === 'b' && e.to === 'c' && e.label === 'e2')).toBeDefined();
    });

    it('excludes edges with non-visible endpoints', async () => {
      await graph.materialize();
      const state = graph._cachedState;

      // Only add 'a' node
      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));

      // Add edge to non-existent 'b'
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'e1'), createDot('w1', 2));

      const edges = graph.getEdges();
      expect(edges).toHaveLength(0);
    });
  });
});
