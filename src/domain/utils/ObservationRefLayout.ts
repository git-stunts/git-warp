import { REF_PREFIX, validateGraphName } from './RefLayout.ts';

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
  return `${REF_PREFIX}/${graphName}/observations/construction/${attemptId}`;
}
