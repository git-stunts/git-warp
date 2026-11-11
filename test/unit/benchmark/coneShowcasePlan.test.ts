import { describe, expect, it } from 'vitest';

import GitProcessCount from '../../../benchmarks/cone-showcase/GitProcessCount.ts';
import MarginCorpus, { WRITERS } from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import { Margins } from '../../../benchmarks/cone-showcase/Margins.ts';
import { BULK_THREADS_PER_PATCH, expectedBulkPatches } from '../../../benchmarks/cone-showcase/ScaleRun.ts';
import { ScaleResult } from '../../../benchmarks/cone-showcase/ScaleResult.ts';
import WitnessOutcome from '../../../benchmarks/cone-showcase/WitnessOutcome.ts';
import WitnessSample, { type WitnessPhase } from '../../../benchmarks/cone-showcase/WitnessSample.ts';
import { WITNESS_PLAN } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';
import WorkloadPlan from '../../../benchmarks/cone-showcase/WorkloadPlan.ts';

// Oracle: the decided plan (issue #1099): 117 samples at 200 threads and 225 at
// 2,000, of which 16 and 124 are bulk writes (specified, checked by hand).
const PLAN = [
  { threads: 200, bulk: 16, samples: 117 },
  { threads: 2000, bulk: 124, samples: 225 },
] as const;

/** Bulk batches as the loader forms them: one document batch, then 50 actions per batch per writer and round. */
function loaderBatches(threads: number): number {
  const corpus = new MarginCorpus(threads);
  const batches = (actions: number): number => Math.ceil(actions / BULK_THREADS_PER_PATCH);
  const openings = [...WRITERS.keys()].map((writer) => batches(corpus.openings(writer).length));
  const replies = [...WRITERS.keys()].map((writer) => batches(corpus.replies(writer).length));
  return 1 + [...openings, ...replies].reduce((total, count) => total + count, 0);
}

/** A run in the planned phase order with every sample counted and every read verified. */
function plannedRun(bulk: number, workload: WorkloadPlan): WitnessSample[] {
  const membership = new Margins('d0', new Map());
  const plan: readonly [WitnessPhase, number, WitnessOutcome][] = [
    ['setup', 2, new WitnessOutcome('completed', '')], ['bulk', bulk, new WitnessOutcome('retained', '')],
    ['save', workload.measuredSaves, new WitnessOutcome('retained', '')], ['close', 1, new WitnessOutcome('completed', '')],
    ['setup', 2, new WitnessOutcome('completed', '')], ['margins', workload.marginsReads, new WitnessOutcome('verified', '', membership)],
    ['close', 1, new WitnessOutcome('completed', '')], ['cold', workload.coldOpens, new WitnessOutcome('verified', '', membership)],
  ];
  return plan.flatMap(([phase, total, outcome]) => Array.from({ length: total }, () => outcome)
    .map((each) => ({ phase, outcome: each })))
    .map(({ phase, outcome }, sequence) => new WitnessSample({
      sequence, phase, operation: phase, documentId: 'd0', subjectId: 'd0', count: new GitProcessCount([]), outcome,
    }));
}

describe('cone-showcase run plan', () => {
  it.each(PLAN)('plans $bulk bulk writes at $threads threads, as the loader batches them', ({ threads, bulk }) => {
    expect(expectedBulkPatches(new MarginCorpus(threads), threads)).toBe(bulk);
    expect(loaderBatches(threads)).toBe(bulk);
  });

  it.each(PLAN)('completes with exactly $samples samples at $threads threads', ({ threads, bulk, samples }) => {
    const run = plannedRun(bulk, WITNESS_PLAN);
    expect(run).toHaveLength(samples);
    expect(new ScaleResult(threads, threads / 10, run, bulk, WITNESS_PLAN).isComplete()).toBe(true);
    expect(new ScaleResult(threads, threads / 10, run.slice(0, -1), bulk, WITNESS_PLAN).isComplete()).toBe(false);
  });

  // Oracle: the README completion and read-check contract (specified), applied to the
  // counts of the plan that ran: a smaller plan needs exactly its own samples and reads.
  it('completes a smaller plan with exactly its own samples and planned reads', () => {
    const small = new WorkloadPlan({ measuredSaves: 2, marginsReads: 2, coldOpens: 1 });
    const run = plannedRun(1, small);
    expect(run).toHaveLength(4 + 1 + 2 + 2 + 2 + 1);
    const result = new ScaleResult(1, 1, run, 1, small);
    expect(result.isComplete()).toBe(true);
    expect(result.summary()).toContain('read-check\t1\tverified\t3/3\t-\nscale-end\t1\tcomplete\n');
    expect(new ScaleResult(1, 1, run, 1, WITNESS_PLAN).isComplete()).toBe(false);
    expect(new ScaleResult(200, 20, plannedRun(16, WITNESS_PLAN), 16, small).isComplete()).toBe(false);
  });
});
