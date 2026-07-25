import type MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import type BundleHandle from '../../domain/storage/BundleHandle.ts';
import type { CheckpointRecord } from '../../ports/CheckpointStorePort.ts';

export function requireCheckpointMaterialization(
  record: CheckpointRecord,
): MaterializationHandle {
  const { materialization } = record;
  if (materialization === undefined) {
    throw new PersistenceError(
      'Current checkpoint publication requires a retained materialization',
      'E_CHECKPOINT_MISSING_MATERIALIZATION',
    );
  }
  if (materialization.stateHash !== record.stateHash) {
    throw checkpointMaterializationMismatch(
      'Checkpoint state hash does not match its retained materialization',
    );
  }
  if (materialization.coordinate.ceiling !== null) {
    throw checkpointMaterializationMismatch(
      'Checkpoint materialization must represent the live coordinate',
    );
  }
  if (!frontiersEqual(materialization.coordinate.frontier(), record.frontier)) {
    throw checkpointMaterializationMismatch(
      'Checkpoint frontier does not match its retained materialization',
    );
  }
  return materialization;
}

export function requirePublishedBundle(
  publishedToken: string,
  expected: BundleHandle,
): void {
  if (publishedToken !== expected.toString()) {
    throw new PersistenceError(
      'Checkpoint publication returned a different bundle handle',
      'E_CHECKPOINT_PUBLICATION_MISMATCH',
      { context: { expected: expected.toString(), actual: publishedToken } },
    );
  }
}

export function requireRetainedBundle(
  retainedToken: string,
  expected: BundleHandle,
): void {
  if (retainedToken !== expected.toString()) {
    throw new PersistenceError(
      'Checkpoint retention evidence names a different bundle handle',
      'E_CHECKPOINT_RETENTION_MISMATCH',
      { context: { expected: expected.toString(), actual: retainedToken } },
    );
  }
}

export function checkpointMaterializationMismatch(message: string): PersistenceError {
  return new PersistenceError(message, 'E_CHECKPOINT_MATERIALIZATION_MISMATCH');
}

function frontiersEqual(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  return left.size === right.size
    && [...left].every(([writerId, patchSha]) => right.get(writerId) === patchSha);
}
