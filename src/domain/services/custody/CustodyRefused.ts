import type { CustodyRefusalReason } from './CustodyVocabulary.ts';

/** The store refused a transition for a finite reason. */
export default class CustodyRefused {
  readonly reason: CustodyRefusalReason;

  constructor(reason: CustodyRefusalReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
