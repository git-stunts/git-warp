import CountSpread from './CountSpread.ts';
import type WitnessSample from './WitnessSample.ts';

/** Aggregates derived exclusively from the retained per-operation samples. */
export default class PhaseCounts {
  readonly samples: number;
  readonly measured: number;
  readonly gitProcesses: CountSpread;
  readonly results: ReadonlyMap<string, number>;

  constructor(samples: readonly WitnessSample[]) {
    this.samples = samples.length;
    const counts = samples.flatMap((sample) => sample.count === null ? [] : [sample.count.total]);
    this.measured = counts.length;
    this.gitProcesses = new CountSpread(counts);
    const results = new Map<string, number>();
    for (const sample of samples) {
      results.set(sample.outcome.status, (results.get(sample.outcome.status) ?? 0) + 1);
    }
    this.results = results;
    Object.freeze(this);
  }
}
