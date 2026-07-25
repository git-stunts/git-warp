import MaterializationCoordinate from '../../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../../src/domain/materialization/MaterializationHandle.ts';
import { unavailableMaterializationRoots } from '../../../src/domain/materialization/UnavailableMaterializationRoots.ts';
import type { ProvenanceIndex } from '../../../src/domain/services/provenance/ProvenanceIndex.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import type MaterializationStorePort from '../../../src/ports/MaterializationStorePort.ts';

/** Retains authoritative migrated state without copying its derived legacy indexes. */
export async function retainMigratedCheckpoint(options: {
  materializations: MaterializationStorePort;
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  provenanceIndex?: ProvenanceIndex;
}): Promise<MaterializationHandle> {
  return await options.materializations.retain({
    coordinate: new MaterializationCoordinate({
      frontier: options.frontier,
      ceiling: null,
    }),
    roots: unavailableMaterializationRoots(),
    stateHash: options.stateHash,
    replayBasis: options.state,
    ...(options.provenanceIndex === undefined
      ? {}
      : { provenanceSupport: options.provenanceIndex }),
  });
}
