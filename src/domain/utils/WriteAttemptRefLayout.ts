import { validateGraphName } from './RefLayout.ts';

/**
 * Home of clone-local WARP refs. It sits beside `refs/warp/`, not inside it, so a lane
 * wildcard such as `refs/warp/*` never copies them into another clone (#1078).
 */
export const LOCAL_REF_PREFIX = 'refs/warp-local';

/**
 * The refs holding a graph's in-flight write attempts (#1051). Each names a reservation in
 * this clone's own ledger, so one is never transferred: a copy elsewhere would have no ledger.
 */
export function buildWriteAttemptsPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${LOCAL_REF_PREFIX}/${graphName}/write-attempts/`;
}

export function buildWriteAttemptRef(graphName: string, attemptId: string): string {
  return `${buildWriteAttemptsPrefix(graphName)}${attemptId}`;
}
