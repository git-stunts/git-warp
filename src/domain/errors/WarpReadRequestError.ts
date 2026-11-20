import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Thrown when a read request fails its constructor invariants.
 */
export default class WarpReadRequestError extends WarpError {
  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_WARP_READ_REQUEST', options);
  }
}
