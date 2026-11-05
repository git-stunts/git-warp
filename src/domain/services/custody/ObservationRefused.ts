import type { CustodyRefusalReason } from './CustodyVocabulary.ts';
import type { ObservationSupportRefusalReason } from './ObservationSupportRefused.ts';

export type ObservationRefusalReason = CustodyRefusalReason | ObservationSupportRefusalReason | 'evidence-too-large' | 'evidence-undecodable' | 'support-unverified' | 'support-limit' | 'preparation-unencodable' | 'not-armed';

/**
 * A transition was refused and nothing was published by it. Previously issued
 * observations are untouched. A refused admission holds no slot. Otherwise the
 * attempt stays charged, and only a successful `cancel`, while unarmed, frees it.
 */
export default class ObservationRefused {
  readonly reason: ObservationRefusalReason;

  constructor(reason: ObservationRefusalReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
