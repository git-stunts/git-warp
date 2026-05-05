import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error thrown when a patch requires decryption but no patchBlobStorage
 * (with encryption key) is configured.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_ENCRYPTED_PATCH` | Patch is encrypted but no decryption key is available |
 */
export default class EncryptionError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_ENCRYPTED_PATCH', options);
  }
}
