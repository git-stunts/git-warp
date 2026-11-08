import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for entropy draws through a RandomPort.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_ENTROPY_INVALID_LENGTH` | The requested byte count is not a positive integer |
 * | `E_ENTROPY_SHORT_READ` | The port returned something other than exactly the requested bytes |
 * | `ENTROPY_ERROR` | Generic/default entropy error |
 */
export default class EntropyError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'ENTROPY_ERROR', options);
  }
}
