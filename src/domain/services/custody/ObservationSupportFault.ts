export type ObservationSupportFaultReason =
  | 'basis-missing' | 'basis-corrupt' | 'work-limit' | 'history-missing' | 'history-mismatch' | 'dependency-missing' | 'dependency-mismatch'
  | 'publication-missing';

/** A retained edge is gone, or no longer corresponds to what was declared. */
export default class ObservationSupportFault {
  readonly reason: ObservationSupportFaultReason;

  constructor(reason: ObservationSupportFaultReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
