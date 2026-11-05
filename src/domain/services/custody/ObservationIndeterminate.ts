export type ObservationCustodyStep = 'reservation' | 'preparation' | 'arm' | 'settlement' | 'cancellation' | 'reconciliation';

/**
 * A step's outcome could not be established. This never means unpublished and
 * never licenses retrying an intent. Its `step` says what to redo, but `cause.code`
 * separates two states repeating cannot fix:
 * `E_OBSERVATION_CUSTODY_CONTRADICTED` (a publication custody never permitted) and
 * `E_OBSERVATION_CUSTODY_UNVERIFIED` (settled evidence that did not resolve, which
 * may be transient, so recovery may be retried).
 */
export default class ObservationIndeterminate {
  readonly step: ObservationCustodyStep;
  readonly cause: Error;

  constructor(step: ObservationCustodyStep, cause: Error) {
    this.step = step;
    this.cause = cause;
    Object.freeze(this);
  }
}
