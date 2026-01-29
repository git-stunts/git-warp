/**
 * Error class for aborted operations.
 *
 * @class OperationAbortedError
 * @extends Error
 *
 * @property {string} name - The error name ('OperationAbortedError')
 * @property {string} code - Error code for programmatic handling (default: 'OPERATION_ABORTED')
 * @property {string} operation - The name of the operation that was aborted
 * @property {string} reason - The reason the operation was aborted
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * throw new OperationAbortedError('traversal', {
 *   reason: 'Signal received',
 *   context: { visitedCount: 42 }
 * });
 */
export default class OperationAbortedError extends Error {
  /**
   * Creates a new OperationAbortedError.
   *
   * @param {string} operation - The name of the operation that was aborted
   * @param {Object} [options={}] - Error options
   * @param {string} [options.reason] - The reason the operation was aborted
   * @param {string} [options.code='OPERATION_ABORTED'] - Error code for programmatic handling
   * @param {Object} [options.context={}] - Serializable context for debugging
   */
  constructor(operation, options = {}) {
    const reason = options.reason || 'Operation was aborted';
    super(`Operation '${operation}' aborted: ${reason}`);
    this.name = 'OperationAbortedError';
    this.code = options.code || 'OPERATION_ABORTED';
    this.operation = operation;
    this.reason = reason;
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
