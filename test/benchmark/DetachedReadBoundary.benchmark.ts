/**
 * Detached Read Boundary Benchmark Suite
 *
 * Measures the steady-state cost of detached coordinate and strand reads
 * against a warm live materialization baseline over the same seeded history.
 *
 * This suite is informational. It logs medians and ratios, but it does not
 * turn benchmark output into hard CI gates.
 */

import { describe, it, expect } from 'vitest';
import { logEnvironment, runBenchmark } from './benchmarkUtils.ts';
import {
  DETACHED_READ_BENCHMARK_SCALES,
  seedDetachedReadBenchmarkFixture,
} from './detachedReadBenchmark.fixture.ts';

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {string}
 */
function formatRatio(numerator, denominator) {
  if (denominator === 0) {
    return 'n/a';
  }
  return `${(numerator / denominator).toFixed(2)}x`;
}

describe('Detached Read Boundary Benchmarks', () => {
  it('logs environment info', () => {
    logEnvironment();
    expect(true).toBe(true);
  });

  for (const patchCount of DETACHED_READ_BENCHMARK_SCALES) {
    it(`measures live, coordinate, and strand reads at ${patchCount} patches`, async () => {
      const fixture: { graph: any; coordinateSource: any; strandId: any; captureAt: number; overlayPatchCount: number } = await seedDetachedReadBenchmarkFixture({ patchCount }) as any;

      const liveStats = await runBenchmark(
        async () => {
          await fixture.graph.materialize();
        },
        WARMUP_RUNS,
        MEASURED_RUNS,
      );

      const coordinateStats = await runBenchmark(
        async () => {
          await fixture.graph.materializeCoordinate(fixture.coordinateSource);
        },
        WARMUP_RUNS,
        MEASURED_RUNS,
      );

      const strandStats = await runBenchmark(
        async () => {
          await fixture.graph.materializeStrand(fixture.strandId);
        },
        WARMUP_RUNS,
        MEASURED_RUNS,
      );

      console.log(`\n  ${patchCount} patches:`);
      console.log(`    live median: ${liveStats.median.toFixed(2)}ms`);
      console.log(`    coordinate median: ${coordinateStats.median.toFixed(2)}ms (${formatRatio(coordinateStats.median, liveStats.median)} vs live)`);
      console.log(`    strand median: ${strandStats.median.toFixed(2)}ms (${formatRatio(strandStats.median, liveStats.median)} vs live)`);
      console.log(`    coordinate range: ${coordinateStats.min.toFixed(2)}ms -> ${coordinateStats.max.toFixed(2)}ms`);
      console.log(`    strand range: ${strandStats.min.toFixed(2)}ms -> ${strandStats.max.toFixed(2)}ms`);

      expect(liveStats.median).toBeGreaterThanOrEqual(0);
      expect(coordinateStats.median).toBeGreaterThanOrEqual(0);
      expect(strandStats.median).toBeGreaterThanOrEqual(0);
    }, 120_000);
  }
});
