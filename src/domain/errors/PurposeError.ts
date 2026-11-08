import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Thrown when a read purpose fails its constructor invariants.
 */
export default class PurposeError extends WarpError {
  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_PURPOSE', options);
  }
}
