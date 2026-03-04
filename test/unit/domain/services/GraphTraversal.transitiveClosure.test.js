/**
 * GraphTraversal.transitiveClosure() — all implied reachability edges.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  makeFixture,
  F3_DIAMOND_EQUAL_PATHS,
  F8_TOPO_CYCLE_3,
  F18_TRANSITIVE_CLOSURE_CHAIN,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.transitiveClosure()', () => {
  describe('F18 — linear chain A→B→C→D', () => {
    it('produces 6 reachability edges', async () => {
      const provider = makeAdjacencyProvider(F18_TRANSITIVE_CLOSURE_CHAIN);
      const engine = new GraphTraversal({ provider });
      const { edges } = await engine.transitiveClosure({ start: 'A' });

      // A→B, A→C, A→D, B→C, B→D, C→D
      expect(edges).toEqual([
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'A', to: 'D' },
        { from: 'B', to: 'C' },
        { from: 'B', to: 'D' },
        { from: 'C', to: 'D' },
      ]);
    });
  });

  describe('F3 — diamond', () => {
    it('includes both paths plus transitive A→D', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { edges } = await engine.transitiveClosure({ start: 'A' });

      // A→B, A→C, A→D, B→D, C→D
      expect(edges).toEqual([
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'A', to: 'D' },
        { from: 'B', to: 'D' },
        { from: 'C', to: 'D' },
      ]);
    });
  });

  describe('cyclic graph', () => {
    it('works on cyclic graphs', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });
      const { edges } = await engine.transitiveClosure({ start: 'A' });

      // A→B, A→C, B→A, B→C, C→A, C→B — full reachability
      expect(edges).toEqual([
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'B', to: 'A' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' },
        { from: 'C', to: 'B' },
      ]);
    });
  });

  describe('single node', () => {
    it('returns empty edges for isolated node', async () => {
      const fixture = makeFixture({
        nodes: ['X'],
        edges: [],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      const { edges } = await engine.transitiveClosure({ start: 'X' });

      expect(edges).toEqual([]);
    });
  });

  describe('maxEdges safety', () => {
    it('throws E_MAX_EDGES_EXCEEDED when limit hit', async () => {
      const provider = makeAdjacencyProvider(F18_TRANSITIVE_CLOSURE_CHAIN);
      const engine = new GraphTraversal({ provider });

      await expect(
        engine.transitiveClosure({ start: 'A', maxEdges: 3 }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'E_MAX_EDGES_EXCEEDED',
        }),
      );
    });

    it('succeeds when edges within limit', async () => {
      const provider = makeAdjacencyProvider(F18_TRANSITIVE_CLOSURE_CHAIN);
      const engine = new GraphTraversal({ provider });
      const { edges } = await engine.transitiveClosure({ start: 'A', maxEdges: 6 });

      expect(edges.length).toBe(6);
    });
  });

  describe('INVALID_START', () => {
    it('throws when start node does not exist', async () => {
      const provider = makeAdjacencyProvider(F18_TRANSITIVE_CLOSURE_CHAIN);
      const engine = new GraphTraversal({ provider });

      await expect(engine.transitiveClosure({ start: 'NOPE' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_START',
        }),
      );
    });
  });

  describe('deterministic output', () => {
    it('edges are sorted lexicographically', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { edges } = await engine.transitiveClosure({ start: 'A' });

      for (let i = 1; i < edges.length; i++) {
        const prev = edges[i - 1];
        const curr = edges[i];
        const cmp = prev.from < curr.from ? -1 : prev.from > curr.from ? 1 :
          prev.to < curr.to ? -1 : prev.to > curr.to ? 1 : 0;
        expect(cmp).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('stats', () => {
    it('returns traversal stats', async () => {
      const provider = makeAdjacencyProvider(F18_TRANSITIVE_CLOSURE_CHAIN);
      const engine = new GraphTraversal({ provider });
      const { stats } = await engine.transitiveClosure({ start: 'A' });

      expect(stats.nodesVisited).toBe(4);
      expect(stats.edgesTraversed).toBeGreaterThan(0);
    });
  });
});
