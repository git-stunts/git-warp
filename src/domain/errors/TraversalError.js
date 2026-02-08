import WarpError from './WarpError.js';

/**
 * Error class for graph traversal operations.
 *
 * @class TraversalError
 * @extends WarpError
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
export default class TraversalError extends WarpError {
  constructor(message, options = {}) {
    super(message, 'TRAVERSAL_ERROR', options);
  }
}
