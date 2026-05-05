import IndexError from './IndexError.ts';

interface ShardIdOverflowContext {
  readonly shardKey: string;
  readonly nextLocalId: number;
}

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
 */
export default class ShardIdOverflowError extends IndexError {
  constructor(message: string, { shardKey, nextLocalId }: ShardIdOverflowContext) {
    super(message, {
      code: 'E_SHARD_ID_OVERFLOW',
      context: { shardKey, nextLocalId },
    });
  }
}
