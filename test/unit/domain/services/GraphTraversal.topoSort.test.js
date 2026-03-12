/**
 * GraphTraversal.topologicalSort — determinism + cycle detection.
 *
 * F3 tests lex ordering of zero-indegree nodes.
 * F8 tests cycle detection with witness.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeFixture, makeAdjacencyProvider,
  F3_DIAMOND_EQUAL_PATHS,
  F8_TOPO_CYCLE_3,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.topologicalSort', () => {
  // F3 — deterministic zero-indegree order
  describe('F3 — DIAMOND_EQUAL_PATHS', () => {
    it('sorts A, B, C, D (B < C at same in-degree level)', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'A' });
      expect(hasCycle).toBe(false);
      // A first (zero-indegree). Then B, C become zero-indegree. B < C.
      // After B and C: D becomes zero-indegree.
      expect(sorted).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  // F8 — cycle detection
  describe('F8 — TOPO_CYCLE_3', () => {
    it('detects cycle without throwing', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });
      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'A' });
      expect(hasCycle).toBe(true);
      // Some nodes yielded before cycle detected; not all 3
      expect(sorted.length).toBeLessThan(3);
    });

    it('throws ERR_GRAPH_HAS_CYCLES with witness when throwOnCycle=true', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });

      try {
        await engine.topologicalSort({ start: 'A', throwOnCycle: true });
        expect.fail('should have thrown');
      } catch (_e) {
        const err = /** @type {*} */ (_e);
        expect(err.code).toBe('ERR_GRAPH_HAS_CYCLES');
        expect(err.context.nodesInCycle).toBeGreaterThan(0);
        // Cycle witness provided
        expect(err.context.cycleWitness).toBeDefined();
        expect(err.context.cycleWitness.from).toBeDefined();
        expect(err.context.cycleWitness.to).toBeDefined();
      }
    });

    it('weightedLongestPath also throws on cycle', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });
      await expect(
        engine.weightedLongestPath({ start: 'A', goal: 'C' })
      ).rejects.toThrow(/cycle/i);
    });
  });

  // Multiple starts
  describe('multiple starts', () => {
    it('handles disjoint chains with multiple start nodes', async () => {
      const fixture = makeFixture({
        nodes: ['X', 'Y', 'P', 'Q'],
        edges: [
          { from: 'X', to: 'Y' },
          { from: 'P', to: 'Q' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      const { sorted, hasCycle } = await engine.topologicalSort({ start: ['P', 'X'] });
      expect(hasCycle).toBe(false);
      // Zero-indegree: [P, X]. Lex: P < X. Process P → Q becomes ready.
      // Ready queue: [Q, X]. Q < X → process Q. Then X → Y.
      expect(sorted).toEqual(['P', 'Q', 'X', 'Y']);
    });
  });

  // Determinism: all sources in lex order
  describe('determinism', () => {
    it('zero-indegree nodes dequeued in strict lex order', async () => {
      const fixture = makeFixture({
        nodes: ['E', 'D', 'C', 'B', 'A', 'Z'],
        edges: [
          { from: 'E', to: 'Z' },
          { from: 'D', to: 'Z' },
          { from: 'C', to: 'Z' },
          { from: 'B', to: 'Z' },
          { from: 'A', to: 'Z' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });
      const { sorted } = await engine.topologicalSort({ start: ['A', 'B', 'C', 'D', 'E'] });
      expect(sorted).toEqual(['A', 'B', 'C', 'D', 'E', 'Z']);
    });
  });

  // M7 regression: O(n^2) Array.shift() replaced with two-pointer index
  describe('M7 — two-pointer queue performance', () => {
    it('handles wide fan-out chain without O(n^2) shift overhead', async () => {
      // Build a graph: root -> L0_000..L0_099 -> L1_000..L1_099
      // 201 nodes, 200 edges. BFS discovery queue grows large enough
      // that O(n) shift per dequeue would be measurably slower.
      const nodes = ['root'];
      const edges = [];
      for (let i = 0; i < 100; i++) {
        const l0 = `L0_${String(i).padStart(3, '0')}`;
        const l1 = `L1_${String(i).padStart(3, '0')}`;
        nodes.push(l0, l1);
        edges.push({ from: 'root', to: l0 });
        edges.push({ from: l0, to: l1 });
      }
      const fixture = makeFixture({ nodes, edges });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });

      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'root' });
      expect(hasCycle).toBe(false);
      expect(sorted.length).toBe(201);
      // root first, then all L0_ in lex order, then all L1_ in lex order
      expect(sorted[0]).toBe('root');
      expect(sorted[1]).toBe('L0_000');
      expect(sorted[100]).toBe('L0_099');
      expect(sorted[101]).toBe('L1_000');
      expect(sorted[200]).toBe('L1_099');
    });

    it('newly ready nodes with lex value below current position are still processed', async () => {
      // A -> C -> B (B becomes ready after C is processed; B < C)
      // Ensures the compaction in Phase 2 correctly handles items
      // inserted before the current head position.
      const fixture = makeFixture({
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'C' },
          { from: 'C', to: 'B' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });

      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'A' });
      expect(hasCycle).toBe(false);
      expect(sorted).toEqual(['A', 'C', 'B']);
    });
  });

  // M8→M10: MinHeap replaces sorted-array merge for O(N log N) topo sort
  describe('M10 — MinHeap lex-order correctness', () => {
    it('maintains deterministic lex order when many nodes become ready simultaneously', async () => {
      // Diamond with multiple convergence points:
      // root -> {A, B, C, D, E} each -> sink
      // All 5 become zero-indegree simultaneously after root is processed.
      // After all 5 are processed, sink becomes ready.
      const fixture = makeFixture({
        nodes: ['root', 'A', 'B', 'C', 'D', 'E', 'sink'],
        edges: [
          { from: 'root', to: 'A' },
          { from: 'root', to: 'B' },
          { from: 'root', to: 'C' },
          { from: 'root', to: 'D' },
          { from: 'root', to: 'E' },
          { from: 'A', to: 'sink' },
          { from: 'B', to: 'sink' },
          { from: 'C', to: 'sink' },
          { from: 'D', to: 'sink' },
          { from: 'E', to: 'sink' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });

      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'root' });
      expect(hasCycle).toBe(false);
      expect(sorted).toEqual(['root', 'A', 'B', 'C', 'D', 'E', 'sink']);
    });

    it('interleaves newly ready nodes correctly with existing ready queue', async () => {
      // Graph where processing one node yields newly ready nodes
      // that interleave with existing items in the ready queue.
      // root -> {M, Z}, M -> {A, N}, Z -> {B}
      // After root: ready = [M, Z]
      // Process M: A and N become ready. ready was [Z], merge [A, N] -> [A, N, Z]
      // Process A (leaf). Process N (leaf). Process Z -> B ready. Process B.
      const fixture = makeFixture({
        nodes: ['root', 'M', 'Z', 'A', 'N', 'B'],
        edges: [
          { from: 'root', to: 'M' },
          { from: 'root', to: 'Z' },
          { from: 'M', to: 'A' },
          { from: 'M', to: 'N' },
          { from: 'Z', to: 'B' },
        ],
      });
      const provider = makeAdjacencyProvider(fixture);
      const engine = new GraphTraversal({ provider });

      const { sorted, hasCycle } = await engine.topologicalSort({ start: 'root' });
      expect(hasCycle).toBe(false);
      expect(sorted).toEqual(['root', 'M', 'A', 'N', 'Z', 'B']);
    });
  });

  describe('lightweight mode', () => {
    it('preserves deterministic order without returning adjacency state', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { sorted, hasCycle, _neighborEdgeMap } = await engine.topologicalSort({
        start: 'A',
        _lightweight: true,
      });

      expect(hasCycle).toBe(false);
      expect(sorted).toEqual(['A', 'B', 'C', 'D']);
      expect(_neighborEdgeMap).toBeUndefined();
    });

    it('still provides a cycle witness when lightweight mode throws', async () => {
      const provider = makeAdjacencyProvider(F8_TOPO_CYCLE_3);
      const engine = new GraphTraversal({ provider });

      await expect(engine.topologicalSort({
        start: 'A',
        throwOnCycle: true,
        _lightweight: true,
      })).rejects.toThrow(expect.objectContaining({
        code: 'ERR_GRAPH_HAS_CYCLES',
        context: expect.objectContaining({
          cycleWitness: expect.objectContaining({
            from: expect.any(String),
            to: expect.any(String),
          }),
        }),
      }));
    });

    it('keeps neighbor-edge reuse when adjacency data is requested', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { sorted, _neighborEdgeMap } = await engine.topologicalSort({
        start: 'A',
        _lightweight: true,
        _returnAdjList: true,
      });

      expect(sorted).toEqual(['A', 'B', 'C', 'D']);
      expect(_neighborEdgeMap).toBeInstanceOf(Map);
      expect(_neighborEdgeMap?.get('A')).toEqual([
        { neighborId: 'B', label: '' },
        { neighborId: 'C', label: '' },
      ]);
    });
  });
});
