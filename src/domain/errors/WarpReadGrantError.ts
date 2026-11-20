import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Thrown when a read grant fails its constructor invariants.
 */
export default class WarpReadGrantError extends WarpError {
  constructor(message: string, options: WarpErrorOptions | null = {}) {
    super(message, 'E_WARP_READ_GRANT', options);
  }
}
