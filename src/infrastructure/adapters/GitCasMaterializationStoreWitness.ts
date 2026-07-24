import type {
  CacheAcquisition,
  WorkspaceRetainedBundle,
  WorkspaceRetainedPage,
} from '@git-stunts/git-cas';
import { storageError } from './GitCasMaterializationStoreValidation.ts';
import type {
  MaterializationCachePut,
} from './GitCasMaterializationStoreTypes.ts';

export async function releaseCacheAcquisitionAfterFailure(
  acquisition: CacheAcquisition,
): Promise<void> {
  try {
    await acquisition.release();
  } catch {
    // git-cas doctor owns abandoned-acquisition diagnostics; preserve the primary failure.
  }
}

export function requireWorkspaceStage(
  staged: WorkspaceRetainedPage | WorkspaceRetainedBundle,
): void {
  const valid = [
    staged.state === 'retained',
    staged.retention.policy === 'evictable',
    staged.retention.reachability === 'anchored',
    staged.retention.protection === 'workspace',
    staged.witness.handle.toString() === staged.handle.toString(),
    staged.witness.root.kind === 'root-set',
  ];
  if (valid.includes(false)) {
    throw storageError('git-cas did not retain a staged materialization artifact');
  }
}

export function requireStoredMaterialization(
  stored: MaterializationCachePut,
  expectedHandle: string,
): Exclude<MaterializationCachePut['witness'], null> {
  if (!stored.accepted || stored.hit === null || stored.witness === null) {
    throw storageError('git-cas did not retain the materialization bundle');
  }
  if (stored.hit.handle.toString() !== expectedHandle) {
    throw storageError('git-cas retained an unexpected materialization handle');
  }
  return stored.witness;
}

export function requireDescriptorSize(bytes: Uint8Array): void {
  if (bytes.byteLength > 1024 * 1024) {
    throw storageError('materialization descriptor exceeds its byte limit');
  }
}
