import CustodyIndeterminate from '../services/custody/CustodyIndeterminate.ts';
import type CustodyRefused from '../services/custody/CustodyRefused.ts';
import type { CustodyRefusalReason } from '../services/custody/CustodyVocabulary.ts';
import WarpError from './WarpError.ts';

/**
 * A graph's retention store did not open, so its write path did not (#1078). Nothing was
 * published. `refusal` is why the store refused: `policy-mismatch` means the graph's saved
 * retention capacity differs from the one this build opens it with, and no retry clears that;
 * `contention` means other processes kept winning the ledger, and a retry can succeed. When the
 * store could not answer, `refusal` is null and `cause` is its failure, such as a held ref lock:
 * a retry can succeed. `cause` is always an Error: the custody adapter wraps any other thrown
 * value in one and keeps the value in that Error's `context.thrown`.
 */
export default class RetentionStoreOpenError extends WarpError {
  readonly refusal: CustodyRefusalReason | null;
  declare cause: Error | undefined;

  constructor(failure: CustodyRefused | CustodyIndeterminate) {
    super(`This graph's retention store did not open: ${reasonOf(failure)}`, 'E_WARP_RETENTION_OPEN', { context: { refusal: refusalOf(failure) } });
    this.refusal = refusalOf(failure);
    if (failure instanceof CustodyIndeterminate) {
      this.cause = failure.cause;
    }
  }
}

function refusalOf(failure: CustodyRefused | CustodyIndeterminate): CustodyRefusalReason | null {
  return failure instanceof CustodyIndeterminate ? null : failure.reason;
}

function reasonOf(failure: CustodyRefused | CustodyIndeterminate): string {
  return failure instanceof CustodyIndeterminate
    ? `the store could not answer (${failure.cause.message})`
    : `the store refused (${failure.reason})`;
}
