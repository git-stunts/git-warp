import WarpError from './WarpError.ts';

interface PersistenceErrorOptions {
  readonly cause?: Error;
  readonly context?: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Typed error codes for persistence adapter boundary failures.
 *
 * Replaces generic `Error` throws with machine-readable codes so callers
 * can branch on `err.code` instead of brittle `err.message.includes()`.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_MISSING_OBJECT` | Stored object (commit, blob, tree) does not exist |
 * | `E_REF_NOT_FOUND` | Ref does not resolve to any object |
 * | `E_REF_IO` | Ref update/delete failed (lock contention, permission, etc.) |
 * | `E_CURSOR_RETENTION` | git-cas declined durable cursor retention |
 * | `E_CURSOR_CORRUPT` | Retained cursor metadata is malformed |
 */
export default class PersistenceError extends WarpError {
  /** Stored object (commit, blob, tree) does not exist. */
  static E_MISSING_OBJECT = 'E_MISSING_OBJECT';

  /** Ref does not resolve to any object. */
  static E_REF_NOT_FOUND = 'E_REF_NOT_FOUND';

  /** Ref update/delete failed (lock contention, permission, etc.). */
  static E_REF_IO = 'E_REF_IO';

  /** git-cas declined durable cursor retention. */
  static E_CURSOR_RETENTION = 'E_CURSOR_RETENTION';

  /** Retained cursor metadata is malformed. */
  static E_CURSOR_CORRUPT = 'E_CURSOR_CORRUPT';

  declare cause: Error | undefined;

  constructor(message: string, code: string, options: PersistenceErrorOptions = {}) {
    super(message, code, options.context ? { context: options.context } : {});
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}
