import WarpError from '../errors/WarpError.ts';
import { LOCAL_REF_PREFIX } from './LocalRefLayout.ts';
import { validateGraphName } from './RefLayout.ts';

const ATTEMPT_ID_SEGMENT = /^[0-9a-f]+$/;

/**
 * Builds the disposable ref of one attempt's support construction (#1067).
 * Custody roots replace it once preparation is acknowledged. It is in-flight state
 * of this clone's ledger, so it lives under `refs/warp-local/` (#1078).
 *
 * @example
 * buildObservationConstructionRef('events', '0123');
 * // => 'refs/warp-local/events/observations/construction/0123'
 */
export function buildObservationConstructionRef(graphName: string, attemptId: string): string {
  validateGraphName(graphName);
  if (!ATTEMPT_ID_SEGMENT.test(attemptId)) {
    throw new WarpError('Invalid observation attempt id: expected lowercase hex', 'E_INVALID_OBSERVATION_ATTEMPT_ID');
  }
  return `${LOCAL_REF_PREFIX}/${graphName}/observations/construction/${attemptId}`;
}
