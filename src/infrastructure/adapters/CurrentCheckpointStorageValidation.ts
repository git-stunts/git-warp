import type MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import type BundleHandle from '../../domain/storage/BundleHandle.ts';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  isCurrentCheckpointSchema,
} from '../../domain/services/state/checkpointHelpers.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  type default as CommitMessageCodecPort,
} from '../../ports/CommitMessageCodecPort.ts';

export function retainedRootHandle(
  root: MaterializationRoot,
): BundleHandle | null {
  return root.status === 'retained' ? root.handle : null;
}

export function requireCurrentCheckpointBundle(
  checkpointSha: string,
  metadata: ReturnType<CommitMessageCodecPort['decodeCheckpoint']>,
): BundleHandle {
  if (metadata.checkpointVersion !== CHECKPOINT_STORAGE_FORMAT) {
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} uses unsupported storage:`
        + `${metadata.checkpointVersion ?? '(unspecified)'}`,
      'E_CHECKPOINT_UNSUPPORTED_STORAGE',
      {
        context: {
          checkpointSha,
          storageVersion: metadata.checkpointVersion,
        },
      },
    );
  }
  if (metadata.bundleHandle === null) {
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} is missing its bundle handle`,
      'E_CHECKPOINT_MISSING_BUNDLE_HANDLE',
      { context: { checkpointSha } },
    );
  }
  return metadata.bundleHandle;
}

export function requireCurrentCheckpointSchema(
  checkpointSha: string,
  schema: number,
): void {
  if (!isCurrentCheckpointSchema(schema)) {
    throw unsupportedCheckpointSchema(checkpointSha, schema);
  }
}

export function requireCheckpointGraph(
  checkpointSha: string,
  actualGraphName: string,
  expectedGraphName: string | undefined,
): void {
  if (expectedGraphName === undefined || actualGraphName === expectedGraphName) {
    return;
  }
  throw new PersistenceError(
    `Checkpoint ${checkpointSha} belongs to graph ${actualGraphName}, `
      + `expected ${expectedGraphName}`,
    'E_CHECKPOINT_GRAPH_MISMATCH',
    { context: { checkpointSha, actualGraphName, expectedGraphName } },
  );
}

function unsupportedCheckpointSchema(
  checkpointSha: string,
  schema: number,
): PersistenceError {
  return new PersistenceError(
    `Unsupported checkpoint schema ${schema} in ${checkpointSha}; `
      + `expected ${CURRENT_CHECKPOINT_SCHEMA}. `
      + 'Run the checkpoint migration tool before opening this graph.',
    'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
    { context: { checkpointSha, schema } },
  );
}
