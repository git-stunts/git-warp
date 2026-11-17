import WarpError from './WarpError.ts';

/**
 * Observation support could not be built or checked because a host failure that a retry can
 * clear stopped it (#1109). It is not corruption and not a defect. Only the observation support
 * adapter throws it, with the underlying failure as its `cause`.
 */
export default class ObservationSupportUnavailableError extends WarpError {
  declare cause: Error;

  constructor(operation: string, cause: Error) {
    super(`Observation support could not ${operation}: ${cause.message}`, 'E_OBSERVATION_SUPPORT_UNAVAILABLE', { context: { operation } });
    this.cause = cause;
  }
}
