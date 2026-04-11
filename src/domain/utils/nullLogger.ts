/**
 * Null-object logger for use as a default when no logger is provided.
 *
 * All methods are no-ops. This keeps the domain layer free of
 * adapter dependencies by providing an inline null object.
 *
 * @module domain/utils/nullLogger
 */

import LoggerPort from '../../ports/LoggerPort.ts';

class NullLogger extends LoggerPort {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): LoggerPort {
    return nullLogger;
  }
}

const nullLogger = new NullLogger();
Object.freeze(nullLogger);

export default nullLogger;
