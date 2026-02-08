import WarpError from './WarpError.js';

/**
 * Error class for aborted operations.
 *
 * @class OperationAbortedError
 * @extends WarpError
 *
 * @property {string} name - The error name ('OperationAbortedError')
 * @property {string} code - Error code for programmatic handling (default: 'OPERATION_ABORTED')
 * @property {string} operation - The name of the operation that was aborted
 * @property {string} reason - The reason the operation was aborted
 * @property {Object} context - Serializable context object for debugging
 */
export default class OperationAbortedError extends WarpError {
  constructor(operation, options = {}) {
    const reason = options.reason || 'Operation was aborted';
    super(`Operation '${operation}' aborted: ${reason}`, 'OPERATION_ABORTED', options);
    this.operation = operation;
    this.reason = reason;
  }
}
