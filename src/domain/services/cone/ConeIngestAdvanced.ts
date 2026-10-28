import type ConeBasis from './ConeBasis.ts';
import ConeIngestOutcome from './ConeIngestOutcome.ts';
import type StoredConeBasis from './StoredConeBasis.ts';

/** The basis advanced and was published. */
export default class ConeIngestAdvanced extends ConeIngestOutcome {
  readonly stored: StoredConeBasis;
  /** Patches folded by this advance. */
  readonly foldedPatches: number;
  /** The basis the advance started from: what the lane held before these patches were folded. */
  readonly from: ConeBasis;

  constructor(stored: StoredConeBasis, foldedPatches: number, from: ConeBasis) {
    super();
    this.stored = stored;
    this.foldedPatches = foldedPatches;
    this.from = from;
    Object.freeze(this);
  }

  override settled(): ConeBasis {
    return this.stored.basis;
  }
}
