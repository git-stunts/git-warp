/**
 * GraphTraversal.rootAncestors() — find in-degree-0 ancestors.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  makeFixture,
  F3_DIAMOND_EQUAL_PATHS,
  F8_TOPO_CYCLE_3,
  F17_MULTI_ROOT_DAG,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.rootAncestors()', () => {
  describe('F17 — multi-root DAG', () => {
    it('finds all root ancestors from leaf node', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      const { roots } = await engine.rootAncestors({ start: 'D' });

      expect(roots).toEqual(['R1', 'R2']);
    });

    it('returns the node itself if it is a root', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      const { roots } = await engine.rootAncestors({ start: 'R1' });

      expect(roots).toEqual(['R1']);
    });

    it('finds roots from intermediate node', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      const { roots } = await engine.rootAncestors({ start: 'B' });

      expect(roots).toEqual(['R2']);
    });
  });

  describe('F3 — diamond', () => {
    it('finds single root from leaf', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { roots } = await engine.rootAncestors({ start: 'D' });

      expect(roots).toEqual(['A']);
    });

    it('returns root as its own ancestor', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { roots } = await engine.rootAncestors({ start: 'A' });

      expect(roots).toEqual(['A']);
    });
  });

  describe('cyclic graph', () => {
    it('works on cyclic graphs (BFS reachability)', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });
      // All nodes in a cycle have in-degree > 0, so no roots
      const { roots } = await engine.rootAncestors({ start: 'A' });

      expect(roots).toEqual([]);
    });
  });

  describe('disconnected root', () => {
    it('finds only backward-reachable roots', async () => {
      const fixture = makeFixture({
        nodes: ['X', 'Y', 'Z'],
        edges: [
          { from: 'X', to: 'Y' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      // Y has root X backward; Z is disconnected
      const { roots } = await engine.rootAncestors({ start: 'Y' });

      expect(roots).toEqual(['X']);
    });
  });

  describe('INVALID_START', () => {
    it('throws when start node does not exist', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });

      await expect(engine.rootAncestors({ start: 'NOPE' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_START',
        }),
      );
    });
  });

  describe('maxDepth', () => {
    it('respects maxDepth limit', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      // maxDepth=1 from D reaches A, B, C but NOT R1, R2
      const { roots } = await engine.rootAncestors({ start: 'D', maxDepth: 1 });

      // A, B, C all have incoming edges so none are roots within depth 1
      // D itself has incoming edges, so it's not a root either
      expect(roots).toEqual([]);
    });
  });

  describe('stats', () => {
    it('returns traversal stats', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      const { stats } = await engine.rootAncestors({ start: 'D' });

      expect(stats.nodesVisited).toBeGreaterThan(0);
      expect(stats.edgesTraversed).toBeGreaterThan(0);
    });
  });
});
