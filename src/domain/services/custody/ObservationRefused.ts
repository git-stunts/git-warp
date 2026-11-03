import type { CustodyRefusalReason } from './CustodyVocabulary.ts';
import type { ObservationSupportRefusalReason } from './ObservationSupportRefused.ts';

export type ObservationRefusalReason = CustodyRefusalReason | ObservationSupportRefusalReason | 'not-armed';

/** A transition was refused. Previously issued observations are untouched. */
export default class ObservationRefused {
  readonly reason: ObservationRefusalReason;

  constructor(reason: ObservationRefusalReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
