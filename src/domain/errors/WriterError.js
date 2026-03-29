import WarpError from './WarpError.js';

/**
 * Error class for Writer operations.
 *
 * Preserves the existing (code, message, cause) positional constructor
 * signature used throughout PatchSession and PatchBuilderV2, while
 * inheriting from WarpError for unified error hierarchy.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `EMPTY_PATCH` | Patch commit attempted with zero operations |
 * | `WRITER_REF_ADVANCED` | Writer ref moved since beginPatch() |
 * | `WRITER_CAS_CONFLICT` | Compare-and-swap failure during commit |
 * | `PERSIST_WRITE_FAILED` | Git persistence operation failed |
 * | `E_NO_BLOB_STORAGE` | Content attachment attempted without blob storage |
 * | `WRITER_ERROR` | Generic/default writer error |
 *
 * @class WriterError
 * @extends WarpError
 *
 * @property {string} name - Always 'WriterError'
 * @property {string} code - Machine-readable error code
 * @property {Error} [cause] - Original error that caused this error
 */
export default class WriterError extends WarpError {
  /**
   * Note: constructor parameter order differs from other WarpError subclasses
   * (code, message vs message, code). This is intentional to match the most
   * common call sites in PatchSession and PatchBuilderV2 where the error code
   * is the primary discriminator.
   *
   * @param {string} code - Error code
   * @param {string} message - Human-readable error message
   * @param {Error} [cause] - Original error that caused this error
   */
  constructor(code, message, cause) {
    super(message, 'WRITER_ERROR', { code });
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
