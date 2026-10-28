import type ConeBasis from './ConeBasis.ts';
import ConeIngestOutcome from './ConeIngestOutcome.ts';
import type StoredConeBasis from './StoredConeBasis.ts';

/** The basis advanced and was published. */
export default class ConeIngestAdvanced extends ConeIngestOutcome {
  readonly stored: StoredConeBasis;
  /** Patches folded by this advance. */
  readonly foldedPatches: number;

  constructor(stored: StoredConeBasis, foldedPatches: number) {
    super();
    this.stored = stored;
    this.foldedPatches = foldedPatches;
    Object.freeze(this);
  }

  override settled(): ConeBasis {
    return this.stored.basis;
  }
}
