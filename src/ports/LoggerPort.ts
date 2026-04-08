/**
 * Port interface for structured logging operations.
 *
 * This port defines the contract for logging across the application.
 * Adapters implement this interface to provide different logging
 * backends (console, file, external services, no-op for testing).
 *
 * All methods accept an optional context object for structured metadata.
 * Child loggers inherit and merge parent context.
 */

/** Port for structured logging operations. */
export default abstract class LoggerPort {
  /** Log a debug-level message. */
  abstract debug(_message: string, _context?: Record<string, unknown>): void;

  /** Log an info-level message. */
  abstract info(_message: string, _context?: Record<string, unknown>): void;

  /** Log a warning-level message. */
  abstract warn(_message: string, _context?: Record<string, unknown>): void;

  /** Log an error-level message. */
  abstract error(_message: string, _context?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional base context.
   * Child loggers inherit parent context and merge with their own.
   */
  abstract child(_context: Record<string, unknown>): LoggerPort;
}
