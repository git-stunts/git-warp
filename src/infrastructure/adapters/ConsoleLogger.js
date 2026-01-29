/* eslint-disable no-console */
import LoggerPort from '../../ports/LoggerPort.js';

/**
 * Log levels in order of severity.
 * @readonly
 * @enum {number}
 */
export const LogLevel = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
});

/**
 * Map of level names to LogLevel values.
 * @type {Record<string, number>}
 */
const LEVEL_NAMES = Object.freeze({
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  silent: LogLevel.SILENT,
});

/**
 * Console logger adapter with structured JSON output.
 *
 * Provides a production-ready implementation of LoggerPort that outputs
 * structured JSON logs to the console. Supports log level filtering,
 * timestamps, and child loggers with inherited context.
 *
 * @example
 * const logger = new ConsoleLogger({ level: LogLevel.INFO });
 * logger.info('Server started', { port: 3000 });
 * // Output: {"timestamp":"...","level":"INFO","message":"Server started","port":3000}
 *
 * @example
 * const childLogger = logger.child({ requestId: 'abc-123' });
 * childLogger.info('Request received');
 * // Output: {"timestamp":"...","level":"INFO","message":"Request received","requestId":"abc-123"}
 */
export default class ConsoleLogger extends LoggerPort {
  /**
   * Creates a new ConsoleLogger instance.
   * @param {Object} [options] - Logger options
   * @param {number} [options.level=LogLevel.INFO] - Minimum log level to output
   * @param {Record<string, unknown>} [options.context={}] - Base context for all log entries
   * @param {function(): string} [options.timestampFn] - Custom timestamp function (defaults to ISO string)
   */
  constructor({ level = LogLevel.INFO, context = {}, timestampFn } = {}) {
    super();
    this._level = typeof level === 'string' ? (LEVEL_NAMES[level] ?? LogLevel.INFO) : level;
    this._context = Object.freeze({ ...context });
    this._timestampFn = timestampFn || (() => new Date().toISOString());
  }

  /**
   * Log a debug-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Additional structured metadata
   * @returns {void}
   */
  debug(message, context) {
    this._log({ level: LogLevel.DEBUG, levelName: 'DEBUG', message, context });
  }

  /**
   * Log an info-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Additional structured metadata
   * @returns {void}
   */
  info(message, context) {
    this._log({ level: LogLevel.INFO, levelName: 'INFO', message, context });
  }

  /**
   * Log a warning-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Additional structured metadata
   * @returns {void}
   */
  warn(message, context) {
    this._log({ level: LogLevel.WARN, levelName: 'WARN', message, context });
  }

  /**
   * Log an error-level message.
   * @param {string} message - The log message
   * @param {Record<string, unknown>} [context] - Additional structured metadata
   * @returns {void}
   */
  error(message, context) {
    this._log({ level: LogLevel.ERROR, levelName: 'ERROR', message, context });
  }

  /**
   * Create a child logger with additional base context.
   * Child loggers inherit parent context and merge with their own.
   * @param {Record<string, unknown>} context - Additional base context for the child
   * @returns {ConsoleLogger} A new logger instance with merged context
   */
  child(context) {
    return new ConsoleLogger({
      level: this._level,
      context: { ...this._context, ...context },
      timestampFn: this._timestampFn,
    });
  }

  /**
   * Internal logging implementation.
   * @param {Object} opts - Log options
   * @param {number} opts.level - Numeric log level
   * @param {string} opts.levelName - String representation of level
   * @param {string} opts.message - Log message
   * @param {Record<string, unknown>} [opts.context] - Additional context
   * @private
   */
  _log({ level, levelName, message, context }) {
    if (level < this._level) {
      return;
    }

    const entry = {
      timestamp: this._timestampFn(),
      level: levelName,
      message,
      ...this._context,
      ...context,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }
}
