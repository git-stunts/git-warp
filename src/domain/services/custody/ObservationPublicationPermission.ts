import type ObservationAttempt from './ObservationAttempt.ts';

/**
 * A fresh `armed` acknowledgement: its holder may perform one publication
 * attempt. Nothing else permits an external effect, and it is never reissued.
 * Only `authorizePublication` issues one; the ledger enforces that, not this class.
 */
export default class ObservationPublicationPermission {
  readonly attempt: ObservationAttempt;

  constructor(attempt: ObservationAttempt) {
    this.attempt = attempt;
    Object.freeze(this);
  }
}
