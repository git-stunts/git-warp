import WarpError from './WarpError.js';

/**
 * Error class for cache configuration and lifecycle failures.
 *
 * @class CacheError
 * @extends WarpError
 *
 * @property {string} name - Always 'CacheError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Record<string, unknown>} context - Serializable context object with error details
 */
export default class CacheError extends WarpError {
  /**
   * Creates a typed cache error with an optional code override and debugging context.
   *
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'CACHE_ERROR', options);
  }
}
