import WarpError from './WarpError.js';

/**
 * Error thrown when a patch contains operations unsupported by the current schema version.
 *
 * @class SchemaUnsupportedError
 * @extends WarpError
 *
 * @property {string} name - The error name ('SchemaUnsupportedError')
 * @property {string} code - Error code ('E_SCHEMA_UNSUPPORTED')
 * @property {Object} context - Serializable context object for debugging
 */
export default class SchemaUnsupportedError extends WarpError {
  constructor(message, options = {}) {
    super(message, 'E_SCHEMA_UNSUPPORTED', options);
  }
}
