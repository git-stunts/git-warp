/**
 * Null-object logger for use as a default when no logger is provided.
 *
 * All methods are no-ops. This keeps the domain layer free of
 * adapter dependencies by providing an inline null object.
 *
 * @module domain/utils/nullLogger
 */

/** @type {import('../../ports/LoggerPort.js').default} */
const nullLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return nullLogger;
  },
};

export default nullLogger;
