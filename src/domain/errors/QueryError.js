/**
 * Error class for query builder operations.
 *
 * @class QueryError
 * @extends Error
 *
 * @property {string} name - The error name ('QueryError')
 * @property {string} code - Error code for programmatic handling
 * @property {Object} context - Serializable context object for debugging
 */
export default class QueryError extends Error {
  /**
   * Creates a new QueryError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='QUERY_ERROR'] - Error code
   * @param {Object} [options.context={}] - Serializable context
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'QueryError';
    this.code = options.code || 'QUERY_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
