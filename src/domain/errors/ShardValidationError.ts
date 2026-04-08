import IndexError from './IndexError.ts';

interface ShardValidationErrorOptions {
  readonly shardPath?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly field?: string;
  readonly context?: Record<string, unknown>;
}

/**
 * Error thrown when shard validation fails.
 *
 * This error indicates that a shard file failed validation checks,
 * where expected values do not match actual values for specific fields.
 */
export default class ShardValidationError extends IndexError {
  readonly shardPath: string | undefined;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly field: string | undefined;

  constructor(message: string, options: ShardValidationErrorOptions = {}) {
    const context = {
      ...options.context,
      shardPath: options.shardPath,
      expected: options.expected,
      actual: options.actual,
      field: options.field,
    };

    super(message, {
      code: 'SHARD_VALIDATION_ERROR',
      context,
    });

    this.shardPath = options.shardPath;
    this.expected = options.expected;
    this.actual = options.actual;
    this.field = options.field;
  }
}
