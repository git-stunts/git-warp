import type MaterializationCoordinate from '../domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../domain/materialization/MaterializationHandle.ts';
import type MaterializationRoots from '../domain/materialization/MaterializationRoots.ts';

export type RetainMaterializationRequest = Readonly<{
  coordinate: MaterializationCoordinate;
  roots: MaterializationRoots;
  stateHash: string;
}>;

/** Storage-neutral lifecycle for retained, independently addressable materializations. */
export default abstract class MaterializationStorePort {
  abstract retain(_request: RetainMaterializationRequest): Promise<MaterializationHandle>;

  abstract findExact(
    _coordinate: MaterializationCoordinate,
  ): Promise<MaterializationHandle | null>;
}
