import type { CustodyPhase } from './CustodyVocabulary.ts';

/** The ledger's view of one attempt. It is not a publication permission. */
export default class CustodyInspection {
  readonly phase: CustodyPhase;
  readonly charged: number;
  readonly limit: number;

  constructor(options: { readonly phase: CustodyPhase; readonly charged: number; readonly limit: number }) {
    this.phase = options.phase;
    this.charged = options.charged;
    this.limit = options.limit;
    Object.freeze(this);
  }
}
