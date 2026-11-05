import type ConeBasis from './ConeBasis.ts';
import ConeIngestOutcome from './ConeIngestOutcome.ts';
import type StoredConeBasis from './StoredConeBasis.ts';

/** The basis already folded every writer tip; nothing was written. */
export default class ConeIngestCurrent extends ConeIngestOutcome {
  /** The published basis, or null for a clone with nothing to fold yet. */
  readonly stored: StoredConeBasis | null;
  readonly basis: ConeBasis;

  constructor(stored: StoredConeBasis | null, basis: ConeBasis) {
    super();
    this.stored = stored;
    this.basis = basis;
    Object.freeze(this);
  }

  override settled(): ConeBasis {
    return this.basis;
  }
}
