import type ConeBasis from './ConeBasis.ts';
import type ConeReader from './ConeReader.ts';
import type StoredConeBasis from './StoredConeBasis.ts';

/** The one published basis a write's premises are read from, fixed before any of them is (#1051). */
export default class ConeWritePremise {
  /** What this clone had folded when the write began. */
  readonly from: ConeBasis;
  readonly stored: StoredConeBasis;
  readonly reader: ConeReader;

  constructor(fields: { readonly from: ConeBasis; readonly stored: StoredConeBasis; readonly reader: ConeReader }) {
    this.from = fields.from;
    this.stored = fields.stored;
    this.reader = fields.reader;
    Object.freeze(this);
  }

  get basis(): ConeBasis {
    return this.stored.basis;
  }
}
