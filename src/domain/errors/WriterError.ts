import WarpError, { type WarpErrorOptions } from './WarpError.ts';

type WriterErrorOptions = WarpErrorOptions & {
  readonly cause?: Error | undefined;
};

/**
 * Error class for Writer operations.
 *
 * Follows the standard WarpError subclass constructor shape:
 * (message, options), with the writer-specific error code carried by options.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `EMPTY_PATCH` | Patch commit attempted with zero operations |
 * | `WRITER_REF_ADVANCED` | Writer ref moved since beginPatch() |
 * | `WRITER_CAS_CONFLICT` | Compare-and-swap failure during commit |
 * | `PERSIST_WRITE_FAILED` | Git persistence operation failed |
 * | `NO_BLOB_STORAGE` | Content attachment attempted without blob storage |
 * | `WRITER_ERROR` | Generic/default writer error |
 */
export default class WriterError extends WarpError {
  declare cause: Error | undefined;
  expectedSha: string | null | undefined = undefined;
  actualSha: string | null | undefined = undefined;

  constructor(message: string, options: WriterErrorOptions = {}) {
    super(message, 'WRITER_ERROR', options);
    this.cause = options.cause;
  }
}
