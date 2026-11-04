import type ObservationAttempt from './ObservationAttempt.ts';

/** Cancellation durably won before arm, so this attempt never publishes or completes. */
export default class ObservationKnownUnpublished {
  readonly attempt: ObservationAttempt;

  constructor(attempt: ObservationAttempt) {
    this.attempt = attempt;
    Object.freeze(this);
  }
}
