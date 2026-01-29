/**
 * Port interface for structured logging operations.
 *
 * This port defines the contract for logging across the application.
 * Adapters implement this interface to provide different logging
 * backends (console, file, external services, no-op for testing).
 *
 * All methods accept an optional context object for structured metadata.
 * Child loggers inherit and merge parent context.
 *
 * @abstract
 */
export default class LoggerPort {
  /**
   * Log a debug-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Structured metadata
   * @returns {void}
   * @abstract
   */
  debug(_message, _context) {
    throw new Error('Not implemented');
  }

  /**
   * Log an info-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Structured metadata
   * @returns {void}
   * @abstract
   */
  info(_message, _context) {
    throw new Error('Not implemented');
  }

  /**
   * Log a warning-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Structured metadata
   * @returns {void}
   * @abstract
   */
  warn(_message, _context) {
    throw new Error('Not implemented');
  }

  /**
   * Log an error-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Structured metadata
   * @returns {void}
   * @abstract
   */
  error(_message, _context) {
    throw new Error('Not implemented');
  }

  /**
   * Create a child logger with additional base context.
   * Child loggers inherit parent context and merge with their own.
   * @param {Record<string, unknown>} context - Base context for the child logger
   * @returns {LoggerPort} A new logger instance with merged context
   * @abstract
   */
  child(_context) {
    throw new Error('Not implemented');
  }
}
