import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for cryptographic adapter and operation failures.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_CRYPTO_UNSUPPORTED_ALGORITHM` | Requested digest/HMAC algorithm is not supported |
 * | `E_CRYPTO_INVALID_DATA` | Input data cannot be converted into bytes for crypto APIs |
 */
export default class CryptoError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_CRYPTO_INVALID_DATA', options);
  }
}
