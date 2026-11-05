import type ObservationAttemptId from '../domain/services/custody/ObservationAttemptId.ts';

/** Mints the opaque identifier of a new observation attempt from injected entropy. */
export default abstract class ObservationAttemptSourcePort {
  abstract next(): ObservationAttemptId;
}
