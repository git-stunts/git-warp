import type ObservationAttempt from './ObservationAttempt.ts';

/** Cancellation durably won before arm, so no effect of this attempt can occur. */
export default class ObservationKnownUnpublished {
  readonly attempt: ObservationAttempt;

  constructor(attempt: ObservationAttempt) {
    this.attempt = attempt;
    Object.freeze(this);
  }
}
