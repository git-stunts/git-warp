import WarpError from './WarpError.js';

/**
 * Error class for strand descriptor and materialization operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_STRAND_INVALID_ARGS` | Strand options are missing or malformed |
 * | `E_STRAND_ID_INVALID` | The strand id is invalid |
 * | `E_STRAND_ALREADY_EXISTS` | A strand descriptor already exists for the id |
 * | `E_STRAND_NOT_FOUND` | The requested strand descriptor does not exist |
 * | `E_STRAND_CORRUPT` | The stored strand descriptor blob is invalid |
 * | `E_STRAND_MISSING_OBJECT` | The strand ref points at a missing blob |
 * | `E_STRAND_COORDINATE_INVALID` | The strand base observation coordinate is invalid |
 * | `STRAND_ERROR` | Generic/default strand error |
 *
 * @class StrandError
 * @extends WarpError
 */
export default class StrandError extends WarpError {
  /**
   * Creates a StrandError with an optional error code and context.
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'STRAND_ERROR', options);
  }
}
