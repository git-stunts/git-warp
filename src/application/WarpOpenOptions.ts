import type LoggerPort from '../ports/LoggerPort.ts';

/**
 * Optional capabilities for `Warp.open` (#1078). Logging is separate from access: the
 * access port decides operations, and the logger only hears what the runtime reports.
 * With no logger, a Warp reports nothing.
 */
export type WarpOpenOptions = {
  readonly logger?: LoggerPort;
};
