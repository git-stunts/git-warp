import PersistenceError from '../../errors/PersistenceError.ts';

/**
 * Error code for a checkpoint whose materialization an older runtime wrote
 * under an earlier descriptor schema. Its state predates the current
 * visibility rules, so it is a miss: callers replay from patches rather
 * than resume from it.
 */
export const E_CHECKPOINT_STALE_MATERIALIZATION = 'E_CHECKPOINT_STALE_MATERIALIZATION';

/** Returns true when a checkpoint store refused a checkpoint as stale. */
export function isStaleCheckpointMaterialization(error: Error): boolean {
  return error instanceof PersistenceError && error.code === E_CHECKPOINT_STALE_MATERIALIZATION;
}
