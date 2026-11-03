import type ObservationAttempt from './ObservationAttempt.ts';

/**
 * The original effect may be in flight or may have occurred. Inspect and
 * reconcile its evidence; never publish again.
 */
export default class ObservationReconcileOnly {
  readonly attempt: ObservationAttempt;

  constructor(attempt: ObservationAttempt) {
    this.attempt = attempt;
    Object.freeze(this);
  }
}
