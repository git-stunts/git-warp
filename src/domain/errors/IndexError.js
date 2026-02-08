import WarpError from './WarpError.js';

/**
 * Base error class for bitmap index operations.
 *
 * @class IndexError
 * @extends WarpError
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
export default class IndexError extends WarpError {
  constructor(message, options = {}) {
    super(message, 'INDEX_ERROR', options);
  }
}
