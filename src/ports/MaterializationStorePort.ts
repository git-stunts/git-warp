import type MaterializationCoordinate from '../domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../domain/materialization/MaterializationHandle.ts';
import type MaterializationWorkspacePort from './MaterializationWorkspacePort.ts';
import type { PromoteMaterializationRequest } from './MaterializationWorkspacePort.ts';

export type RetainMaterializationRequest = PromoteMaterializationRequest;

export type MaterializationAcquisition = Readonly<{
  materialization: MaterializationHandle;
  acquiredAt: string;
  release(): Promise<void>;
}>;

/** Storage-neutral lifecycle for retained, independently addressable materializations. */
export default abstract class MaterializationStorePort {
  abstract openWorkspace(
    _coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort>;

  abstract retain(_request: RetainMaterializationRequest): Promise<MaterializationHandle>;

  abstract acquireExact(
    _coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null>;

  /** Releases runtime-local materialization resources without changing retained storage. */
  close(): Promise<void> {
    return Promise.resolve();
  }
}
