import WarpError from './WarpError.js';

/**
 * Error class for working-set descriptor and materialization operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_WORKING_SET_INVALID_ARGS` | Working-set options are missing or malformed |
 * | `E_WORKING_SET_ID_INVALID` | The working-set id is invalid |
 * | `E_WORKING_SET_ALREADY_EXISTS` | A working-set descriptor already exists for the id |
 * | `E_WORKING_SET_NOT_FOUND` | The requested working-set descriptor does not exist |
 * | `E_WORKING_SET_CORRUPT` | The stored working-set descriptor blob is invalid |
 * | `E_WORKING_SET_MISSING_OBJECT` | The working-set ref points at a missing blob |
 * | `E_WORKING_SET_COORDINATE_INVALID` | The working-set base observation coordinate is invalid |
 * | `WORKING_SET_ERROR` | Generic/default working-set error |
 *
 * @class WorkingSetError
 * @extends WarpError
 */
export default class WorkingSetError extends WarpError {
  /**
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'WORKING_SET_ERROR', options);
  }
}
