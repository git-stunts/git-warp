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
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- circular: singleton references its own class
    return NULL_LOGGER;
  }
}

const NULL_LOGGER = new NullLogger();
Object.freeze(NULL_LOGGER);

export default NULL_LOGGER;
