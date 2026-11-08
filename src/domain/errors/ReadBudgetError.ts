import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Thrown when a read budget fails its constructor invariants.
 */
export default class ReadBudgetError extends WarpError {
  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_READ_BUDGET', options);
  }
}
