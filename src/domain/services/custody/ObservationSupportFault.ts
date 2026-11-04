export type ObservationSupportFaultReason =
  | 'basis-missing' | 'basis-corrupt' | 'work-limit' | 'history-missing' | 'history-mismatch' | 'dependency-missing' | 'dependency-mismatch'
  | 'publication-missing' | 'support-limit';

/**
 * A retained edge is gone or no longer corresponds to what was declared, or
 * configured limits no longer admit reading it (`work-limit`, `support-limit`),
 * which restoring the limits undoes.
 */
export default class ObservationSupportFault {
  readonly reason: ObservationSupportFaultReason;

  constructor(reason: ObservationSupportFaultReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
