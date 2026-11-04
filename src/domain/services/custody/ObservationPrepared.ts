import type ObservationAttempt from './ObservationAttempt.ts';
import type ObservationCustodyRoots from './ObservationCustodyRoots.ts';

/**
 * Original support is retained and was verified if the attempt is still unarmed.
 * This grants no permission: recovering an armed attempt returns this too, and
 * arming it then yields only reconcile-only.
 */
export default class ObservationPrepared {
  readonly attempt: ObservationAttempt;
  readonly roots: ObservationCustodyRoots;

  constructor(attempt: ObservationAttempt, roots: ObservationCustodyRoots) {
    this.attempt = attempt;
    this.roots = roots;
    Object.freeze(this);
  }
}
