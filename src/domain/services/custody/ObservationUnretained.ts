import type ObservationAttempt from './ObservationAttempt.ts';

export type ObservationUnretainedReason = 'evidence-too-large';

/**
 * A publication happened but its evidence cannot be retained. This is not an
 * unapplied write: the producer reports the admitted outcome with no Coordinate,
 * and the attempt keeps its slot, because a charged effect is never reclaimed.
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
