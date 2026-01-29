/**
 * Error class for graph traversal operations.
 *
 * @class TraversalError
 * @extends Error
 *
 * @property {string} name - The error name ('TraversalError')
 * @property {string} code - Error code for programmatic handling (default: 'TRAVERSAL_ERROR')
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * throw new TraversalError('Node not found in index', {
 *   code: 'NODE_NOT_FOUND',
 *   context: { sha: 'abc123', operation: 'bfs' }
 * });
 */
export default class TraversalError extends Error {
  /**
   * Creates a new TraversalError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='TRAVERSAL_ERROR'] - Error code for programmatic handling
   * @param {Object} [options.context={}] - Serializable context for debugging
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'TraversalError';
    this.code = options.code || 'TRAVERSAL_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
