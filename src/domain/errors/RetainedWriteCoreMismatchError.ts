import WarpError from './WarpError.ts';

/**
 * A saved write attempt record names other races than the core custody retained for it,
 * so a receipt rebuilt from that record would contradict its own Coordinate.
 */
export default class RetainedWriteCoreMismatchError extends WarpError {
  readonly attempt: string;

  constructor(attempt: string) {
    super(`The saved record of write attempt ${attempt} does not match the receipt core custody retained for it`, 'E_WRITE_CORE_MISMATCH');
    this.attempt = attempt;
  }
}
