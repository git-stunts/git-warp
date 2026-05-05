/* eslint-disable no-console */
import LoggerPort from '../../ports/LoggerPort.ts';

/** Log levels in order of severity. */
export const LogLevel: Readonly<{
  DEBUG: 0;
  INFO: 1;
  WARN: 2;
  ERROR: 3;
  SILENT: 4;
}> = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
} as const);

/** Numeric log level values. */
export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/** Map of level names to LogLevel values. */
const LEVEL_NAMES: Record<string, number> = Object.freeze({
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  silent: LogLevel.SILENT,
});

function resolveLevel(level: number | string): number {
  if (typeof level === 'string') {
    return LEVEL_NAMES[level] ?? LogLevel.INFO;
  }
  return level;
}

function resolveOptions(options: { level?: number | string; context?: Record<string, unknown>; timestampFn?: () => string } | undefined): { level: number; context: Readonly<Record<string, unknown>>; timestampFn: () => string } {
  const { level = LogLevel.INFO, context = {}, timestampFn } = options ?? {};
  return {
    level: resolveLevel(level),
    context: Object.freeze({ ...context }),
    timestampFn: timestampFn ?? (() => new Date().toISOString()),
  };
}

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
 */
export default class ConsoleLogger extends LoggerPort {
  private readonly _level: number;
  private readonly _context: Readonly<Record<string, unknown>>;
  private readonly _timestampFn: () => string;

  constructor(options?: { level?: number | string; context?: Record<string, unknown>; timestampFn?: () => string }) {
    super();
    const resolved = resolveOptions(options);
    this._level = resolved.level;
    this._context = resolved.context;
    this._timestampFn = resolved.timestampFn;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this._log({ level: LogLevel.DEBUG, levelName: 'DEBUG', message, ...(context !== undefined ? { context } : {}) });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this._log({ level: LogLevel.INFO, levelName: 'INFO', message, ...(context !== undefined ? { context } : {}) });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this._log({ level: LogLevel.WARN, levelName: 'WARN', message, ...(context !== undefined ? { context } : {}) });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this._log({ level: LogLevel.ERROR, levelName: 'ERROR', message, ...(context !== undefined ? { context } : {}) });
  }

  child(context: Record<string, unknown>): ConsoleLogger {
    return new ConsoleLogger({
      level: this._level,
      context: { ...this._context, ...context },
      timestampFn: this._timestampFn,
    });
  }

  private _log({ level, levelName, message, context }: { level: number; levelName: string; message: string; context?: Record<string, unknown> }): void {
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
