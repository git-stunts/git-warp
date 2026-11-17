import WarpError from './WarpError.ts';

/**
 * A saved write attempt record does not rebuild, byte for byte, the receipt core that custody
 * retained for it, so a receipt rebuilt from it would contradict its own Coordinate. The record
 * is altered or corrupt: it is kept, and should be reported. The sweep does not report it yet (#1107).
 */
export default class RetainedWriteCoreMismatchError extends WarpError {
  readonly attempt: string;

  constructor(attempt: string) {
    super(`The saved record of write attempt ${attempt} does not match the receipt core that custody retained for it; the record is altered or corrupt, so it is kept: report this`, 'E_WRITE_CORE_MISMATCH');
    this.attempt = attempt;
  }
}
