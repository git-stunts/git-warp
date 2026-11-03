import type { CustodyPhase } from './CustodyVocabulary.ts';
import type ObservationCustodyPage from './ObservationCustodyPage.ts';

/** Acknowledged evidence read back from custody. */
export default class CustodyEvidence {
  readonly phase: CustodyPhase;
  readonly page: ObservationCustodyPage;

  constructor(phase: CustodyPhase, page: ObservationCustodyPage) {
    this.phase = phase;
    this.page = page;
    Object.freeze(this);
  }
}
