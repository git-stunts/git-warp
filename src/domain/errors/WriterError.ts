import WarpError from './WarpError.ts';

/**
 * Error class for Writer operations.
 *
 * Preserves the existing (code, message, cause) positional constructor
 * signature used throughout PatchSession and PatchBuilder, while
 * inheriting from WarpError for unified error hierarchy.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `EMPTY_PATCH` | Patch commit attempted with zero operations |
 * | `WRITER_REF_ADVANCED` | Writer ref moved since beginPatch() |
 * | `WRITER_CAS_CONFLICT` | Compare-and-swap failure during commit |
 * | `WRITER_COMMIT_NOT_VISIBLE` | Returned commit is not the writer ref tip after CAS |
 * | `PERSIST_WRITE_FAILED` | Git persistence operation failed |
 * | `NO_BLOB_STORAGE` | Content attachment attempted without blob storage |
 * | `WRITER_ERROR` | Generic/default writer error |
 */
export default class WriterError extends WarpError {
  declare cause: Error | undefined;
  expectedSha: string | null | undefined;
  actualSha: string | null | undefined;

  /**
   * Note: constructor parameter order differs from other WarpError subclasses
   * (code, message vs message, code). This is intentional to match the most
   * common call sites in PatchSession and PatchBuilder where the error code
   * is the primary discriminator.
   */
  constructor(code: string, message: string, cause?: Error) {
    super(message, 'WRITER_ERROR', { code });
    this.expectedSha = undefined;
    this.actualSha = undefined;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
