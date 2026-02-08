import WarpError from './WarpError.js';

/**
 * Error class for wormhole compression operations.
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
 * @extends WarpError
 *
 * @property {string} name - Always 'WormholeError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 */
export default class WormholeError extends WarpError {
  constructor(message, options = {}) {
    super(message, 'WORMHOLE_ERROR', options);
  }
}
