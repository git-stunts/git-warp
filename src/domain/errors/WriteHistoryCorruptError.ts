import WarpError from './WarpError.ts';

/**
 * A write's premise read met patch history that does not decode or is malformed
 * (#1079). Materializing cannot repair it, so the write rejects instead of offering
 * that repair. The failure the read met is its `cause`.
 */
export default class WriteHistoryCorruptError extends WarpError {
  declare cause: WarpError;

  constructor(cause: WarpError) {
    super(`A write's premise read met corrupt patch history: ${cause.message}`, 'E_WRITE_HISTORY_CORRUPT', { context: { code: cause.code } });
    this.cause = cause;
  }
}
