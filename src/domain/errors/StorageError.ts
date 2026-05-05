import IndexError from './IndexError.ts';

interface StorageErrorOptions {
  readonly operation?: string;
  readonly oid?: string;
  readonly cause?: Error;
  readonly context?: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Error thrown when a storage operation fails.
 *
 * StorageError extends IndexError because storage errors originate from
 * index operations. This hierarchy is intentional -- IndexError provides
 * the storage-specific error context.
 */
export default class StorageError extends IndexError {
  readonly operation: string | undefined;
  readonly oid: string | undefined;
  declare cause: Error | undefined;

  constructor(message: string, options: StorageErrorOptions = {}) {
    const context = {
      ...options.context,
      operation: options.operation,
      oid: options.oid,
    };

    super(message, {
      code: 'STORAGE_ERROR',
      context,
    });

    this.operation = options.operation;
    this.oid = options.oid;
    this.cause = options.cause;
  }
}
