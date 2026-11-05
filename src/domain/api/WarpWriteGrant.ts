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

/**
 * An access decision permitting one write. `authority` is what its digest retains as
 * evidence. The port is asked again before publication and a different grant refuses, so
 * `authority` must name the policy decision, not one call: a nonce would refuse every write.
 */
export default class WarpWriteGrant {
  readonly authority: string;
  readonly budget: WarpWriteBudget;

  constructor(fields: { readonly authority: string; readonly budget: WarpWriteBudget }) {
    if (typeof fields.authority !== 'string' || fields.authority.length === 0 || !isBudget(fields.budget)) {
      throw new WarpError('A write grant needs authority evidence and finite positive limits', 'E_WARP_WRITE_GRANT');
    }
    this.authority = fields.authority;
    const { records, bytes, work } = fields.budget;
    this.budget = Object.freeze({ records, bytes, work });
    Object.freeze(this);
  }
}

function isBudget(budget: WarpWriteBudget | undefined): boolean {
  return budget !== undefined && [budget.records, budget.bytes, budget.work].every(isLimit);
}

function isLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit > 0;
}
