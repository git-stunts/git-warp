import LoggerPort from '../../ports/LoggerPort.js';

/**
 * No-operation logger adapter.
 *
 * Provides a zero-overhead implementation of LoggerPort that discards
 * all log messages. Useful as the default logger when logging is not
 * needed, or for testing scenarios where log output is not relevant.
 *
 * All methods are no-ops that return immediately without side effects.
 */
export default class NoOpLogger extends LoggerPort {
  /**
   * No-op debug log.
   * @param {string} _message - Ignored
   * @param {Record<string, unknown>} [_context] - Ignored
   * @returns {void}
   */
  debug(_message, _context) {
    // Intentionally empty
  }

  /**
   * No-op info log.
   * @param {string} _message - Ignored
   * @param {Record<string, unknown>} [_context] - Ignored
   * @returns {void}
   */
  info(_message, _context) {
    // Intentionally empty
  }

  /**
   * No-op warning log.
   * @param {string} _message - Ignored
   * @param {Record<string, unknown>} [_context] - Ignored
   * @returns {void}
   */
  warn(_message, _context) {
    // Intentionally empty
  }

  /**
   * No-op error log.
   * @param {string} _message - Ignored
   * @param {Record<string, unknown>} [_context] - Ignored
   * @returns {void}
   */
  error(_message, _context) {
    // Intentionally empty
  }

  /**
   * Returns a new NoOpLogger instance.
   * Context is ignored since no logging occurs.
   * @param {Record<string, unknown>} [_context] - Ignored
   * @returns {NoOpLogger} A new NoOpLogger instance
   */
  child(_context) {
    return new NoOpLogger();
  }
}
