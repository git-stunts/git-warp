import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error class for bounded-memory contract violations. */
export default class MemoryBudgetError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_MEMORY_BUDGET_EXCEEDED', options);
    Object.freeze(this);
  }
}
