/**
 * Base error class for all WARP domain errors.
 *
 * Provides shared constructor logic: name (from constructor), code,
 * context, and stack trace capture. Subclasses reduce to a one-line
 * constructor calling super(message, defaultCode, options).
 *
 * @class WarpError
 * @extends Error
 *
 * @property {string} name - Error name (set from constructor.name)
 * @property {string} code - Machine-readable error code
 * @property {Record<string, unknown>} context - Serializable context for debugging
 */
export default class WarpError extends Error {
  /**
   * Constructs a WarpError with a machine-readable code and optional context.
   *
   * @param {string} message - Human-readable error message
   * @param {string} defaultCode - Default error code if not overridden by options
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, defaultCode, options = {}) {
    super(message);
    const opts = options ?? {};
    this.name = this.constructor.name;
    this.code = resolveCode(opts.code, defaultCode);
    this.context = opts.context ?? {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Returns the override code if it is a non-empty string, otherwise the default.
 *
 * @param {string|undefined} code - Optional code override
 * @param {string} defaultCode - Fallback code
 * @returns {string} Resolved error code
 */
function resolveCode(code, defaultCode) {
  if (typeof code === 'string' && code.length > 0) {
    return code;
  }
  return defaultCode;
}
