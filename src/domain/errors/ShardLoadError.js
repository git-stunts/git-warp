import IndexError from './IndexError.js';

/**
 * Error thrown when a shard fails to load.
 *
 * This error indicates that a shard file could not be read or parsed,
 * typically due to I/O errors, missing files, or permission issues.
 *
 * @class ShardLoadError
 * @extends IndexError
 *
 * @property {string} name - The error name ('ShardLoadError')
 * @property {string} code - Error code ('SHARD_LOAD_ERROR')
 * @property {string} shardPath - Path to the shard file that failed to load
 * @property {string} oid - Object ID associated with the shard
 * @property {Error} cause - The original error that caused the load failure
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * try {
 *   await loadShard(path);
 * } catch (err) {
 *   throw new ShardLoadError('Failed to load shard', {
 *     shardPath: '/path/to/shard',
 *     oid: 'abc123',
 *     cause: err
 *   });
 * }
 */
export default class ShardLoadError extends IndexError {
  /**
   * Creates a new ShardLoadError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.shardPath] - Path to the shard file
   * @param {string} [options.oid] - Object ID associated with the shard
   * @param {Error} [options.cause] - The original error that caused the failure
   * @param {Object} [options.context={}] - Additional context for debugging
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      shardPath: options.shardPath,
      oid: options.oid,
    };

    super(message, {
      code: 'SHARD_LOAD_ERROR',
      context,
    });

    this.name = 'ShardLoadError';
    this.shardPath = options.shardPath;
    this.oid = options.oid;
    this.cause = options.cause;

    Error.captureStackTrace?.(this, this.constructor);
  }
}
