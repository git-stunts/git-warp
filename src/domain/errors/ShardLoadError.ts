import IndexError from './IndexError.ts';

interface ShardLoadErrorOptions {
  readonly shardPath?: string;
  readonly oid?: string;
  readonly cause?: Error;
  readonly context?: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Error thrown when a shard fails to load.
 *
 * This error indicates that a shard file could not be read or parsed,
 * typically due to I/O errors, missing files, or permission issues.
 */
export default class ShardLoadError extends IndexError {
  readonly shardPath: string | undefined;
  readonly oid: string | undefined;
  declare cause: Error | undefined;

  constructor(message: string, options: ShardLoadErrorOptions = {}) {
    const context = {
      ...options.context,
      shardPath: options.shardPath,
      oid: options.oid,
    };

    super(message, {
      code: 'SHARD_LOAD_ERROR',
      context,
    });

    this.shardPath = options.shardPath;
    this.oid = options.oid;
    this.cause = options.cause;
  }
}
