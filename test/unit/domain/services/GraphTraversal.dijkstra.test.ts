/**
 * GraphTraversal.weightedShortestPath (Dijkstra) — determinism + correctness.
 *
 * F4 is the crown jewel: equal-cost predecessor update rule.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.ts';
import {
  makeAdjacencyProvider, makeWeightFn,
  F3_DIAMOND_EQUAL_PATHS,
  F4_DIJKSTRA_EQUAL_COST_PREDECESSOR,
  F4_WEIGHTS,
} from '../../../helpers/fixtureDsl.ts';

describe('GraphTraversal.weightedShortestPath (Dijkstra)', () => {
  // F4 — "you only catch it if you wrote the spec"
  describe('F4 — DIJKSTRA_EQUAL_COST_PREDECESSOR_UPDATE', () => {
    it('updates predecessor on equal cost: S→B→G (B < C)', async () => {
      const provider = makeAdjacencyProvider(F4_DIJKSTRA_EQUAL_COST_PREDECESSOR);
      const engine = new GraphTraversal({ provider });
      const result = await engine.weightedShortestPath({
        start: 'S',
        goal: 'G',
        weightFn: makeWeightFn(F4_WEIGHTS),
      });

      // S→C→G = 1+4 = 5, S→B→G = 3+2 = 5. Equal cost.
      // G first reached via C (cost 5), then via B (also 5).
      // Predecessor update rule: B < C → path becomes S→B→G.
      expect(result.totalCost).toBe(5);
      expect(result.path).toEqual(['S', 'B', 'G']);
    });

    it('would have picked S→C→G without tie-break rule (control test)', async () => {
      // With weight S→C=1, G is discovered via C first (cost 5).
      // If we DON'T update predecessor on equal cost, path stays S→C→G.
      // This test documents the invariant: our implementation DOES update.
      const provider = makeAdjacencyProvider(F4_DIJKSTRA_EQUAL_COST_PREDECESSOR);
      const engine = new GraphTraversal({ provider });
      const result = await engine.weightedShortestPath({
        start: 'S',
        goal: 'G',
        weightFn: makeWeightFn(F4_WEIGHTS),
      });

      // Invariant: lex-smallest predecessor wins on ties
      expect(result.path[1]).toBe('B');
    });
  });

  // F3 — uniform weights
  describe('F3 — DIAMOND with uniform weights', () => {
    it('finds path cost 2 with lex tie-break', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const result = await engine.weightedShortestPath({
        start: 'A',
        goal: 'D',
      });
      expect(result.totalCost).toBe(2);
      // B < C → A→B→D
      expect(result.path).toEqual(['A', 'B', 'D']);
    });
  });

  // Unreachable
  describe('unreachable', () => {
    it('throws NO_PATH for disconnected nodes', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      await expect(
        engine.weightedShortestPath({ start: 'D', goal: 'A' })
      ).rejects.toThrow(/No path/);
    });
  });
});
