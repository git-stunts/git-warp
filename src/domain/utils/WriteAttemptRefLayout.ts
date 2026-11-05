import { REF_PREFIX, validateGraphName } from './RefLayout.ts';

/** The clone-local, never transferred refs holding a graph's in-flight write attempts (#1051). */
export function buildWriteAttemptsPrefix(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/write-attempts/`;
}

export function buildWriteAttemptRef(graphName: string, attemptId: string): string {
  return `${buildWriteAttemptsPrefix(graphName)}${attemptId}`;
}
