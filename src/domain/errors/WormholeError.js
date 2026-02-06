/**
 * Error class for wormhole compression operations.
 *
 * WormholeError is thrown when a wormhole operation fails due to invalid input,
 * missing data, or validation failures. It provides structured error
 * information via error codes and context objects for programmatic handling.
 *
 * ## When This Error Is Thrown
 *
 * - **Invalid SHA**: The from or to SHA does not exist
 * - **Invalid range**: The from SHA is not an ancestor of to SHA
 * - **Wrong writer**: The patches span multiple writers
 * - **Empty range**: No patches found in the specified range
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_WORMHOLE_SHA_NOT_FOUND` | A specified SHA does not exist |
 * | `E_WORMHOLE_INVALID_RANGE` | The from SHA is not an ancestor of to SHA |
 * | `E_WORMHOLE_MULTI_WRITER` | The range spans multiple writers |
 * | `E_WORMHOLE_EMPTY_RANGE` | No patches found in the specified range |
 * | `E_WORMHOLE_NOT_PATCH` | A commit in the range is not a patch commit |
 * | `WORMHOLE_ERROR` | Generic/default wormhole error |
 *
 * @class WormholeError
 * @extends Error
 *
 * @property {string} name - Always 'WormholeError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 *
 * @example
 * try {
 *   await graph.createWormhole('abc123', 'def456');
 * } catch (err) {
 *   if (err instanceof WormholeError && err.code === 'E_WORMHOLE_INVALID_RANGE') {
 *     console.error('Invalid range:', err.context);
 *   }
 * }
 */
export default class WormholeError extends Error {
  /**
   * Creates a new WormholeError.
   *
   * @param {string} message - Human-readable error message describing what went wrong
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='WORMHOLE_ERROR'] - Machine-readable error code
   * @param {Object} [options.context={}] - Serializable context object
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'WormholeError';
    this.code = options.code || 'WORMHOLE_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
