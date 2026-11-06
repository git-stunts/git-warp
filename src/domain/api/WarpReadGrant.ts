import WarpError from '../errors/WarpError.ts';
import ReadBudget from './ReadBudget.ts';

/** An access decision permitting one read, within its approved budget. */
export default class WarpReadGrant {
  readonly authority: string;
  readonly budget: ReadBudget;

  constructor(fields: { readonly authority: string; readonly budget: ReadBudget }) {
    if (typeof fields.authority !== 'string' || fields.authority.length === 0 || !(fields.budget instanceof ReadBudget)) {
      throw new WarpError('A read grant needs authority evidence and a read budget', 'E_WARP_READ_GRANT');
    }
    this.authority = fields.authority;
    this.budget = fields.budget;
    Object.freeze(this);
  }
}
