export type ObservationCustodyStep = 'reservation' | 'preparation' | 'arm' | 'settlement' | 'cancellation' | 'reconciliation';

/**
 * A step's outcome could not be established. This never means unpublished and
 * never licenses retrying an intent. Usually reconcile the attempt's evidence, but
 * `cause.code` separates two states reconciling cannot fix:
 * `E_OBSERVATION_CUSTODY_CONTRADICTED` (a publication custody never permitted) and
 * `E_OBSERVATION_CUSTODY_UNVERIFIED` (settled read evidence that does not resolve).
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
