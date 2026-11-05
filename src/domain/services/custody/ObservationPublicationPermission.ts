import type ObservationAttempt from './ObservationAttempt.ts';

/**
 * A fresh `armed` acknowledgement: its holder may perform one publication
 * attempt. Nothing else permits an external effect, and it is never reissued.
 * Only `authorizePublication` issues one by protocol; nothing stops a caller
 * constructing another. The ledger is what allows a single arm.
 */
export default class ObservationPublicationPermission {
  readonly attempt: ObservationAttempt;

  constructor(attempt: ObservationAttempt) {
    this.attempt = attempt;
    Object.freeze(this);
  }
}
