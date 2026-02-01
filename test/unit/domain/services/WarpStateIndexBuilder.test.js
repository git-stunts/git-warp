/**
 * Tests for WarpStateIndexBuilder (Task 6)
 *
 * Tests that the index is built from materialized WARP state (edgeAlive OR-Set),
 * NOT from Git commit DAG topology.
 */

import { describe, it, expect } from 'vitest';
import WarpStateIndexBuilder, { buildWarpStateIndex } from '../../../../src/domain/services/WarpStateIndexBuilder.js';
import { createEmptyStateV5, encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';

describe('WarpStateIndexBuilder', () => {
  describe('buildFromState()', () => {
    it('throws on invalid state', () => {
      const builder = new WarpStateIndexBuilder();
      expect(() => builder.buildFromState(null)).toThrow('Invalid state');
      expect(() => builder.buildFromState({})).toThrow('Invalid state');
    });

    it('returns empty index for empty state', () => {
      const state = createEmptyStateV5();
      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
    });

    it('indexes all visible nodes', () => {
      const state = createEmptyStateV5();

      // Add nodes
      orsetAdd(state.nodeAlive, 'node-a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'node-b', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'node-c', createDot('w1', 3));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(3);
    });

    it('indexes edges from edgeAlive OR-Set', () => {
      const state = createEmptyStateV5();

      // Add nodes
      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'b', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'c', createDot('w1', 3));

      // Add edges
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'e1'), createDot('w1', 4));
      orsetAdd(state.edgeAlive, encodeEdgeKey('b', 'c', 'e2'), createDot('w1', 5));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.edges).toBe(2);
    });

    it('excludes edges with non-visible endpoints', () => {
      const state = createEmptyStateV5();

      // Only add 'a' and 'b' nodes (NOT 'c')
      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'b', createDot('w1', 2));

      // Add edge a->b (valid) and b->c (invalid - c doesn't exist)
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'e1'), createDot('w1', 3));
      orsetAdd(state.edgeAlive, encodeEdgeKey('b', 'c', 'e2'), createDot('w1', 4));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.edges).toBe(1); // Only a->b should be indexed
    });

    it('handles self-loops', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'a', 'self'), createDot('w1', 2));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(1);
      expect(stats.edges).toBe(1);
    });

    it('handles multi-edges (same endpoints, different labels)', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'b', createDot('w1', 2));

      // Multiple edges between same nodes with different labels
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'follows'), createDot('w1', 3));
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'likes'), createDot('w1', 4));
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'blocks'), createDot('w1', 5));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.edges).toBe(3);
    });
  });

  describe('serialize()', () => {
    it('produces deterministic output', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'b', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'e1'), createDot('w1', 3));

      // Build twice and compare
      const builder1 = new WarpStateIndexBuilder();
      builder1.buildFromState(state);
      const tree1 = builder1.serialize();

      const builder2 = new WarpStateIndexBuilder();
      builder2.buildFromState(state);
      const tree2 = builder2.serialize();

      // Same keys
      expect(Object.keys(tree1).sort()).toEqual(Object.keys(tree2).sort());

      // Same content
      for (const key of Object.keys(tree1)) {
        expect(tree1[key].equals(tree2[key])).toBe(true);
      }
    });

    it('produces sharded output structure', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'node-a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'node-b', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('node-a', 'node-b', 'edge'), createDot('w1', 3));

      const builder = new WarpStateIndexBuilder();
      builder.buildFromState(state);
      const tree = builder.serialize();

      // Should have meta and shard files
      const keys = Object.keys(tree);
      const hasMetaFiles = keys.some(k => k.startsWith('meta_'));
      const hasFwdShards = keys.some(k => k.startsWith('shards_fwd_'));
      const hasRevShards = keys.some(k => k.startsWith('shards_rev_'));

      expect(hasMetaFiles).toBe(true);
      expect(hasFwdShards).toBe(true);
      expect(hasRevShards).toBe(true);
    });
  });

  describe('buildWarpStateIndex() convenience function', () => {
    it('builds and serializes in one call', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'x', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'y', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('x', 'y', 'link'), createDot('w1', 3));

      const { tree, stats } = buildWarpStateIndex(state);

      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBe(1);
      expect(Object.keys(tree).length).toBeGreaterThan(0);
    });
  });

  describe('WARP contract: index is built from logical edges, not commit DAG', () => {
    it('indexes node IDs, not commit SHAs', () => {
      const state = createEmptyStateV5();

      // Node IDs are semantic (user:alice), not commit SHAs
      orsetAdd(state.nodeAlive, 'user:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'user:bob', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('user:alice', 'user:bob', 'follows'), createDot('w1', 3));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBe(1);

      // The underlying builder should have the node IDs registered
      expect(builder.builder.shaToId.has('user:alice')).toBe(true);
      expect(builder.builder.shaToId.has('user:bob')).toBe(true);
    });

    it('edge direction comes from edge definition, not parent relationship', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'parent', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'child', createDot('w1', 2));

      // Edge direction is defined by from/to, not by any commit parent relationship
      orsetAdd(state.edgeAlive, encodeEdgeKey('parent', 'child', 'contains'), createDot('w1', 3));

      const builder = new WarpStateIndexBuilder();
      builder.buildFromState(state);

      // Check forward bitmap exists for 'parent'
      const parentId = builder.builder.shaToId.get('parent');
      const childId = builder.builder.shaToId.get('child');

      expect(parentId).toBeDefined();
      expect(childId).toBeDefined();

      // Forward edge: parent -> child
      const fwdBitmap = builder.builder.bitmaps.get('fwd_parent');
      expect(fwdBitmap).toBeDefined();
      expect(fwdBitmap.has(childId)).toBe(true);

      // Reverse edge: child -> parent
      const revBitmap = builder.builder.bitmaps.get('rev_child');
      expect(revBitmap).toBeDefined();
      expect(revBitmap.has(parentId)).toBe(true);
    });
  });

  describe('stress test', () => {
    it('handles large graph (1000 nodes, 5000 edges)', () => {
      const state = createEmptyStateV5();

      // Add 1000 nodes
      for (let i = 0; i < 1000; i++) {
        orsetAdd(state.nodeAlive, `node-${i}`, createDot('w1', i + 1));
      }

      // Add 5000 random edges
      for (let i = 0; i < 5000; i++) {
        const from = `node-${Math.floor(Math.random() * 1000)}`;
        const to = `node-${Math.floor(Math.random() * 1000)}`;
        orsetAdd(state.edgeAlive, encodeEdgeKey(from, to, `edge-${i}`), createDot('w1', 1001 + i));
      }

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(1000);
      expect(stats.edges).toBe(5000);

      // Should be able to serialize without error
      const tree = builder.serialize();
      expect(Object.keys(tree).length).toBeGreaterThan(0);
    });
  });
});
