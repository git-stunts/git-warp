import WarpError from './WarpError.js';

/**
 * Error thrown when adapter inputs fail safety or shape validation.
 *
 * @class AdapterValidationError
 * @extends WarpError
 *
 * @property {string} name - The error name ('AdapterValidationError')
 * @property {string} code - Error code for programmatic handling (default: 'E_ADAPTER_VALIDATION')
 * @property {Record<string, unknown>} context - Serializable context object for debugging
 */
export default class AdapterValidationError extends WarpError {
  /**
   * Creates a validation error for adapter boundary inputs.
   *
   * @param {string} message - Human-readable validation failure
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}] - Optional code override and debug context
   */
  constructor(message, options = {}) {
    super(message, 'E_ADAPTER_VALIDATION', options);
  }
}
