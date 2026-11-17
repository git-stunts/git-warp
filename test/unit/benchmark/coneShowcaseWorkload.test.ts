import { describe, expect, it } from 'vitest';

import MarginCorpus, { THREADS_PER_DOCUMENT, WRITERS } from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import {
  BULK_THREADS_PER_PATCH, COLD_OPENS, CORPUS_SEED, MARGINS_READS, MEASURED_SAVES, WITNESS_PLAN,
} from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';
import WorkloadPlan from '../../../benchmarks/cone-showcase/WorkloadPlan.ts';

describe('cone-showcase workload sizes', () => {
  // Oracle: the README workload (specified): three writers, ten initial threads per
  // document, one comment plus two replies per thread, 60 saves, 30 warm reads, five cold reads.
  it('runs the workload the README states', () => {
    expect([WRITERS.length, THREADS_PER_DOCUMENT, MEASURED_SAVES, MARGINS_READS, COLD_OPENS]).toEqual([3, 10, 60, 30, 5]);
    const corpus = new MarginCorpus(200);
    expect(corpus.documents).toHaveLength(20);
    const loaded = [...WRITERS.keys()].flatMap((writer) => corpus.replies(writer));
    expect(loaded).toHaveLength(400);
    expect(corpus.documents.flatMap((documentId) => corpus.threadsOf(documentId))
      .every((thread) => corpus.commentsOf(thread).length === 3)).toBe(true);
  });

  // Oracle: the README workload (specified): the witness plan is 60 saves, 30 warm
  // reads and five cold reads, so the read check plans 35 reads.
  it('plans the README workload for the witness', () => {
    expect([WITNESS_PLAN.measuredSaves, WITNESS_PLAN.marginsReads, WITNESS_PLAN.coldOpens, WITNESS_PLAN.plannedReads])
      .toEqual([60, 30, 5, 35]);
    expect(Object.isFrozen(WITNESS_PLAN)).toBe(true);
  });

  it.each([
    { measuredSaves: 0, marginsReads: 1, coldOpens: 1 },
    { measuredSaves: 1, marginsReads: 0, coldOpens: 1 },
    { measuredSaves: 1, marginsReads: 1, coldOpens: 0 },
    { measuredSaves: 1.5, marginsReads: 1, coldOpens: 1 },
    { measuredSaves: 1, marginsReads: Number.NaN, coldOpens: 1 },
    { measuredSaves: 1, marginsReads: 1, coldOpens: Number.MAX_SAFE_INTEGER + 1 },
  ])('refuses a workload plan without a positive whole count of each operation: %o', (counts) => {
    expect(() => new WorkloadPlan(counts)).toThrow('a workload plan needs a positive whole count of each operation');
  });

  // Oracle: change detection. The reported run figures were drawn from this seed and
  // this bulk batch size (the plan test derives 16 and 124 bulk writes from it).
  it('keeps the seed and batch size of the reported runs', () => {
    expect([CORPUS_SEED, BULK_THREADS_PER_PATCH]).toEqual([0x1099, 50]);
  });
});
