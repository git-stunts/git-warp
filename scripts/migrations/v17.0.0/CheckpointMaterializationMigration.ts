import MaterializationCoordinate from '../../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../../src/domain/materialization/MaterializationHandle.ts';
import { unavailableMaterializationRoots } from '../../../src/domain/materialization/UnavailableMaterializationRoots.ts';
import type { ProvenanceIndex } from '../../../src/domain/services/provenance/ProvenanceIndex.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import {
  materializationRootsWithIndexes,
  prepareMaterializationIndexRoots,
} from '../../../src/domain/services/controllers/MaterializationIndexRoots.ts';
import { completeWithCleanup } from '../../../src/infrastructure/adapters/OperationCleanup.ts';
import type IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import type MaterializationStorePort from '../../../src/ports/MaterializationStorePort.ts';

/** Retains migrated state and optionally rebuilds current indexes from authority. */
export async function retainMigratedCheckpoint(options: {
  materializations: MaterializationStorePort;
  state: WarpState;
  frontier: Map<string, string>;
  indexStore?: IndexStorePort;
  stateHash: string;
  provenanceIndex?: ProvenanceIndex;
}): Promise<MaterializationHandle> {
  const coordinate = new MaterializationCoordinate({
    frontier: options.frontier,
    ceiling: null,
  });
  if (options.indexStore !== undefined) {
    const workspace = await options.materializations.openWorkspace(coordinate);
    return await completeWithCleanup(async () => {
      const prepared = await prepareMaterializationIndexRoots({
        state: options.state,
        store: options.indexStore,
        workspace,
      });
      return await workspace.promote({
        coordinate,
        roots: materializationRootsWithIndexes(prepared),
        stateHash: options.stateHash,
        replayBasis: options.state,
        ...(options.provenanceIndex === undefined
          ? {}
          : { provenanceSupport: options.provenanceIndex }),
      });
    }, async () => await workspace.release(),
    'checkpoint migration and workspace release both failed');
  }
  return await options.materializations.retain({
    coordinate,
    roots: unavailableMaterializationRoots(),
    stateHash: options.stateHash,
    replayBasis: options.state,
    ...(options.provenanceIndex === undefined
      ? {}
      : { provenanceSupport: options.provenanceIndex }),
  });
}
