import type ObservationAttempt from './ObservationAttempt.ts';
import type ObservationCustodyRoots from './ObservationCustodyRoots.ts';

/** Original support is retained. Permission has not been issued. */
export default class ObservationPrepared {
  readonly attempt: ObservationAttempt;
  readonly roots: ObservationCustodyRoots;

  constructor(attempt: ObservationAttempt, roots: ObservationCustodyRoots) {
    this.attempt = attempt;
    this.roots = roots;
    Object.freeze(this);
  }
}
