import LoggerPort from '../../ports/LoggerPort.ts';

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
  debug(_message: string, _context?: Record<string, unknown>): void {
    // Intentionally empty
  }

  info(_message: string, _context?: Record<string, unknown>): void {
    // Intentionally empty
  }

  warn(_message: string, _context?: Record<string, unknown>): void {
    // Intentionally empty
  }

  error(_message: string, _context?: Record<string, unknown>): void {
    // Intentionally empty
  }

  child(_context: Record<string, unknown>): NoOpLogger {
    return new NoOpLogger();
  }
}
