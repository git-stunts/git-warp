import IndexError from './IndexError.js';

/**
 * Error thrown when shard data is corrupted or invalid.
 *
 * This error indicates that a shard file contains invalid or corrupted data,
 * such as invalid checksums, unsupported versions, or malformed content.
 *
 * @class ShardCorruptionError
 * @extends IndexError
 *
 * @property {string} name - The error name ('ShardCorruptionError')
 * @property {string} code - Error code ('SHARD_CORRUPTION_ERROR')
 * @property {string} shardPath - Path to the corrupted shard file
 * @property {string} oid - Object ID associated with the shard
 * @property {string} reason - Reason for corruption (e.g., 'invalid_checksum', 'invalid_version', 'parse_error')
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * if (!validateChecksum(data)) {
 *   throw new ShardCorruptionError('Shard checksum mismatch', {
 *     shardPath: '/path/to/shard',
 *     oid: 'abc123',
 *     reason: 'invalid_checksum'
 *   });
 * }
 */
export default class ShardCorruptionError extends IndexError {
  /**
   * Creates a new ShardCorruptionError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.shardPath] - Path to the corrupted shard file
   * @param {string} [options.oid] - Object ID associated with the shard
   * @param {string} [options.reason] - Reason for corruption (e.g., 'invalid_checksum', 'invalid_version', 'parse_error')
   * @param {Object} [options.context={}] - Additional context for debugging
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      shardPath: options.shardPath,
      oid: options.oid,
      reason: options.reason,
    };

    super(message, {
      code: 'SHARD_CORRUPTION_ERROR',
      context,
    });

    this.name = 'ShardCorruptionError';
    this.shardPath = options.shardPath;
    this.oid = options.oid;
    this.reason = options.reason;
  }
}
