/**
 * Tests for WarpStateIndexBuilder (Task 6)
 *
 * Tests that the index is built from materialized WARP state (edgeAlive OR-Set),
 * NOT from Git commit DAG topology.
 */

import { describe, it, expect } from 'vitest';
import WarpStateIndexBuilder, { buildWarpStateIndex } from '../../../../src/domain/services/index/WarpStateIndexBuilder.ts';
import { createEmptyState, encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';

describe('WarpStateIndexBuilder', () => {
  describe('buildFromState()', () => {
    it('throws on invalid state', () => {
      const builder = new WarpStateIndexBuilder();
      expect(() => builder.buildFromState((null))).toThrow('Invalid state');
      expect(() => builder.buildFromState(({} as any))).toThrow('Invalid state');
    });

    it('returns empty index for empty state', () => {
      const state = createEmptyState();
      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
    });

    it('indexes all visible nodes', () => {
      const state = createEmptyState();

      // Add nodes
      state.nodeAlive.add('node-a', Dot.create('w1', 1));
      state.nodeAlive.add('node-b', Dot.create('w1', 2));
      state.nodeAlive.add('node-c', Dot.create('w1', 3));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(3);
    });

    it('indexes edges from edgeAlive OR-Set', () => {
      const state = createEmptyState();

      // Add nodes
      state.nodeAlive.add('a', Dot.create('w1', 1));
      state.nodeAlive.add('b', Dot.create('w1', 2));
      state.nodeAlive.add('c', Dot.create('w1', 3));

      // Add edges
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'e1'), Dot.create('w1', 4));
      state.edgeAlive.add(encodeEdgeKey('b', 'c', 'e2'), Dot.create('w1', 5));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.edges).toBe(2);
    });

    it('excludes edges with non-visible endpoints', () => {
      const state = createEmptyState();

      // Only add 'a' and 'b' nodes (NOT 'c')
      state.nodeAlive.add('a', Dot.create('w1', 1));
      state.nodeAlive.add('b', Dot.create('w1', 2));

      // Add edge a->b (valid) and b->c (invalid - c doesn't exist)
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'e1'), Dot.create('w1', 3));
      state.edgeAlive.add(encodeEdgeKey('b', 'c', 'e2'), Dot.create('w1', 4));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.edges).toBe(1); // Only a->b should be indexed
    });

    it('handles self-loops', () => {
      const state = createEmptyState();

      state.nodeAlive.add('a', Dot.create('w1', 1));
      state.edgeAlive.add(encodeEdgeKey('a', 'a', 'self'), Dot.create('w1', 2));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(1);
      expect(stats.edges).toBe(1);
    });

    it('handles multi-edges (same endpoints, different labels)', () => {
      const state = createEmptyState();

      state.nodeAlive.add('a', Dot.create('w1', 1));
      state.nodeAlive.add('b', Dot.create('w1', 2));

      // Multiple edges between same nodes with different labels
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'follows'), Dot.create('w1', 3));
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'likes'), Dot.create('w1', 4));
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'blocks'), Dot.create('w1', 5));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.edges).toBe(3);
    });
  });

  describe('serialize()', () => {
    it('produces deterministic output', async () => {
      const state = createEmptyState();

      state.nodeAlive.add('a', Dot.create('w1', 1));
      state.nodeAlive.add('b', Dot.create('w1', 2));
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'e1'), Dot.create('w1', 3));

      // Build twice and compare
      const builder1 = new WarpStateIndexBuilder();
      builder1.buildFromState(state);
      const tree1 = await builder1.serialize();

      const builder2 = new WarpStateIndexBuilder();
      builder2.buildFromState(state);
      const tree2 = await builder2.serialize();

      // Same keys
      expect(Object.keys(tree1).sort()).toEqual(Object.keys(tree2).sort());

      // Same content
      for (const key of Object.keys(tree1)) {
        expect(tree1[key]).toEqual(tree2[key]);
      }
    });

    it('produces sharded output structure', async () => {
      const state = createEmptyState();

      state.nodeAlive.add('node-a', Dot.create('w1', 1));
      state.nodeAlive.add('node-b', Dot.create('w1', 2));
      state.edgeAlive.add(encodeEdgeKey('node-a', 'node-b', 'edge'), Dot.create('w1', 3));

      const builder = new WarpStateIndexBuilder();
      builder.buildFromState(state);
      const tree = await builder.serialize();

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
    it('builds and serializes in one call', async () => {
      const state = createEmptyState();

      state.nodeAlive.add('x', Dot.create('w1', 1));
      state.nodeAlive.add('y', Dot.create('w1', 2));
      state.edgeAlive.add(encodeEdgeKey('x', 'y', 'link'), Dot.create('w1', 3));

      const { tree, stats } = await buildWarpStateIndex(state);

      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBe(1);
      expect(Object.keys(tree).length).toBeGreaterThan(0);
    });
  });

  describe('WARP contract: index is built from logical edges, not commit DAG', () => {
    it('indexes node IDs, not commit SHAs', () => {
      const state = createEmptyState();

      // Node IDs are semantic (user:alice), not commit SHAs
      state.nodeAlive.add('user:alice', Dot.create('w1', 1));
      state.nodeAlive.add('user:bob', Dot.create('w1', 2));
      state.edgeAlive.add(encodeEdgeKey('user:alice', 'user:bob', 'follows'), Dot.create('w1', 3));

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBe(1);

      // The underlying builder should have the node IDs registered
      expect(builder.builder.shaToId.has('user:alice')).toBe(true);
      expect(builder.builder.shaToId.has('user:bob')).toBe(true);
    });

    it('edge direction comes from edge definition, not parent relationship', () => {
      const state = createEmptyState();

      state.nodeAlive.add('parent', Dot.create('w1', 1));
      state.nodeAlive.add('child', Dot.create('w1', 2));

      // Edge direction is defined by from/to, not by any commit parent relationship
      state.edgeAlive.add(encodeEdgeKey('parent', 'child', 'contains'), Dot.create('w1', 3));

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
      expect((fwdBitmap as any).has((childId as number))).toBe(true);

      // Reverse edge: child -> parent
      const revBitmap = builder.builder.bitmaps.get('rev_child');
      expect(revBitmap).toBeDefined();
      expect((revBitmap as any).has((parentId as number))).toBe(true);
    });
  });

  describe('stress test', () => {
    it('handles large graph (1000 nodes, 5000 edges)', async () => {
      const state = createEmptyState();

      // Add 1000 nodes
      for (let i = 0; i < 1000; i++) {
        state.nodeAlive.add(`node-${i}`, Dot.create('w1', i + 1));
      }

      // Add 5000 random edges
      for (let i = 0; i < 5000; i++) {
        const from = `node-${Math.floor(Math.random() * 1000)}`;
        const to = `node-${Math.floor(Math.random() * 1000)}`;
        state.edgeAlive.add(encodeEdgeKey(from, to, `edge-${i}`), Dot.create('w1', 1001 + i));
      }

      const builder = new WarpStateIndexBuilder();
      const { stats } = builder.buildFromState(state);

      expect(stats.nodes).toBe(1000);
      expect(stats.edges).toBe(5000);

      // Should be able to serialize without error
      const tree = await builder.serialize();
      expect(Object.keys(tree).length).toBeGreaterThan(0);
    });
  });
});
