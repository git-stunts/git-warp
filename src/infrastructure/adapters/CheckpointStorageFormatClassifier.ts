import PersistenceError from '../../domain/errors/PersistenceError.ts';
import type BundleHandle from '../../domain/storage/BundleHandle.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  LEGACY_CHECKPOINT_STORAGE_FORMAT,
  type CheckpointCommitMessage,
} from '../../ports/CommitMessageCodecPort.ts';

const READABLE_LEGACY_STORAGE = new Set<string | null>([
  null,
  LEGACY_CHECKPOINT_STORAGE_FORMAT,
]);

export type CheckpointStorageLayout =
  | Readonly<{ kind: 'bundle'; handle: BundleHandle }>
  | Readonly<{ kind: 'legacy' }>;

const LEGACY_CHECKPOINT_STORAGE: Readonly<{ kind: 'legacy' }> = Object.freeze({
  kind: 'legacy',
});

/** Classifies supported checkpoint storage without opening any payloads. */
export function classifyCheckpointStorage(
  checkpointSha: string,
  metadata: CheckpointCommitMessage,
): CheckpointStorageLayout {
  if (metadata.bundleHandle !== null) {
    if (metadata.checkpointVersion !== CHECKPOINT_STORAGE_FORMAT) {
      throw unsupportedCheckpointStorage(checkpointSha, metadata.checkpointVersion);
    }
    return Object.freeze({ kind: 'bundle', handle: metadata.bundleHandle });
  }
  return classifyCheckpointWithoutBundle(checkpointSha, metadata.checkpointVersion);
}

function classifyCheckpointWithoutBundle(
  checkpointSha: string,
  storageVersion: string | null,
): Readonly<{ kind: 'legacy' }> {
  if (storageVersion === CHECKPOINT_STORAGE_FORMAT) {
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} is missing its bundle handle`,
      'E_CHECKPOINT_MISSING_BUNDLE_HANDLE',
      { context: { checkpointSha } },
    );
  }
  if (READABLE_LEGACY_STORAGE.has(storageVersion)) {
    return LEGACY_CHECKPOINT_STORAGE;
  }
  throw unsupportedCheckpointStorage(checkpointSha, storageVersion);
}

function unsupportedCheckpointStorage(
  checkpointSha: string,
  storageVersion: string | null,
): PersistenceError {
  return new PersistenceError(
    `Checkpoint ${checkpointSha} uses unsupported storage:${storageVersion ?? '(unspecified)'}`,
    'E_CHECKPOINT_UNSUPPORTED_STORAGE',
    { context: { checkpointSha, storageVersion } },
  );
}
