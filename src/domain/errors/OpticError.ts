import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Thrown when an optic read or observation violates domain invariants.
 */
export default class OpticError extends WarpError {
  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_OPTIC', options);
  }
}
