import WarpError from '../errors/WarpError.ts';

/** Finite limits a write's premises and lowering must stay within. */
export type WarpWriteBudget = {
  /** Entity records the write may read before it lowers. */
  readonly records: number;
  /** Bytes of the submitted intent sequence. */
  readonly bytes: number;
  /** Operations the write may lower to. */
  readonly work: number;
};

/** An access decision permitting one write. `authority` is what its digest retains as evidence. */
export default class WarpWriteGrant {
  readonly authority: string;
  readonly budget: WarpWriteBudget;

  constructor(fields: { readonly authority: string; readonly budget: WarpWriteBudget }) {
    const { records, bytes, work } = fields.budget;
    if (fields.authority.length === 0 || ![records, bytes, work].every(isLimit)) {
      throw new WarpError('A write grant needs authority evidence and finite positive limits', 'E_WARP_WRITE_GRANT');
    }
    this.authority = fields.authority;
    this.budget = Object.freeze({ records, bytes, work });
    Object.freeze(this);
  }
}

function isLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit > 0;
}
