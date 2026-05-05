import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for CRDT operations, including VersionVector issues.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_CRDT_INVALID_COUNTER` | Operation counter is not a positive integer |
 * | `E_CRDT_ZERO_COUNTER` | Counter is zero where a positive one was expected |
 * | `E_CRDT_MALFORMED` | CRDT state object is invalid or corrupted |
 */
export default class CrdtError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_CRDT_MALFORMED', options);
  }
}
