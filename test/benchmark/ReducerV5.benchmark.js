/**
 * WARP V5 Reducer Benchmark Suite
 *
 * Tests reduceV5 performance at various scales with proper statistical measurement.
 * Uses median of 5 runs after 2 warmup runs for accurate results.
 *
 * Scaling tests: 1K, 5K, 10K, 25K patches
 * Soft targets (warn only): 1K=1s, 5K=3s, 10K=5s, 25K=15s
 * Hard limits (fail CI): 10K=10s only
 */

import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';
import os from 'os';
import { reduceV5, createEmptyStateV5 } from '../../src/domain/services/JoinReducer.js';
import {
  createPatchV2,
  createNodeAddV2,
  createEdgeAddV2,
  createPropSetV2,
} from '../../src/domain/types/WarpTypesV2.js';
import { createInlineValue } from '../../src/domain/types/WarpTypes.js';
import { createDot, encodeDot } from '../../src/domain/crdt/Dot.js';
import { createVersionVector, vvIncrement } from '../../src/domain/crdt/VersionVector.js';
import { orsetElements } from '../../src/domain/crdt/ORSet.js';

// ============================================================================
// Configuration
// ============================================================================

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 5;

// Soft targets (warn only, don't fail)
const SOFT_TARGETS = {
  1000: 1000,    // 1K patches: 1s
  5000: 3000,    // 5K patches: 3s
  10000: 5000,   // 10K patches: 5s
  25000: 15000,  // 25K patches: 15s
};

// Hard limits (fail CI)
const HARD_LIMITS = {
  10000: 10000,  // 10K patches: 10s hard limit
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Logs environment information for reproducibility
 */
function logEnvironment() {
  console.log(`\n  Node.js: ${process.version}`);
  console.log(`  CPU: ${os.cpus()[0].model}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log(`  GC available: ${typeof global.gc === 'function'}`);
}

/**
 * Computes median of an array of numbers
 */
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Forces garbage collection if available
 */
function forceGC() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

/**
 * Generates random hex string
 */
function randomHex(length = 8) {
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ============================================================================
// V5 Patch Generation
// ============================================================================

/**
 * Generates V5 patches with realistic operation mix.
 * Uses multiple writers, proper dot tracking, and varied operations.
 *
 * @param {number} patchCount - Number of patches to generate
 * @param {Object} options - Generation options
 * @returns {Array<{patch: Object, sha: string}>}
 */
function generateV5Patches(patchCount, options = {}) {
  const {
    writerCount = 5,
    opsPerPatch = 3,
    includeRemoves = true,
  } = options;

  const patches = [];
  const writers = Array.from({ length: writerCount }, (_, i) => `writer-${i}`);
  const writerCounters = new Map();
  const nodePool = [];

  for (let i = 0; i < patchCount; i++) {
    const writerIdx = i % writerCount;
    const writer = writers[writerIdx];
    const lamport = Math.floor(i / writerCount) + 1;
    const sha = randomHex(16);

    // Track writer's dot counter
    const currentCounter = writerCounters.get(writer) || 0;
    let nextCounter = currentCounter;

    const ops = [];
    const context = createVersionVector();

    for (let j = 0; j < opsPerPatch; j++) {
      const opType = Math.floor(Math.random() * 100);
      const nodeId = `node-${i}-${j}`;

      if (opType < 40) {
        // 40% - NodeAdd
        nextCounter++;
        const dot = createDot(writer, nextCounter);
        ops.push(createNodeAddV2(nodeId, dot));
        nodePool.push({ id: nodeId, dot: encodeDot(dot) });
      } else if (opType < 60) {
        // 20% - EdgeAdd (if we have nodes)
        if (nodePool.length >= 2) {
          nextCounter++;
          const dot = createDot(writer, nextCounter);
          const from = nodePool[Math.floor(Math.random() * nodePool.length)].id;
          const to = nodePool[Math.floor(Math.random() * nodePool.length)].id;
          ops.push(createEdgeAddV2(from, to, 'link', dot));
        } else {
          // Fall back to NodeAdd if not enough nodes
          nextCounter++;
          const dot = createDot(writer, nextCounter);
          ops.push(createNodeAddV2(nodeId, dot));
          nodePool.push({ id: nodeId, dot: encodeDot(dot) });
        }
      } else if (opType < 80) {
        // 20% - PropSet
        if (nodePool.length > 0) {
          const targetNode = nodePool[Math.floor(Math.random() * nodePool.length)].id;
          ops.push(createPropSetV2(targetNode, `prop-${j}`, createInlineValue(i * opsPerPatch + j)));
        } else {
          // Add node first if pool empty
          nextCounter++;
          const dot = createDot(writer, nextCounter);
          ops.push(createNodeAddV2(nodeId, dot));
          nodePool.push({ id: nodeId, dot: encodeDot(dot) });
        }
      } else if (opType < 90 && includeRemoves) {
        // 10% - NodeRemove (with observed dots)
        if (nodePool.length > 0) {
          const targetIdx = Math.floor(Math.random() * nodePool.length);
          const target = nodePool[targetIdx];
          ops.push({ type: 'NodeRemove', observedDots: new Set([target.dot]) });
          // Remove from pool
          nodePool.splice(targetIdx, 1);
        }
      } else if (includeRemoves) {
        // 10% - EdgeRemove (with empty observedDots - concurrent scenario)
        ops.push({ type: 'EdgeRemove', observedDots: new Set() });
      } else {
        // If removes disabled, fall back to NodeAdd
        nextCounter++;
        const dot = createDot(writer, nextCounter);
        ops.push(createNodeAddV2(nodeId, dot));
        nodePool.push({ id: nodeId, dot: encodeDot(dot) });
      }
    }

    // Update writer counter
    writerCounters.set(writer, nextCounter);

    // Build context from what this writer has observed
    for (const [w, c] of writerCounters) {
      if (c > 0) {
        context.set(w, c);
      }
    }

    patches.push({
      patch: createPatchV2({
        writer,
        lamport,
        context,
        ops,
      }),
      sha,
    });
  }

  return patches;
}

/**
 * Runs a benchmark with warmup and multiple measured runs.
 * Returns statistics about the runs.
 *
 * @param {Function} fn - The function to benchmark
 * @param {number} warmupRuns - Number of warmup runs
 * @param {number} measuredRuns - Number of measured runs
 * @returns {{median: number, min: number, max: number, times: number[]}}
 */
function runBenchmark(fn, warmupRuns = WARMUP_RUNS, measuredRuns = MEASURED_RUNS) {
  // Warmup runs
  for (let i = 0; i < warmupRuns; i++) {
    forceGC();
    fn();
  }

  // Measured runs
  const times = [];
  for (let i = 0; i < measuredRuns; i++) {
    forceGC();
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  return {
    median: median(times),
    min: Math.min(...times),
    max: Math.max(...times),
    times,
  };
}

// ============================================================================
// Benchmark Tests
// ============================================================================

describe('WARP V5 Reducer Performance Benchmarks', () => {
  // Log environment once at start
  it('logs environment info', () => {
    logEnvironment();
    expect(true).toBe(true);
  });

  describe('Full Reduce Scaling', () => {
    it.each([
      [1000, SOFT_TARGETS[1000], HARD_LIMITS[1000]],
      [5000, SOFT_TARGETS[5000], HARD_LIMITS[5000]],
      [10000, SOFT_TARGETS[10000], HARD_LIMITS[10000]],
      [25000, SOFT_TARGETS[25000], HARD_LIMITS[25000]],
    ])('reduces %i V5 patches (soft: %ims, hard: %s)', (patchCount, softTarget, hardLimit) => {
      // Generate patches
      const patches = generateV5Patches(patchCount);

      // Measure memory before
      forceGC();
      const memBefore = process.memoryUsage().heapUsed;

      // Run benchmark
      let state;
      const stats = runBenchmark(() => {
        state = reduceV5(patches);
      });

      // Measure memory after
      const memAfter = process.memoryUsage().heapUsed;
      const memDeltaMB = (memAfter - memBefore) / 1024 / 1024;

      // Log results
      console.log(`\n  ${patchCount} patches:`);
      console.log(`    Median: ${stats.median.toFixed(0)}ms`);
      console.log(`    Min: ${stats.min.toFixed(0)}ms`);
      console.log(`    Max: ${stats.max.toFixed(0)}ms`);
      console.log(`    Heap delta: ${memDeltaMB.toFixed(1)}MB`);
      console.log(`    Nodes alive: ${orsetElements(state.nodeAlive).length}`);

      // Soft target check (warn only)
      if (stats.median > softTarget) {
        console.warn(`    WARNING: Exceeded soft target ${softTarget}ms`);
      }

      // Hard limit check (fail CI)
      if (hardLimit !== undefined) {
        expect(stats.median).toBeLessThan(hardLimit);
      }

      // Verify state is valid
      expect(state).toBeDefined();
      expect(state.nodeAlive).toBeDefined();
      expect(state.edgeAlive).toBeDefined();
    });
  });

  describe('Incremental Reduce', () => {
    it('incremental is faster than full reduce', () => {
      const allPatches = generateV5Patches(5000);
      const checkpointPatches = allPatches.slice(0, 4000);
      const newPatches = allPatches.slice(4000);

      // Full reduce timing
      let stateFull;
      const fullStats = runBenchmark(() => {
        stateFull = reduceV5(allPatches);
      });

      // Incremental: build checkpoint, then apply new patches
      let checkpointState;
      const checkpointStats = runBenchmark(() => {
        checkpointState = reduceV5(checkpointPatches);
      });

      let incrementalState;
      const incrementalStats = runBenchmark(() => {
        incrementalState = reduceV5(newPatches, checkpointState);
      });

      console.log(`\n  Full reduce (5000 patches): ${fullStats.median.toFixed(0)}ms`);
      console.log(`  Checkpoint (4000 patches): ${checkpointStats.median.toFixed(0)}ms`);
      console.log(`  Incremental (1000 patches on checkpoint): ${incrementalStats.median.toFixed(0)}ms`);

      // Incremental on existing state should be much faster than full
      expect(incrementalStats.median).toBeLessThan(fullStats.median / 2);
    });

    it('applying small batch to large state is fast', () => {
      const basePatches = generateV5Patches(10000);
      const newPatches = generateV5Patches(100, { writerCount: 2, opsPerPatch: 2 });

      // Create base state
      const baseState = reduceV5(basePatches);

      // Time incremental apply
      const stats = runBenchmark(() => {
        reduceV5(newPatches, baseState);
      });

      console.log(`\n  100 patches on 10K state: ${stats.median.toFixed(0)}ms`);

      // Should be very fast - just 100 patches
      expect(stats.median).toBeLessThan(500);
    });
  });

  describe('Memory Usage', () => {
    it('10K patches stays under memory limit', () => {
      const patches = generateV5Patches(10000);

      forceGC();
      const memBefore = process.memoryUsage().heapUsed;

      const state = reduceV5(patches);

      forceGC();
      const memAfter = process.memoryUsage().heapUsed;
      const memUsedMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`\n  Memory delta: ${memUsedMB.toFixed(1)}MB`);
      console.log(`  State size: ${orsetElements(state.nodeAlive).length} nodes, ${orsetElements(state.edgeAlive).length} edges`);

      // Should be well under 500MB
      expect(memUsedMB).toBeLessThan(500);
    });
  });

  describe('Determinism at Scale', () => {
    it('shuffled 1K V5 patches produce identical state', () => {
      const patches = generateV5Patches(1000);
      const shuffled = [...patches].sort(() => Math.random() - 0.5);

      const state1 = reduceV5(patches);
      const state2 = reduceV5(shuffled);

      // Compare node alive sets
      const nodes1 = orsetElements(state1.nodeAlive).sort();
      const nodes2 = orsetElements(state2.nodeAlive).sort();

      expect(nodes1).toEqual(nodes2);
      expect(state1.observedFrontier).toEqual(state2.observedFrontier);
    });
  });
});
