import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

const ATTEMPT_PATTERN = /^[0-9a-f]{32}$/u;

/**
 * The opaque identifier of one observation attempt, minted by an injected
 * capability. Recovery reuses it; a new invocation has a new one.
 */
export default class ObservationAttemptId {
  readonly value: string;

  constructor(value: string) {
    if (typeof value !== 'string' || !ATTEMPT_PATTERN.test(value)) {
      throw new ObservationCustodyError('Observation attempt id must be 32 lowercase hex characters');
    }
    this.value = value;
    Object.freeze(this);
  }
}
