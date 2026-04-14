/**
 * GraphTraversal.shortestPath — determinism + correctness tests.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.ts';
import {
  makeAdjacencyProvider,
  F1_BFS_LEVEL_SORT_TRAP,
  F3_DIAMOND_EQUAL_PATHS,
} from '../../../helpers/fixtureDsl.ts';

describe('GraphTraversal.shortestPath', () => {
  describe('F3 — DIAMOND_EQUAL_PATHS', () => {
    it('tie-breaks by lex predecessor: A→B→D (B < C)', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'D' });

      expect(result.found).toBe(true);
      expect(result.length).toBe(2);
      // Both A→B→D and A→C→D are length 2. BFS-lex picks B first.
      expect(result.path).toEqual(['A', 'B', 'D']);
    });
  });

  describe('F1 — BFS_LEVEL_SORT_TRAP', () => {
    it('finds correct 2-hop path to Z via B', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'Z' });

      expect(result.found).toBe(true);
      expect(result.path).toEqual(['A', 'B', 'Z']);
    });

    it('finds correct 2-hop path to D via C', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'D' });

      expect(result.found).toBe(true);
      expect(result.path).toEqual(['A', 'C', 'D']);
    });
  });

  describe('edge cases', () => {
    it('start === goal returns trivial path', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'A' });
      expect(result).toEqual({ found: true, path: ['A'], length: 0, stats: expect.any(Object) });
    });

    it('unreachable returns not found', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'D', goal: 'A' });
      expect(result.found).toBe(false);
      expect(result.length).toBe(-1);
    });
  });
});
