import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationAttemptId from './ObservationAttemptId.ts';
import ObservationBindings from './ObservationBindings.ts';

/**
 * What a reservation binds before its outcome is known: the attempt and its
 * original bindings. It cannot depend on a publication that has not happened.
 */
export default class ObservationPreparation {
  readonly attemptId: ObservationAttemptId;
  readonly bindings: ObservationBindings;

  constructor(attemptId: ObservationAttemptId, bindings: ObservationBindings) {
    if (!(attemptId instanceof ObservationAttemptId) || !(bindings instanceof ObservationBindings)) {
      throw new ObservationCustodyError('Observation preparation needs an attempt and its bindings');
    }
    this.attemptId = attemptId;
    this.bindings = bindings;
    Object.freeze(this);
  }
}
