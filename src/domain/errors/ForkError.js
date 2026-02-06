/**
 * Error class for graph fork operations.
 *
 * ForkError is thrown when a fork operation fails due to invalid input,
 * missing data, or validation failures. It provides structured error
 * information via error codes and context objects for programmatic handling.
 *
 * ## When This Error Is Thrown
 *
 * - **Invalid writer**: The `from` writer does not exist in the graph
 * - **Invalid patch SHA**: The `at` SHA does not exist or is not in the writer's chain
 * - **Invalid fork name**: The provided fork name fails validation
 * - **Fork already exists**: A graph with the fork name already has refs
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
 * @extends Error
 *
 * @property {string} name - Always 'ForkError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 *
 * @example
 * try {
 *   await graph.fork({ from: 'alice', at: 'abc123' });
 * } catch (err) {
 *   if (err instanceof ForkError && err.code === 'E_FORK_WRITER_NOT_FOUND') {
 *     console.error('Writer does not exist:', err.context.writerId);
 *   }
 * }
 */
export default class ForkError extends Error {
  /**
   * Creates a new ForkError.
   *
   * @param {string} message - Human-readable error message describing what went wrong
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='FORK_ERROR'] - Machine-readable error code
   * @param {Object} [options.context={}] - Serializable context object
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'ForkError';
    const opts = options || {};
    this.code = opts.code || 'FORK_ERROR';
    this.context = opts.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
