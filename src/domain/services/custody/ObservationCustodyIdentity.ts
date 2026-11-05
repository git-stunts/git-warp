import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationAttemptId from './ObservationAttemptId.ts';
import ObservationDigest from './ObservationDigest.ts';

/** The reservation of one attempt: exact retries recover it, a different binding refuses. */
export default class ObservationCustodyIdentity {
  readonly attemptId: ObservationAttemptId;
  readonly binding: ObservationDigest;

  constructor(attemptId: ObservationAttemptId, binding: ObservationDigest) {
    if (!(attemptId instanceof ObservationAttemptId) || !(binding instanceof ObservationDigest)) {
      throw new ObservationCustodyError('Custody identity needs an attempt and a binding digest');
    }
    this.attemptId = attemptId;
    this.binding = binding;
    Object.freeze(this);
  }
}
