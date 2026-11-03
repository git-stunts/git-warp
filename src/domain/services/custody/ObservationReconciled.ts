import type { CustodyPhase } from './CustodyVocabulary.ts';

/** Storage transitions are complete up to this phase. Nothing was armed or executed. */
export default class ObservationReconciled {
  readonly phase: CustodyPhase;

  constructor(phase: CustodyPhase) {
    this.phase = phase;
    Object.freeze(this);
  }
}
