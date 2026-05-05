import IndexError from './IndexError.ts';

interface ShardCorruptionErrorOptions {
  readonly shardPath?: string;
  readonly oid?: string;
  readonly reason?: string;
  readonly context?: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Error thrown when shard data is corrupted or invalid.
 *
 * This error indicates that a shard file contains invalid or corrupted data,
 * such as invalid checksums, unsupported versions, or malformed content.
 */
export default class ShardCorruptionError extends IndexError {
  readonly shardPath: string | undefined;
  readonly oid: string | undefined;
  readonly reason: string | undefined;

  constructor(message: string, options: ShardCorruptionErrorOptions = {}) {
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

    this.shardPath = options.shardPath;
    this.oid = options.oid;
    this.reason = options.reason;
  }
}
