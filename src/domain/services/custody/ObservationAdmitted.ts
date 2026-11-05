import type { CustodyPhase } from './CustodyVocabulary.ts';
import type ObservationAttempt from './ObservationAttempt.ts';

/** Capacity exists for this attempt. No publication or durable Coordinate is claimed. */
export default class ObservationAdmitted {
  readonly attempt: ObservationAttempt;
  /** Where a recovered attempt had reached; a fresh attempt is `reserved`. */
  readonly phase: CustodyPhase;

  constructor(attempt: ObservationAttempt, phase: CustodyPhase) {
    this.attempt = attempt;
    this.phase = phase;
    Object.freeze(this);
  }
}
