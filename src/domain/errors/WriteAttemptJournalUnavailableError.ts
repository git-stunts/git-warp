import WarpError from './WarpError.ts';

/**
 * The write-attempt journal could not save a record because a host failure that a retry can
 * clear stopped it (#1109). It is not corruption and not a defect. Only the journal adapter
 * throws it, with the underlying failure as its `cause`.
 */
export default class WriteAttemptJournalUnavailableError extends WarpError {
  declare cause: Error;

  constructor(operation: string, cause: Error) {
    super(`The write-attempt journal could not ${operation}: ${cause.message}`, 'E_WRITE_ATTEMPT_JOURNAL_UNAVAILABLE', { context: { operation } });
    this.cause = cause;
  }
}
