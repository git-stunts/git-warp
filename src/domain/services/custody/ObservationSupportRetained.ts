import type ObservationCustodyRoots from './ObservationCustodyRoots.ts';
import type ObservationSupportSummary from './ObservationSupportSummary.ts';

/** Every required edge exists, and these roots keep them reachable. */
export default class ObservationSupportRetained {
  readonly roots: ObservationCustodyRoots;
  readonly summary: ObservationSupportSummary;

  constructor(roots: ObservationCustodyRoots, summary: ObservationSupportSummary) {
    this.roots = roots;
    this.summary = summary;
    Object.freeze(this);
  }
}
