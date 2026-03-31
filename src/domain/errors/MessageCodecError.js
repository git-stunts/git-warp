import WarpError from './WarpError.js';

/**
 * Error class for invalid WARP message trailers and codec metadata.
 *
 * @class MessageCodecError
 * @extends WarpError
 *
 * @property {string} name - Always 'MessageCodecError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Record<string, unknown>} context - Serializable context object with error details
 */
export default class MessageCodecError extends WarpError {
  /**
   * Creates a typed message codec error with an optional code override and context.
   *
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'MESSAGE_CODEC_ERROR', options);
  }
}
