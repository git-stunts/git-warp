import ObservationAttemptId from '../../domain/services/custody/ObservationAttemptId.ts';
import ObservationAttemptSourcePort from '../../ports/ObservationAttemptSourcePort.ts';

const HYPHENS = /-/gu;

/** Mints attempt ids from the host's cryptographic entropy. */
export default class EntropyObservationAttemptSource extends ObservationAttemptSourcePort {
  override next(): ObservationAttemptId {
    return new ObservationAttemptId(globalThis.crypto.randomUUID().replace(HYPHENS, ''));
  }
}
