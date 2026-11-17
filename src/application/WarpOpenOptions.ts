import WarpError from '../domain/errors/WarpError.ts';
import LoggerPort from '../ports/LoggerPort.ts';

/**
 * Optional capabilities for `Warp.open` (#1078). Logging is separate from access: the
 * access port decides operations, and the logger only hears what the runtime reports.
 * With no logger, a Warp reports nothing.
 */
export type WarpOpenOptions = {
  readonly logger?: LoggerPort;
};

const KNOWN_OPTIONS: ReadonlySet<string> = new Set(['logger']);
const LOGGER_METHODS = ['debug', 'info', 'warn', 'error', 'child'] as const;

/**
 * Reads the logger from `Warp.open` options, refusing what it cannot use: options that
 * are not a plain object or that name an unknown option (`E_WARP_OPEN_OPTIONS`), and a
 * logger that is not a `LoggerPort` with five callable methods (`E_WARP_OPEN_LOGGER`).
 */
export function readWarpOpenLogger(options: WarpOpenOptions): LoggerPort | undefined {
  if (!isPlainOptions(options)) {
    throw new WarpError('Warp.open options must be a plain object naming only `logger`', 'E_WARP_OPEN_OPTIONS');
  }
  const { logger } = options;
  if (logger === undefined || isCallableLogger(logger)) {
    return logger;
  }
  throw new WarpError('Warp.open logger must be a LoggerPort whose debug, info, warn, error and child are callable', 'E_WARP_OPEN_LOGGER');
}

function isPlainOptions(options: WarpOpenOptions): boolean {
  if (typeof options !== 'object' || options === null) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(options);
  return (prototype === Object.prototype || prototype === null) && Object.keys(options).every((key) => KNOWN_OPTIONS.has(key));
}

function isCallableLogger(logger: LoggerPort): boolean {
  return logger instanceof LoggerPort && LOGGER_METHODS.every((name) => typeof logger[name] === 'function');
}
