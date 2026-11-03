export type ObservationCustodyStep = 'reservation' | 'preparation' | 'arm' | 'settlement' | 'cancellation' | 'reconciliation';

/**
 * A step's outcome could not be established. This never means unpublished and
 * never licenses retrying an intent; reconcile the attempt's evidence.
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
