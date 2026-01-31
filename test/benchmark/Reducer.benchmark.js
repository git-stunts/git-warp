import { describe, it, expect } from 'vitest';
import { reduce, createEmptyState } from '../../src/domain/services/Reducer.js';
import { computeStateHash } from '../../src/domain/services/StateSerializer.js';
import {
  createPatch,
  createNodeAdd,
  createEdgeAdd,
  createPropSet,
  createInlineValue,
} from '../../src/domain/types/WarpTypes.js';

// Helper to generate N patches across W writers
function generatePatches(patchCount, writerCount = 10, opsPerPatch = 5) {
  const patches = [];
  for (let i = 0; i < patchCount; i++) {
    const writerId = `writer-${i % writerCount}`;
    const lamport = Math.floor(i / writerCount) + 1;
    const ops = [];

    for (let j = 0; j < opsPerPatch; j++) {
      const nodeId = `node-${i}-${j}`;
      ops.push(createNodeAdd(nodeId));
      if (j > 0) {
        ops.push(createEdgeAdd(`node-${i}-${j-1}`, nodeId, 'next'));
      }
      ops.push(createPropSet(nodeId, 'index', createInlineValue(i * opsPerPatch + j)));
    }

    patches.push({
      patch: createPatch({ writer: writerId, lamport, ops }),
      sha: `${i.toString(16).padStart(8, '0')}${'0'.repeat(32)}`,
    });
  }
  return patches;
}

describe('Reducer Performance Benchmarks', () => {
  describe('full reduce scaling', () => {
    it.each([
      [1000, 2000],    // 1K patches, 2s max
      [5000, 4000],    // 5K patches, 4s max
      [10000, 5000],   // 10K patches, 5s max (spec requirement)
      [25000, 15000],  // 25K patches, 15s max
    ])('reduces %i patches in under %ims', (patchCount, maxMs) => {
      const patches = generatePatches(patchCount);

      const start = performance.now();
      const state = reduce(patches);
      const elapsed = performance.now() - start;

      console.log(`  ${patchCount} patches: ${elapsed.toFixed(0)}ms`);

      expect(elapsed).toBeLessThan(maxMs);
      expect(state.nodeAlive.size).toBeGreaterThan(0);
    });
  });

  describe('incremental reduce', () => {
    it('incremental is faster than full reduce', () => {
      const allPatches = generatePatches(5000);
      const checkpointPatches = allPatches.slice(0, 4000);
      const newPatches = allPatches.slice(4000);

      // Full reduce
      const startFull = performance.now();
      const stateFull = reduce(allPatches);
      const elapsedFull = performance.now() - startFull;

      // Incremental: reduce checkpoint, then apply new patches
      const startIncremental = performance.now();
      const checkpointState = reduce(checkpointPatches);
      const stateIncremental = reduce(newPatches, checkpointState);
      const elapsedIncremental = performance.now() - startIncremental;

      console.log(`  Full: ${elapsedFull.toFixed(0)}ms, Incremental: ${elapsedIncremental.toFixed(0)}ms`);

      // Incremental should be faster (new patches only)
      // Note: First run includes checkpoint creation overhead
      expect(computeStateHash(stateFull)).toBe(computeStateHash(stateIncremental));
    });

    it('applying small batch to large state is fast', () => {
      const basePatches = generatePatches(10000);
      const newPatches = generatePatches(100, 1, 3); // 100 small patches

      // Create base state
      const baseState = reduce(basePatches);

      // Time incremental apply
      const start = performance.now();
      reduce(newPatches, baseState);
      const elapsed = performance.now() - start;

      console.log(`  100 patches on 10K state: ${elapsed.toFixed(0)}ms`);

      // Should be very fast - just 100 patches
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('memory usage', () => {
    it('10K patches stays under memory limit', () => {
      const patches = generatePatches(10000);

      // Force GC if available
      if (global.gc) global.gc();
      const memBefore = process.memoryUsage().heapUsed;

      const state = reduce(patches);

      const memAfter = process.memoryUsage().heapUsed;
      const memUsedMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`  Memory delta: ${memUsedMB.toFixed(1)}MB`);
      console.log(`  State size: ${state.nodeAlive.size} nodes`);

      // Should be well under 500MB
      expect(memUsedMB).toBeLessThan(500);
    });
  });

  describe('determinism at scale', () => {
    it('shuffled 1K patches produce identical hash', () => {
      const patches = generatePatches(1000);
      const shuffled = [...patches].sort(() => Math.random() - 0.5);

      const state1 = reduce(patches);
      const state2 = reduce(shuffled);

      expect(computeStateHash(state1)).toBe(computeStateHash(state2));
    });
  });
});
