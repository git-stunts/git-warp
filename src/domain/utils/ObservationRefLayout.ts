import WarpError from '../errors/WarpError.ts';
import { REF_PREFIX, validateGraphName } from './RefLayout.ts';

const ATTEMPT_ID_SEGMENT = /^[0-9a-f]+$/;

/**
 * Builds the disposable ref of one attempt's support construction (#1067).
 * Custody roots replace it once preparation is acknowledged.
 *
 * @example
 * buildObservationConstructionRef('events', '0123');
 * // => 'refs/warp/events/observations/construction/0123'
 */
export function buildObservationConstructionRef(graphName: string, attemptId: string): string {
  validateGraphName(graphName);
  if (!ATTEMPT_ID_SEGMENT.test(attemptId)) {
    throw new WarpError('Invalid observation attempt id: expected lowercase hex', 'E_INVALID_OBSERVATION_ATTEMPT_ID');
  }
  return `${REF_PREFIX}/${graphName}/observations/construction/${attemptId}`;
}
