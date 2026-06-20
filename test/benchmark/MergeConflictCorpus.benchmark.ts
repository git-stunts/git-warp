import { describe, expect, it } from 'vitest';

import {
  MERGE_CONFLICT_CORPUS,
  summarizeMergeConflictCorpus,
} from '../fixtures/mergeConflictCorpus.ts';
import { logEnvironment, runBenchmark } from './benchmarkUtils.ts';

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;

function projectionCases() {
  return MERGE_CONFLICT_CORPUS.filter((item) => item.classification === 'projection');
}

function policyCases() {
  return MERGE_CONFLICT_CORPUS.filter((item) => !item.liftingRemovesConflict);
}

describe('Merge Conflict Corpus Benchmark', () => {
  it('logs environment info', () => {
    logEnvironment();
    expect(true).toBe(true);
  });

  it('measures corpus summarization and filter passes', async () => {
    const summaryStats = await runBenchmark(
      () => {
        summarizeMergeConflictCorpus();
      },
      WARMUP_RUNS,
      MEASURED_RUNS,
    );
    const projectionStats = await runBenchmark(
      () => {
        projectionCases();
      },
      WARMUP_RUNS,
      MEASURED_RUNS,
    );
    const policyStats = await runBenchmark(
      () => {
        policyCases();
      },
      WARMUP_RUNS,
      MEASURED_RUNS,
    );

    const summary = summarizeMergeConflictCorpus();
    console.log('\n  merge conflict corpus:');
    console.log(`    cases: ${summary.total}`);
    console.log(`    projection/semantic/governance: ${summary.projection}/${summary.semantic}/${summary.governance}`);
    console.log(`    lifted away: ${summary.liftedAway}`);
    console.log(`    requires policy: ${summary.requiresPolicy}`);
    console.log(`    summarize median: ${summaryStats.median.toFixed(3)}ms`);
    console.log(`    projection filter median: ${projectionStats.median.toFixed(3)}ms`);
    console.log(`    policy filter median: ${policyStats.median.toFixed(3)}ms`);

    expect(summary.total).toBe(MERGE_CONFLICT_CORPUS.length);
    expect(summaryStats.median).toBeGreaterThanOrEqual(0);
    expect(projectionStats.median).toBeGreaterThanOrEqual(0);
    expect(policyStats.median).toBeGreaterThanOrEqual(0);
  });
});
