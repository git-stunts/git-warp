import WarpError from './WarpError.js';

/**
 * Error class for cryptographic adapter and operation failures.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_CRYPTO_UNSUPPORTED_ALGORITHM` | Requested digest/HMAC algorithm is not supported |
 * | `E_CRYPTO_INVALID_DATA` | Input data cannot be converted into bytes for crypto APIs |
 *
 * @class CryptoError
 * @extends WarpError
 */
export default class CryptoError extends WarpError {
  /**
   * Constructs a CryptoError with an optional machine-readable code and context.
   *
   * @param {string} message - Human-readable error message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'E_CRYPTO_INVALID_DATA', options);
  }
}
