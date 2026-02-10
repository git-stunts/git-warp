/**
 * WARP V5 Compaction (orsetCompact) Benchmark Suite
 *
 * Tests orsetCompact performance for garbage collection of tombstoned entries.
 * Measures time and memory impact of compaction operations.
 *
 * Scaling tests: 1K, 5K, 10K entries
 * Soft target: 10K entries in 100ms
 */

import { describe, it, expect } from 'vitest';
import {
  createORSet,
  orsetAdd,
  orsetRemove,
  orsetCompact,
  orsetElements,
  orsetContains,
} from '../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../src/domain/crdt/VersionVector.js';
import { logEnvironment, forceGC, runBenchmark } from './benchmarkUtils.js';

// ============================================================================
// Configuration
// ============================================================================

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 5;

// Tombstone ratio - what percentage of entries get removed
const TOMBSTONE_RATIO = 0.3; // 30%

// Soft targets (warn only)
const SOFT_TARGETS = {
  1000: 20,     // 1K entries: 20ms
  5000: 50,     // 5K entries: 50ms
  10000: 100,   // 10K entries: 100ms
};

// ============================================================================
// ORSet Setup Utilities
// ============================================================================

/**
 * Creates an ORSet with the specified number of entries and tombstone ratio.
 * Returns the set, version vector covering all dots, and setup statistics.
 *
 * @param {number} entryCount - Number of elements to add
 * @param {number} tombstoneRatio - Ratio of entries to tombstone (0-1)
 * @returns {{set: any, vv: any, tombstoneCount: number, liveCount: number}}
 */
function createPopulatedORSet(entryCount, tombstoneRatio = TOMBSTONE_RATIO) {
  const set = createORSet();
  const vv = createVersionVector();
  const writers = ['writer-0', 'writer-1', 'writer-2', 'writer-3', 'writer-4'];
  const writerCounters = new Map();
  const addedEntries = [];

  // Add entries
  for (let i = 0; i < entryCount; i++) {
    const writer = writers[i % writers.length];
    const counter = (writerCounters.get(writer) || 0) + 1;
    writerCounters.set(writer, counter);

    const element = `element-${i}`;
    const dot = createDot(writer, counter);

    orsetAdd(set, element, dot);
    addedEntries.push({ element, dot: encodeDot(dot) });
  }

  // Add tombstones for ~30% of entries
  const tombstoneCount = Math.floor(entryCount * tombstoneRatio);
  const toTombstone = new Set();

  // Deterministically select entries to tombstone (every nth)
  const step = Math.floor(entryCount / tombstoneCount) || 1;
  for (let i = 0; i < entryCount && toTombstone.size < tombstoneCount; i += step) {
    toTombstone.add(addedEntries[i].dot);
  }

  // Apply tombstones
  orsetRemove(set, toTombstone);

  // Build version vector covering all dots
  for (const [writer, counter] of writerCounters) {
    vv.set(writer, counter);
  }

  return {
    set,
    vv,
    tombstoneCount: toTombstone.size,
    liveCount: entryCount - toTombstone.size,
  };
}

/**
 * Deep clones an ORSet for isolated benchmarking
 */
/** @param {any} set */
function cloneORSet(set) {
  const clone = createORSet();

  for (const [element, dots] of set.entries) {
    clone.entries.set(element, new Set(dots));
  }

  for (const dot of set.tombstones) {
    clone.tombstones.add(dot);
  }

  return clone;
}

/**
 * Calculates approximate memory size of an ORSet
 */
/** @param {any} set */
function estimateORSetMemory(set) {
  let size = 0;

  // Count entries map
  for (const [element, dots] of set.entries) {
    size += element.length * 2; // element string
    size += dots.size * 20; // rough estimate per encoded dot
  }

  // Count tombstones
  size += set.tombstones.size * 20;

  return size;
}

// ============================================================================
// Benchmark Tests
// ============================================================================

describe('ORSet Compaction Benchmarks', () => {
  // Log environment once at start
  it('logs environment info', () => {
    logEnvironment();
    expect(true).toBe(true);
  });

  describe('Compaction Scaling', () => {
    it.each([
      [1000, SOFT_TARGETS[1000]],
      [5000, SOFT_TARGETS[5000]],
      [10000, SOFT_TARGETS[10000]],
    ])('compacts %i entries with 30%% tombstones (soft: %ims)', async (entryCount, softTarget) => {
      // Create populated ORSet
      const { set: templateSet, vv, tombstoneCount, liveCount } = createPopulatedORSet(entryCount);

      console.log(`\n  ${entryCount} entries (${tombstoneCount} tombstones, ${liveCount} live):`);

      // Measure memory before compaction
      const memBefore = estimateORSetMemory(templateSet);

      // Run benchmark - clone set each time since compaction mutates
      /** @type {any} */
      let compactedSet;
      const stats = await runBenchmark(() => {
        compactedSet = cloneORSet(templateSet);
        orsetCompact(compactedSet, vv);
      }, WARMUP_RUNS, MEASURED_RUNS);

      // Measure memory after compaction
      const memAfter = estimateORSetMemory(compactedSet);
      const memReduction = ((memBefore - memAfter) / memBefore * 100);

      // Log results
      console.log(`    Median: ${stats.median.toFixed(2)}ms`);
      console.log(`    Min: ${stats.min.toFixed(2)}ms`);
      console.log(`    Max: ${stats.max.toFixed(2)}ms`);
      console.log(`    Memory before: ${(memBefore / 1024).toFixed(1)}KB`);
      console.log(`    Memory after: ${(memAfter / 1024).toFixed(1)}KB`);
      console.log(`    Memory reduction: ${memReduction.toFixed(1)}%`);

      // Verify compaction worked correctly
      const elementsAfter = orsetElements(compactedSet).length;
      expect(elementsAfter).toBe(liveCount);

      // Verify tombstones were cleaned up
      expect(compactedSet.tombstones.size).toBe(0);

      // Soft target check (warn only)
      if (stats.median > softTarget) {
        console.warn(`    WARNING: Exceeded soft target ${softTarget}ms`);
      }
    });
  });

  describe('Compaction Correctness', () => {
    it('preserves live elements after compaction', () => {
      const { set, vv, liveCount } = createPopulatedORSet(1000);

      // Get live elements before
      const liveElementsBefore = orsetElements(set).sort();

      // Compact
      orsetCompact(set, vv);

      // Get live elements after
      const liveElementsAfter = orsetElements(set).sort();

      // Should be identical
      expect(liveElementsAfter).toEqual(liveElementsBefore);
      expect(liveElementsAfter.length).toBe(liveCount);
    });

    it('does not remove live dots even when covered by VV', () => {
      const set = createORSet();
      const vv = createVersionVector();

      // Add a live element
      const dot = createDot('writer', 5);
      orsetAdd(set, 'live-element', dot);

      // VV covers the dot
      vv.set('writer', 10);

      // Element should be visible before
      expect(orsetContains(set, 'live-element')).toBe(true);

      // Compact
      orsetCompact(set, vv);

      // Element should STILL be visible - live dots are never compacted
      expect(orsetContains(set, 'live-element')).toBe(true);
    });

    it('removes tombstoned dots within VV', () => {
      const set = createORSet();
      const vv = createVersionVector();

      // Add and remove an element
      const dot = createDot('writer', 5);
      orsetAdd(set, 'removed-element', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      // VV covers the dot
      vv.set('writer', 10);

      // Element should not be visible
      expect(orsetContains(set, 'removed-element')).toBe(false);

      // But it's still in the entries (with tombstone)
      expect(set.entries.has('removed-element')).toBe(true);
      expect(set.tombstones.has(encodeDot(dot))).toBe(true);

      // Compact
      orsetCompact(set, vv);

      // Entry should be completely removed
      expect(set.entries.has('removed-element')).toBe(false);
      expect(set.tombstones.has(encodeDot(dot))).toBe(false);
    });

    it('does not remove tombstoned dots outside VV', () => {
      const set = createORSet();
      const vv = createVersionVector();

      // Add and remove an element
      const dot = createDot('writer', 15);
      orsetAdd(set, 'future-element', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      // VV does NOT cover the dot
      vv.set('writer', 10);

      // Compact
      orsetCompact(set, vv);

      // Entry should still exist (not compacted because dot > vv)
      expect(set.entries.has('future-element')).toBe(true);
      expect(set.tombstones.has(encodeDot(dot))).toBe(true);
    });
  });

  describe('Memory Impact', () => {
    it('compaction significantly reduces memory for tombstoned entries', () => {
      const { set, vv } = createPopulatedORSet(10000, 0.5); // 50% tombstones

      forceGC();
      const heapBefore = process.memoryUsage().heapUsed;

      // Measure internal structure
      const entriesBefore = set.entries.size;
      const tombstonesBefore = set.tombstones.size;

      // Compact
      orsetCompact(set, vv);

      forceGC();
      const heapAfter = process.memoryUsage().heapUsed;

      const entriesAfter = set.entries.size;
      const tombstonesAfter = set.tombstones.size;

      console.log(`\n  10K entries with 50% tombstones:`);
      console.log(`    Entries before: ${entriesBefore}`);
      console.log(`    Entries after: ${entriesAfter}`);
      console.log(`    Tombstones before: ${tombstonesBefore}`);
      console.log(`    Tombstones after: ${tombstonesAfter}`);
      console.log(`    Heap delta: ${((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)}MB`);

      // All tombstones should be cleared
      expect(tombstonesAfter).toBe(0);

      // ~50% of entries should remain
      expect(entriesAfter).toBeLessThan(entriesBefore);
      expect(entriesAfter).toBeGreaterThan(entriesBefore * 0.4);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty ORSet', async () => {
      const set = createORSet();
      const vv = createVersionVector();

      const stats = await runBenchmark(() => {
        orsetCompact(set, vv);
      }, WARMUP_RUNS, MEASURED_RUNS);

      console.log(`\n  Empty ORSet compaction: ${stats.median.toFixed(3)}ms`);

      expect(set.entries.size).toBe(0);
      expect(set.tombstones.size).toBe(0);
    });

    it('handles ORSet with no tombstones', async () => {
      const set = createORSet();
      const vv = createVersionVector();

      // Add elements without removing any
      for (let i = 0; i < 1000; i++) {
        const dot = createDot('writer', i + 1);
        orsetAdd(set, `element-${i}`, dot);
      }
      vv.set('writer', 1000);

      const elementsBefore = orsetElements(set).length;

      const stats = await runBenchmark(() => {
        orsetCompact(cloneORSet(set), vv);
      }, WARMUP_RUNS, MEASURED_RUNS);

      console.log(`\n  1K entries, no tombstones: ${stats.median.toFixed(2)}ms`);

      // No change expected
      expect(orsetElements(set).length).toBe(elementsBefore);
    });

    it('handles ORSet with all entries tombstoned', async () => {
      const { set, vv } = createPopulatedORSet(1000, 1.0); // 100% tombstones

      const stats = await runBenchmark(() => {
        const clone = cloneORSet(set);
        orsetCompact(clone, vv);
      }, WARMUP_RUNS, MEASURED_RUNS);

      // Compact the original
      orsetCompact(set, vv);

      console.log(`\n  1K entries, 100% tombstones: ${stats.median.toFixed(2)}ms`);

      // Everything should be gone
      expect(set.entries.size).toBe(0);
      expect(set.tombstones.size).toBe(0);
      expect(orsetElements(set).length).toBe(0);
    });
  });
});
