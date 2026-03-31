import WarpError from './WarpError.js';

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
 *
 * @extends WarpError
 */
export default class CrdtError extends WarpError {
  /**
   * @param {string} message - Descriptive error message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, options = {}) {
    const opts = options || {};
    super(message, opts.code || 'E_CRDT_MALFORMED', opts);
  }
}
