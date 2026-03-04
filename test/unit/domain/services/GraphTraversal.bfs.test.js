/**
 * GraphTraversal.bfs — determinism + correctness tests using canonical fixtures.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  F1_BFS_LEVEL_SORT_TRAP,
  F3_DIAMOND_EQUAL_PATHS,
  F9_UNICODE_CODEPOINT_ORDER,
  F13_BFS_MULTI_PARENT_DEDUP,
  F17_MULTI_ROOT_DAG,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.bfs', () => {
  // F1 — the trap that catches fake BFS determinism
  describe('F1 — BFS_LEVEL_SORT_TRAP', () => {
    it('visits nodes in depth-sorted lex order, not insertion order', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A' });

      // A naive queue BFS gives A, B, C, Z, D (wrong).
      // Correct depth-sorted BFS: depth 0=[A], depth 1=[B,C], depth 2=[D,Z]
      expect(nodes).toEqual(['A', 'B', 'C', 'D', 'Z']);
    });

    it('shortestPath(A, D) returns A→C→D (C is parent of D)', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'D' });

      expect(result.found).toBe(true);
      expect(result.length).toBe(2);
      // A→C→D (C is the direct parent of D in this graph)
      expect(result.path).toEqual(['A', 'C', 'D']);
    });

    it('shortestPath(A, Z) returns A→B→Z', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'Z' });

      expect(result.found).toBe(true);
      expect(result.length).toBe(2);
      expect(result.path).toEqual(['A', 'B', 'Z']);
    });
  });

  // F3 — diamond: same-depth nodes in lex order
  describe('F3 — DIAMOND_EQUAL_PATHS', () => {
    it('visits B before C at depth 1', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A' });
      expect(nodes).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  // F9 — unicode codepoint order, not locale
  describe('F9 — UNICODE_CODEPOINT_ORDER', () => {
    it('visits A (65) before a (97) before ä (228)', async () => {
      const provider = makeAdjacencyProvider(F9_UNICODE_CODEPOINT_ORDER);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'S' });
      expect(nodes).toEqual(['S', 'A', 'a', 'ä']);
    });
  });

  // Limits
  describe('limits', () => {
    it('respects maxDepth', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A', maxDepth: 1 });
      expect(nodes).toEqual(['A', 'B', 'C']);
    });

    it('respects maxNodes', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A', maxNodes: 3 });
      expect(nodes).toEqual(['A', 'B', 'C']);
    });

    it('respects AbortSignal', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const ac = new AbortController();
      ac.abort();
      await expect(engine.bfs({ start: 'A', signal: ac.signal })).rejects.toThrow(/aborted/i);
    });
  });

  // Direction
  describe('direction', () => {
    it('"in" follows incoming edges', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'D', direction: 'in' });
      expect(nodes).toEqual(['D', 'B', 'C', 'A']);
    });

    it('"both" finds all connected nodes', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'B', direction: 'both' });
      expect(nodes.sort()).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  // F13 — multi-parent dedup: B, C, E all point to D; D must not be queued 3x
  describe('F13 — BFS_MULTI_PARENT_DEDUP', () => {
    it('visits D exactly once despite 3 parents at the same level', async () => {
      const provider = makeAdjacencyProvider(F13_BFS_MULTI_PARENT_DEDUP);
      const engine = new GraphTraversal({ provider });
      const { nodes, stats } = await engine.bfs({ start: 'A' });

      // Depth 0=[A], depth 1=[B,C,E], depth 2=[D]
      expect(nodes).toEqual(['A', 'B', 'C', 'E', 'D']);
      // D must appear exactly once (no duplicates from multi-parent enqueue)
      expect(nodes.filter((n) => n === 'D').length).toBe(1);
      expect(stats.nodesVisited).toBe(5);
    });
  });

  // Stats
  describe('stats', () => {
    it('returns accurate node/edge counts', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { stats } = await engine.bfs({ start: 'A' });
      expect(stats.nodesVisited).toBe(4);
      expect(stats.edgesTraversed).toBeGreaterThan(0);
    });
  });

  // Reverse reachability — BFS with direction: 'in'
  describe('reverse reachability (direction: "in")', () => {
    it('F17 — BFS backward from D reaches all ancestors', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'D', direction: 'in' });

      // D has incoming from A, B, C; A has incoming from R1; B,C from R2
      expect(nodes.sort()).toEqual(['A', 'B', 'C', 'D', 'R1', 'R2']);
    });

    it('F3 — BFS backward from D finds complete reverse graph', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'D', direction: 'in' });

      // D←B←A, D←C←A
      expect(nodes).toEqual(['D', 'B', 'C', 'A']);
    });

    it('BFS backward from root node returns only itself', async () => {
      const provider = makeAdjacencyProvider(F17_MULTI_ROOT_DAG);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'R1', direction: 'in' });

      expect(nodes).toEqual(['R1']);
    });
  });

  // M18 — start node validation
  describe('start node validation (M18)', () => {
    it('throws INVALID_START for a nonexistent start node', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      await expect(engine.bfs({ start: 'NONEXISTENT' })).rejects.toThrow(/does not exist/);
    });

    it('INVALID_START error has correct code', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      try {
        await engine.bfs({ start: 'NONEXISTENT' });
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = /** @type {{code: string, context: {nodeId: string}}} */ (err);
        expect(e.code).toBe('INVALID_START');
        expect(e.context.nodeId).toBe('NONEXISTENT');
      }
    });

    it('dfs throws INVALID_START for a nonexistent start node', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      await expect(engine.dfs({ start: 'GHOST' })).rejects.toThrow(/does not exist/);
    });

    it('shortestPath throws INVALID_START for a nonexistent start node', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      await expect(engine.shortestPath({ start: 'GHOST', goal: 'A' })).rejects.toThrow(/does not exist/);
    });
  });
});
