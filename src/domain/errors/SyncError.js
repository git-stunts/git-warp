/**
 * Error class for sync transport operations.
 *
 * @class SyncError
 * @extends Error
 *
 * @property {string} name - The error name ('SyncError')
 * @property {string} code - Error code for programmatic handling
 * @property {Object} context - Serializable context object for debugging
 */
export default class SyncError extends Error {
  /**
   * Creates a new SyncError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='SYNC_ERROR'] - Error code
   * @param {Object} [options.context={}] - Serializable context
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'SyncError';
    this.code = options.code || 'SYNC_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
