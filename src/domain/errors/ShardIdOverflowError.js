import IndexError from './IndexError.js';

/**
 * Thrown when a shard's local ID counter exceeds 2^24.
 *
 * Each shard byte supports up to 2^24 local IDs. When this limit
 * is reached, no more nodes can be registered in that shard.
 *
 * The `code` property is set to `'E_SHARD_ID_OVERFLOW'` and is correctly
 * forwarded through the IndexError -> WarpError chain: IndexError passes
 * the options object to WarpError, which prefers `options.code` over its
 * default code (`'INDEX_ERROR'`).
 *
 * @class ShardIdOverflowError
 * @extends IndexError
 */
export default class ShardIdOverflowError extends IndexError {
  /**
   * Creates a ShardIdOverflowError for when a shard exceeds 2^24 local IDs.
   * @param {string} message - Human-readable error message
   * @param {{ shardKey: string, nextLocalId: number }} context - Shard overflow context
   */
  constructor(message, { shardKey, nextLocalId }) {
    super(message, {
      code: 'E_SHARD_ID_OVERFLOW',
      context: { shardKey, nextLocalId },
    });
  }
}
