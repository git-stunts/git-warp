import { describe, expect, it } from 'vitest';

import MarginCorpus, { THREADS_PER_DOCUMENT, WRITERS } from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import {
  BULK_THREADS_PER_PATCH, COLD_OPENS, CORPUS_SEED, MARGINS_READS, MEASURED_SAVES,
} from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';

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

  // Oracle: change detection. The reported run figures were drawn from this seed and
  // this bulk batch size (the plan test derives 16 and 124 bulk writes from it).
  it('keeps the seed and batch size of the reported runs', () => {
    expect([CORPUS_SEED, BULK_THREADS_PER_PATCH]).toEqual([0x1099, 50]);
  });
});
