/**
 * Shared benchmark utilities.
 *
 * Provides deterministic test clocks, statistical helpers, and benchmark
 * harness used across all benchmark suites.
 */

import { performance } from 'perf_hooks';
import os from 'os';

// ============================================================================
// Test Clock
// ============================================================================

/**
 * Deterministic test clock for timing assertions.
 * Advances only when explicitly told to, making tests independent
 * of actual CPU performance and system load.
 */
export class TestClock {
  constructor() {
    this._time = 0;
  }
  now() {
    return this._time;
  }
  advance(/** @type {number} */ ms) {
    this._time += ms;
  }
}

// ============================================================================
// Statistical Helpers
// ============================================================================

/**
 * Computes median of an array of numbers.
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================================
// Environment
// ============================================================================

/**
 * Logs environment information for reproducibility.
 */
export function logEnvironment() {
  console.log(`\n  Node.js: ${process.version}`);
  console.log(`  CPU: ${os.cpus()[0].model}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log(`  GC available: ${typeof global.gc === 'function'}`);
}

/**
 * Forces garbage collection if available.
 */
export function forceGC() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

// ============================================================================
// Random Data
// ============================================================================

/**
 * Generates random hex string.
 * @param {number} length
 * @returns {string}
 */
export function randomHex(length = 8) {
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ============================================================================
// Benchmark Harness
// ============================================================================

/**
 * Runs a benchmark with warmup and multiple measured runs.
 *
 * @param {Function} fn - The function to benchmark
 * @param {number} [warmupRuns=2] - Number of warmup runs
 * @param {number} [measuredRuns=5] - Number of measured runs
 * @param {Object} [options]
 * @param {{now(): number}} [options.clock] - Injectable clock (defaults to performance)
 * @returns {Promise<{median: number, min: number, max: number, times: number[]}>}
 */
export async function runBenchmark(fn, warmupRuns = 2, measuredRuns = 5, { clock } = {}) {
  const clk = clock || performance;

  // Warmup runs
  for (let i = 0; i < warmupRuns; i++) {
    forceGC();
    await fn();
  }

  // Measured runs
  const times = [];
  for (let i = 0; i < measuredRuns; i++) {
    forceGC();
    const start = clk.now();
    await fn();
    times.push(clk.now() - start);
  }

  return {
    median: median(times),
    min: Math.min(...times),
    max: Math.max(...times),
    times,
  };
}
