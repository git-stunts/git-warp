import WarpError from './WarpError.js';

/**
 * Error class for graph fork operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_FORK_INVALID_ARGS` | Required fork parameters are missing or invalid |
 * | `E_FORK_WRITER_NOT_FOUND` | The specified writer does not exist |
 * | `E_FORK_PATCH_NOT_FOUND` | The specified patch SHA does not exist |
 * | `E_FORK_PATCH_NOT_IN_CHAIN` | The patch SHA is not in the writer's chain |
 * | `E_FORK_NAME_INVALID` | The fork graph name is invalid |
 * | `E_FORK_WRITER_ID_INVALID` | The fork writer ID is invalid |
 * | `E_FORK_ALREADY_EXISTS` | A graph with the fork name already exists |
 * | `FORK_ERROR` | Generic/default fork error |
 *
 * @class ForkError
 * @extends WarpError
 *
 * @property {string} name - Always 'ForkError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 */
export default class ForkError extends WarpError {
  constructor(message, options = {}) {
    super(message, 'FORK_ERROR', options);
  }
}
