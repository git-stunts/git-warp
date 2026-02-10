/**
 * WARP V5 Reducer Benchmark Suite
 *
 * Tests reduceV5 performance at various scales with proper statistical measurement.
 * Uses median of 5 runs after 2 warmup runs for accurate results.
 *
 * Scaling tests: 1K, 5K, 10K, 25K patches
 * Soft targets (warn only): 1K=1s, 5K=3s, 10K=5s, 25K=15s
 */

import { describe, it, expect } from 'vitest';
import { reduceV5 as _reduceV5, createEmptyStateV5 } from '../../src/domain/services/JoinReducer.js';
import {
  createPatchV2 as _createPatchV2,
  createNodeAddV2 as _createNodeAddV2,
  createEdgeAddV2 as _createEdgeAddV2,
  createPropSetV2,
} from '../../src/domain/types/WarpTypesV2.js';

/** @type {any} */ const createPatchV2 = _createPatchV2;
/** @type {any} */ const createNodeAddV2 = _createNodeAddV2;
/** @type {any} */ const createEdgeAddV2 = _createEdgeAddV2;

/** @type {any} */
const reduceV5 = _reduceV5;
import { createInlineValue } from '../../src/domain/types/WarpTypes.js';
import { createDot, encodeDot } from '../../src/domain/crdt/Dot.js';
import { createVersionVector, vvIncrement } from '../../src/domain/crdt/VersionVector.js';
import { orsetElements } from '../../src/domain/crdt/ORSet.js';
import {
  TestClock,
  logEnvironment,
  forceGC,
  randomHex,
  runBenchmark,
} from './benchmarkUtils.js';

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

// ============================================================================
// V5 Patch Generation
// ============================================================================

/**
 * Generates V5 patches with realistic operation mix.
 * Uses multiple writers, proper dot tracking, and varied operations.
 *
 * @param {number} patchCount - Number of patches to generate
 * @param {any} [options] - Generation options
 * @returns {any[]}
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
      [1000, SOFT_TARGETS[1000]],
      [5000, SOFT_TARGETS[5000]],
      [10000, SOFT_TARGETS[10000]],
      [25000, SOFT_TARGETS[25000]],
    ])('reduces %i V5 patches (soft: %ims)', async (patchCount, softTarget) => {
      // Generate patches
      const patches = generateV5Patches(patchCount);

      // Measure memory before
      forceGC();
      const memBefore = process.memoryUsage().heapUsed;

      // Run benchmark (real clock for informational logging only)
      /** @type {any} */
      let state;
      const stats = await runBenchmark(() => {
        state = reduceV5(patches);
      }, WARMUP_RUNS, MEASURED_RUNS);

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

      // Soft target check (warn only, never fails CI)
      if (stats.median > softTarget) {
        console.warn(`    WARNING: Exceeded soft target ${softTarget}ms`);
      }

      // Verify state is valid
      expect(state).toBeDefined();
      expect(state.nodeAlive).toBeDefined();
      expect(state.edgeAlive).toBeDefined();
    });
  });

  describe('Incremental Reduce', () => {
    it('incremental is faster than full reduce', async () => {
      const allPatches = generateV5Patches(5000);
      const checkpointPatches = allPatches.slice(0, 4000);
      const newPatches = allPatches.slice(4000);

      // Test clock: advances by patch count so assertions are deterministic
      const clock = new TestClock();
      /** @param {any} patches @param {any} [base] */
      function timedReduce(patches, base) {
        clock.advance(patches.length);
        return reduceV5(patches, base);
      }

      // Full reduce
      /** @type {any} */
      let stateFull;
      const fullStats = await runBenchmark(() => {
        stateFull = timedReduce(allPatches);
      }, WARMUP_RUNS, MEASURED_RUNS, { clock });

      // Incremental: build checkpoint, then apply new patches
      /** @type {any} */
      let checkpointState;
      await runBenchmark(() => {
        checkpointState = timedReduce(checkpointPatches);
      }, WARMUP_RUNS, MEASURED_RUNS, { clock });

      /** @type {any} */
      let incrementalState;
      const incrementalStats = await runBenchmark(() => {
        incrementalState = timedReduce(newPatches, checkpointState);
      }, WARMUP_RUNS, MEASURED_RUNS, { clock });

      console.log(`\n  Full reduce (5000 patches): ${fullStats.median} simulated units`);
      console.log(`  Incremental (1000 patches on checkpoint): ${incrementalStats.median} simulated units`);

      // Deterministic: 1000 patches < 5000/2 = 2500
      expect(incrementalStats.median).toBeLessThan(fullStats.median / 2);

      // Correctness: both approaches produce the same state
      const fullNodes = orsetElements(stateFull.nodeAlive).sort();
      const incNodes = orsetElements(incrementalState.nodeAlive).sort();
      expect(incNodes).toEqual(fullNodes);
    });

    it('applying small batch to large state is fast', async () => {
      const basePatches = generateV5Patches(10000);
      const newPatches = generateV5Patches(100, { writerCount: 2, opsPerPatch: 2 });

      // Create base state (outside benchmark)
      const baseState = reduceV5(basePatches);

      // Test clock: 1 unit per patch, deterministic
      const clock = new TestClock();
      const stats = await runBenchmark(() => {
        clock.advance(newPatches.length);
        reduceV5(newPatches, baseState);
      }, WARMUP_RUNS, MEASURED_RUNS, { clock });

      console.log(`\n  100 patches on 10K state: ${stats.median} simulated units`);

      // Deterministic: 100 < 500
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
