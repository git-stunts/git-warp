import type MaterializationCoordinate from '../domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../domain/materialization/MaterializationHandle.ts';
import type MaterializationRoots from '../domain/materialization/MaterializationRoots.ts';
import type StorageRetentionWitness from '../domain/storage/StorageRetentionWitness.ts';

export type MaterializationWorkspaceRoots = Readonly<{
  nodeAliveRoot: string | null;
  edgeAliveRoot: string | null;
  propertiesRoot?: string | null;
}>;

export type PromoteMaterializationRequest = Readonly<{
  coordinate: MaterializationCoordinate;
  roots: MaterializationRoots;
  stateHash: string;
}>;

/**
 * Operation-scoped retention for materialization roots that are not yet
 * reachable from the final retained materialization handle.
 */
export default abstract class MaterializationWorkspacePort {
  abstract checkpoint(
    _roots: MaterializationWorkspaceRoots,
  ): Promise<StorageRetentionWitness | null>;

  abstract promote(
    _request: PromoteMaterializationRequest,
  ): Promise<MaterializationHandle>;

  abstract release(): Promise<void>;
}
