import type { ObservationSupportFaultReason } from './ObservationSupportFault.ts';

export type ObservationUnavailableReason = ObservationSupportFaultReason
  | 'not-retained' | 'evidence-unreadable' | 'record-corrupt' | 'core-corrupt' | 'preparation-corrupt';

/**
 * Original evidence could not be returned: it is missing or corrupt, could not be
 * read just now, or lies beyond current limits. It is never repaired, recaptured or reminted.
 */
export default class ObservationUnavailable {
  readonly reason: ObservationUnavailableReason;

  constructor(reason: ObservationUnavailableReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
