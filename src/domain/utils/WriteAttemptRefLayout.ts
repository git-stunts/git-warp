import { LOCAL_REF_PREFIX } from './LocalRefLayout.ts';
import { validateGraphName } from './RefLayout.ts';

/**
 * The refs holding a graph's in-flight write attempts (#1051). Each names a reservation in
 * this clone's ledger, so they live under `refs/warp-local/` (#1078): a `refs/warp/*` lane
 * wildcard does not copy them. A `refs/*` or mirror copy does, with its ledger.
 */
export function buildWriteAttemptsPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${LOCAL_REF_PREFIX}/${graphName}/write-attempts/`;
}

export function buildWriteAttemptRef(graphName: string, attemptId: string): string {
  return `${buildWriteAttemptsPrefix(graphName)}${attemptId}`;
}
