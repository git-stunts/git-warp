import type LogFields from '../domain/types/log/LogFields.ts';

/**
 * LoggerPort — typed structured-logging contract.
 *
 * Adapters implement this port to provide concrete logging backends
 * (console, file, no-op, external services). Each level accepts a
 * message string and an optional `LogFields` context; child loggers
 * inherit a base `LogFields` and merge per-call fields on top.
 *
 * The context type is `LogFields` — a bounded union of serializable
 * field values. Dumping an any-shaped blob into the log stream is
 * banned here by construction. A caller that wants to log an
 * arbitrary value names the field and gives it a type-compatible
 * value (see `LogFieldValue`).
 *
 * @module ports/LoggerPort
 */

/** Port for structured logging operations. */
export default abstract class LoggerPort {
  /** Log a debug-level message. */
  abstract debug(_message: string, _context?: LogFields): void;

  /** Log an info-level message. */
  abstract info(_message: string, _context?: LogFields): void;

  /** Log a warning-level message. */
  abstract warn(_message: string, _context?: LogFields): void;

  /** Log an error-level message. */
  abstract error(_message: string, _context?: LogFields): void;

  /**
   * Create a child logger whose base context merges the parent's
   * context with the one supplied here. Per-call fields override
   * the child's base context at log time.
   */
  abstract child(_context: LogFields): LoggerPort;
}
