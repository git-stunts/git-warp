import type { CustodyAcknowledgedStatus, CustodyPhase } from './CustodyVocabulary.ts';

/** A durable custody transition the store acknowledged. */
export default class CustodyAcknowledged {
  readonly status: CustodyAcknowledgedStatus;
  readonly phase: CustodyPhase;

  constructor(status: CustodyAcknowledgedStatus, phase: CustodyPhase) {
    this.status = status;
    this.phase = phase;
    Object.freeze(this);
  }
}
