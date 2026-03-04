/**
 * GraphTraversal.transitiveReduction() — minimal edge set preserving reachability.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  makeFixture,
  F3_DIAMOND_EQUAL_PATHS,
  F8_TOPO_CYCLE_3,
  F16_TRANSITIVE_REDUCTION,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.transitiveReduction()', () => {
  describe('F16 — redundant edge removal', () => {
    it('removes redundant A→C edge', async () => {
      const provider = makeAdjacencyProvider(F16_TRANSITIVE_REDUCTION);
      const engine = new GraphTraversal({ provider });
      const { edges, removed } = await engine.transitiveReduction({ start: 'A' });

      expect(removed).toBe(1);
      // A→B and B→C should remain; A→C removed
      expect(edges).toEqual([
        { from: 'A', to: 'B', label: '' },
        { from: 'B', to: 'C', label: '' },
      ]);
    });
  });

  describe('F3 — diamond (no redundant edges)', () => {
    it('preserves all edges in diamond', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { edges, removed } = await engine.transitiveReduction({ start: 'A' });

      // A→B, A→C, B→D, C→D — none redundant
      expect(removed).toBe(0);
      expect(edges).toEqual([
        { from: 'A', to: 'B', label: '' },
        { from: 'A', to: 'C', label: '' },
        { from: 'B', to: 'D', label: '' },
        { from: 'C', to: 'D', label: '' },
      ]);
    });
  });

  describe('chain (no redundant edges)', () => {
    it('preserves all edges in linear chain', async () => {
      const fixture = makeFixture({
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      const { edges, removed } = await engine.transitiveReduction({ start: 'A' });

      expect(removed).toBe(0);
      expect(edges).toEqual([
        { from: 'A', to: 'B', label: '' },
        { from: 'B', to: 'C', label: '' },
      ]);
    });
  });

  describe('multiple redundant edges', () => {
    it('removes all transitively implied edges', async () => {
      // A→B, A→C, A→D (redundant), B→C, B→D (redundant), C→D
      const fixture = makeFixture({
        nodes: ['A', 'B', 'C', 'D'],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'A', to: 'C' },
          { from: 'A', to: 'D' },
          { from: 'B', to: 'C' },
          { from: 'B', to: 'D' },
          { from: 'C', to: 'D' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      const { edges, removed } = await engine.transitiveReduction({ start: 'A' });

      expect(removed).toBe(3); // A→C, A→D, B→D
      expect(edges).toEqual([
        { from: 'A', to: 'B', label: '' },
        { from: 'B', to: 'C', label: '' },
        { from: 'C', to: 'D', label: '' },
      ]);
    });
  });

  describe('preserves labels', () => {
    it('edge labels survive reduction', async () => {
      const fixture = makeFixture({
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B', label: 'manages' },
          { from: 'B', to: 'C', label: 'owns' },
          { from: 'A', to: 'C', label: 'redundant' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      const { edges, removed } = await engine.transitiveReduction({ start: 'A' });

      expect(removed).toBe(1);
      expect(edges).toEqual([
        { from: 'A', to: 'B', label: 'manages' },
        { from: 'B', to: 'C', label: 'owns' },
      ]);
    });
  });

  describe('cycle detection', () => {
    it('throws ERR_GRAPH_HAS_CYCLES', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });

      await expect(engine.transitiveReduction({ start: 'A' })).rejects.toThrow(
        expect.objectContaining({
          code: 'ERR_GRAPH_HAS_CYCLES',
        }),
      );
    });
  });

  describe('INVALID_START', () => {
    it('throws when start node does not exist', async () => {
      const provider = makeAdjacencyProvider(F16_TRANSITIVE_REDUCTION);
      const engine = new GraphTraversal({ provider });

      await expect(engine.transitiveReduction({ start: 'NOPE' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_START',
        }),
      );
    });
  });

  describe('stats', () => {
    it('returns traversal stats', async () => {
      const provider = makeAdjacencyProvider(F16_TRANSITIVE_REDUCTION);
      const engine = new GraphTraversal({ provider });
      const { stats } = await engine.transitiveReduction({ start: 'A' });

      expect(stats.nodesVisited).toBe(3);
    });
  });
});
