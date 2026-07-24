import type MaterializationCoordinate from '../domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../domain/materialization/MaterializationHandle.ts';
import type MaterializationWorkspacePort from './MaterializationWorkspacePort.ts';
import type { PromoteMaterializationRequest } from './MaterializationWorkspacePort.ts';
import type WarpState from '../domain/services/state/WarpState.ts';

export type RetainMaterializationRequest = PromoteMaterializationRequest;

export type MaterializationAcquisition = Readonly<{
  materialization: MaterializationHandle;
  acquiredAt: string;
  release(): Promise<void>;
}>;

export type MaterializationPredecessorPredicate = (
  _candidate: MaterializationCoordinate,
) => Promise<boolean>;

/** Storage-neutral lifecycle for retained, independently addressable materializations. */
export default abstract class MaterializationStorePort {
  abstract openWorkspace(
    _coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort>;

  abstract retain(_request: RetainMaterializationRequest): Promise<MaterializationHandle>;

  abstract acquireExact(
    _coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null>;

  acquireBestCompatiblePredecessor(
    _coordinate: MaterializationCoordinate,
    _isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationAcquisition | null> {
    return Promise.resolve(null);
  }

  loadReplayBasis(_materialization: MaterializationHandle): Promise<WarpState | null> {
    return Promise.resolve(null);
  }

  /** Releases runtime-local materialization resources without changing retained storage. */
  close(): Promise<void> {
    return Promise.resolve();
  }
}
