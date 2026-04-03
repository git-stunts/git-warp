/**
 * GraphTraversal.dfs — determinism + correctness tests using canonical fixtures.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  F2_DFS_LEFTMOST_REVERSE_PUSH,
  F3_DIAMOND_EQUAL_PATHS,
  F9_UNICODE_CODEPOINT_ORDER,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.dfs', () => {
  // F2 — the leftmost-first reverse-push test
  describe('F2 — DFS_LEFTMOST_REVERSE_PUSH', () => {
    it('visits leftmost child first via reverse-push', async () => {
      const provider = makeAdjacencyProvider(F2_DFS_LEFTMOST_REVERSE_PUSH);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.dfs({ start: 'A' });

      // A's neighbors: [B, C] (sorted). Push C then B onto stack.
      // Pop B → B's neighbor D → push D. Pop D. Pop C → C's neighbor E → push E. Pop E.
      expect(nodes).toEqual(['A', 'B', 'D', 'C', 'E']);
    });
  });

  // F3 — diamond: DFS goes deep before wide
  describe('F3 — DIAMOND_EQUAL_PATHS', () => {
    it('follows B branch to D before exploring C', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.dfs({ start: 'A' });

      // A→B (lex first) → D, then C (D already visited)
      expect(nodes).toEqual(['A', 'B', 'D', 'C']);
    });
  });

  // F9 — unicode codepoint order
  describe('F9 — UNICODE_CODEPOINT_ORDER', () => {
    it('visits A (65) first via reverse-push of sorted neighbors', async () => {
      const provider = makeAdjacencyProvider(F9_UNICODE_CODEPOINT_ORDER);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.dfs({ start: 'S' });
      // S's neighbors sorted: [A, a, ä]. Reverse-push: ä, a, A. Pop A first.
      expect(nodes).toEqual(['S', 'A', 'a', 'ä']);
    });
  });

  // Limits
  describe('limits', () => {
    it('respects maxDepth', async () => {
      const provider = makeAdjacencyProvider(F2_DFS_LEFTMOST_REVERSE_PUSH);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.dfs({ start: 'A', maxDepth: 1 });
      expect(nodes).toEqual(['A', 'B', 'C']);
    });
  });
});
