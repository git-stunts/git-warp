import type ObservationAttempt from './ObservationAttempt.ts';

/**
 * The original effect may be in flight or may have occurred. Reconcile the
 * attempt, and settle it if its publication is established; never publish again.
 */
export default class ObservationReconcileOnly {
  readonly attempt: ObservationAttempt;

  constructor(attempt: ObservationAttempt) {
    this.attempt = attempt;
    Object.freeze(this);
  }
}
