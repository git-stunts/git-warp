import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error thrown when configured asset decryption cannot satisfy a read.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_ENCRYPTED_PATCH` | Encrypted asset cannot be read with configured keys |
 */
export default class EncryptionError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_ENCRYPTED_PATCH', options);
  }
}
