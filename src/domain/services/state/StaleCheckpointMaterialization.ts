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

/** Awaits a checkpoint load and reads a stale checkpoint as no checkpoint. */
export async function unlessStaleCheckpoint<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof Error && isStaleCheckpointMaterialization(error)) {
      return null;
    }
    throw error;
  }
}
