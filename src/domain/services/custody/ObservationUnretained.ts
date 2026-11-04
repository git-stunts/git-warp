import type ObservationAttempt from './ObservationAttempt.ts';

export type ObservationUnretainedReason =
  | 'evidence-too-large' | 'evidence-undecodable' | 'settlement-refused' | 'settlement-unacknowledged' | 'settlement-unverified';

/**
 * A publication happened but no Coordinate was issued for it. This is not an
 * unapplied write: the producer reports the admitted outcome, and the attempt keeps
 * its slot, because a charged effect is never reclaimed. Too-large and undecodable
 * evidence can never retain. After the other reasons, `settle` may be repeated with
 * the identical outcome, and `recoverCoordinate` may find a settlement that landed.
 */
export default class ObservationUnretained {
  readonly attempt: ObservationAttempt;
  readonly reason: ObservationUnretainedReason;

  constructor(attempt: ObservationAttempt, reason: ObservationUnretainedReason) {
    this.attempt = attempt;
    this.reason = reason;
    Object.freeze(this);
  }
}
