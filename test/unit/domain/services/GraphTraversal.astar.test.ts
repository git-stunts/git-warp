/**
 * GraphTraversal.aStarSearch — determinism + correctness.
 *
 * F5 proves nodeId tie-breaking replaces EPSILON hacks.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.ts';
import {
  makeAdjacencyProvider, makeWeightFn,
  F5_ASTAR_TIE_BREAK,
  F5_WEIGHTS,
  F3_DIAMOND_EQUAL_PATHS,
} from '../../../helpers/fixtureDsl.ts';

describe('GraphTraversal.aStarSearch', () => {
  // F5 — expansion order with equal f-scores
  describe('F5 — ASTAR_TIE_BREAK_EXPANSION_ORDER', () => {
    it('chooses B before C on equal f-score (B < C)', async () => {
      const provider = makeAdjacencyProvider(F5_ASTAR_TIE_BREAK);
      const engine = new GraphTraversal({ provider });
      const result = await engine.aStarSearch({
        start: 'S',
        goal: 'G',
        weightFn: makeWeightFn(F5_WEIGHTS),
        heuristicFn: () => 0, // A* reduces to Dijkstra
      });
      expect(result.path).toEqual(['S', 'B', 'G']);
      expect(result.totalCost).toBe(11);
    });

    it('path is S→B→G (lex tie-break)', async () => {
      const provider = makeAdjacencyProvider(F5_ASTAR_TIE_BREAK);
      const engine = new GraphTraversal({ provider });
      const result = await engine.aStarSearch({
        start: 'S',
        goal: 'G',
        weightFn: makeWeightFn(F5_WEIGHTS),
        heuristicFn: () => 0,
      });

      expect(result.totalCost).toBe(11);
      // B and C both lead to G with same cost. B < C → S→B→G.
      expect(result.path).toEqual(['S', 'B', 'G']);
    });
  });

  // F3 — with admissible heuristic
  describe('F3 — DIAMOND with trivial heuristic', () => {
    it('finds optimal path A→B→D', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const result = await engine.aStarSearch({
        start: 'A',
        goal: 'D',
      });
      expect(result.totalCost).toBe(2);
      expect(result.path).toEqual(['A', 'B', 'D']);
    });
  });

  // Unreachable
  describe('unreachable', () => {
    it('throws NO_PATH', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      await expect(
        engine.aStarSearch({ start: 'D', goal: 'A' })
      ).rejects.toThrow(/No path/);
    });
  });
});
