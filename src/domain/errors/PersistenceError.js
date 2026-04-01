import WarpError from './WarpError.js';

/**
 * Typed error codes for persistence adapter boundary failures.
 *
 * Replaces generic `Error` throws with machine-readable codes so callers
 * can branch on `err.code` instead of brittle `err.message.includes()`.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_MISSING_OBJECT` | Stored object (commit, blob, tree) does not exist |
 * | `E_REF_NOT_FOUND` | Ref does not resolve to any object |
 * | `E_REF_IO` | Ref update/delete failed (lock contention, permission, etc.) |
 *
 * @class PersistenceError
 * @extends WarpError
 *
 * @property {string} name - Always 'PersistenceError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Record<string, unknown>} context - Serializable context object with error details
 */
export default class PersistenceError extends WarpError {
  /** Stored object (commit, blob, tree) does not exist. */
  static E_MISSING_OBJECT = 'E_MISSING_OBJECT';

  /** Ref does not resolve to any object. */
  static E_REF_NOT_FOUND = 'E_REF_NOT_FOUND';

  /** Ref update/delete failed (lock contention, permission, etc.). */
  static E_REF_IO = 'E_REF_IO';

  /**
   * Constructs a PersistenceError with a code and optional cause/context.
   * @param {string} message - Human-readable error message
   * @param {string} code - One of the E_* constants
   * @param {{ cause?: Error, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, code, options = {}) {
    super(message, code, { context: options.context });
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}
