import WarpError from './WarpError.js';

/**
 * Error thrown when a patch requires decryption but no patchBlobStorage
 * (with encryption key) is configured.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_ENCRYPTED_PATCH` | Patch is encrypted but no decryption key is available |
 *
 * @class EncryptionError
 * @extends WarpError
 */
export default class EncryptionError extends WarpError {
  /**
   * @param {string} message
   * @param {{ context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'E_ENCRYPTED_PATCH', options);
  }
}
