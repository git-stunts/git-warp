import type { CustodyRefusalReason } from './CustodyVocabulary.ts';
import type { ObservationSupportRefusalReason } from './ObservationSupportRefused.ts';

export type ObservationRefusalReason = CustodyRefusalReason | ObservationSupportRefusalReason | 'evidence-too-large' | 'support-unverified';

/** A transition was refused. Previously issued observations are untouched. */
export default class ObservationRefused {
  readonly reason: ObservationRefusalReason;

  constructor(reason: ObservationRefusalReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
