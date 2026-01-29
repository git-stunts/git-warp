/**
 * Base error class for bitmap index operations.
 *
 * @class IndexError
 * @extends Error
 *
 * @property {string} name - The error name ('IndexError')
 * @property {string} code - Error code for programmatic handling (default: 'INDEX_ERROR')
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * throw new IndexError('Failed to process index', {
 *   code: 'CUSTOM_ERROR',
 *   context: { operation: 'merge', shardCount: 5 }
 * });
 */
export default class IndexError extends Error {
  /**
   * Creates a new IndexError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='INDEX_ERROR'] - Error code for programmatic handling
   * @param {Object} [options.context={}] - Serializable context for debugging
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'IndexError';
    this.code = options.code || 'INDEX_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
