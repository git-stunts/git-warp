import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for malformed or invalid patch operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_PATCH_MALFORMED` | Operation is missing required fields or has invalid types |
 */
export default class PatchError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_PATCH_MALFORMED', options);
  }
}
