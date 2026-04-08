/**
 * Null-object logger for use as a default when no logger is provided.
 *
 * All methods are no-ops. This keeps the domain layer free of
 * adapter dependencies by providing an inline null object.
 *
 * @module domain/utils/nullLogger
 */

import type LoggerPort from '../../ports/LoggerPort.js';

const nullLogger: LoggerPort = {
  debug(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
  child(): LoggerPort {
    return nullLogger;
  },
};

export default nullLogger;
