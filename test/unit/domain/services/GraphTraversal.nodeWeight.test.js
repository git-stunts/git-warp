import { describe, it, expect, vi } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/query/GraphTraversal.ts';
import {
  F14_NODE_WEIGHTED_DAG,
  F14_NODE_WEIGHTS,
  makeAdjacencyProvider,
  makeNodeWeightFn,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal — nodeWeightFn', () => {
  /** @returns {GraphTraversal} */
  function engine() {
    return new GraphTraversal({ provider: makeAdjacencyProvider(F14_NODE_WEIGHTED_DAG) });
  }

  const nodeWeightFn = makeNodeWeightFn(F14_NODE_WEIGHTS);

  // ── Shortest path algorithms ────────────────────────────────────────────

  it('weightedShortestPath picks cheapest node-weighted path', async () => {
    const result = await engine().weightedShortestPath({
      start: 'START', goal: 'END', nodeWeightFn,
    });
    expect(result.path).toEqual(['START', 'A', 'C', 'END']);
    expect(result.totalCost).toBe(5);
  });

  it('aStarSearch picks cheapest node-weighted path', async () => {
    const result = await engine().aStarSearch({
      start: 'START', goal: 'END', nodeWeightFn,
    });
    expect(result.path).toEqual(['START', 'A', 'C', 'END']);
    expect(result.totalCost).toBe(5);
  });

  it('bidirectionalAStar picks cheapest node-weighted path', async () => {
    const result = await engine().bidirectionalAStar({
      start: 'START', goal: 'END', nodeWeightFn,
    });
    expect(result.path).toEqual(['START', 'A', 'C', 'END']);
    expect(result.totalCost).toBe(5);
  });

  // ── Longest path ────────────────────────────────────────────────────────

  it('weightedLongestPath picks longest node-weighted path', async () => {
    const result = await engine().weightedLongestPath({
      start: 'START', goal: 'END', nodeWeightFn,
    });
    expect(result.path).toEqual(['START', 'B', 'C', 'END']);
    expect(result.totalCost).toBe(7);
  });

  // ── Mutual exclusion ───────────────────────────────────────────────────

  it('throws E_WEIGHT_FN_CONFLICT when both weightFn and nodeWeightFn provided', async () => {
    await expect(
      engine().weightedShortestPath({
        start: 'START',
        goal: 'END',
        weightFn: () => 1,
        nodeWeightFn: () => 1,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'E_WEIGHT_FN_CONFLICT' }));
  });

  // ── Async nodeWeightFn ─────────────────────────────────────────────────

  it('supports async nodeWeightFn', async () => {
    const asyncWeightFn = async (/** @type {string} */ nodeId) => {
      return F14_NODE_WEIGHTS.get(nodeId) ?? 1;
    };

    const result = await engine().weightedShortestPath({
      start: 'START', goal: 'END', nodeWeightFn: asyncWeightFn,
    });
    expect(result.path).toEqual(['START', 'A', 'C', 'END']);
    expect(result.totalCost).toBe(5);
  });

  // ── Memoization ────────────────────────────────────────────────────────

  it('memoizes: each node resolved at most once', async () => {
    const spy = vi.fn(makeNodeWeightFn(F14_NODE_WEIGHTS));

    await engine().weightedShortestPath({
      start: 'START', goal: 'END', nodeWeightFn: spy,
    });

    // Each node should be called at most once (memoized)
    const calledWith = spy.mock.calls.map((c) => c[0]);
    const uniqueCalls = new Set(calledWith);
    expect(calledWith.length).toBe(uniqueCalls.size);
  });

  // ── Default (neither provided) ─────────────────────────────────────────

  it('uses uniform weight 1 when neither weightFn nor nodeWeightFn provided', async () => {
    const result = await engine().weightedShortestPath({
      start: 'START', goal: 'END',
    });
    // All edges have weight 1, shortest path has fewest hops
    // START→A→C→END = 3 hops, START→B→C→END = 3 hops — tie-break: A < B
    expect(result.path).toEqual(['START', 'A', 'C', 'END']);
    expect(result.totalCost).toBe(3);
  });
});
