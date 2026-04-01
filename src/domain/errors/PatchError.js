import WarpError from './WarpError.js';

/**
 * Error class for malformed or invalid patch operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_PATCH_MALFORMED` | Operation is missing required fields or has invalid types |
 *
 * @class PatchError
 * @extends WarpError
 *
 * @property {string} name - Always 'PatchError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Record<string, unknown>} context - Serializable context object with error details
 */
export default class PatchError extends WarpError {
  /**
   * Creates a PatchError with the given message and optional context.
   *
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'E_PATCH_MALFORMED', options);
  }
}
