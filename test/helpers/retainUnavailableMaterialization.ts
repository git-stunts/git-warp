import MaterializationCoordinate from '../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../src/domain/materialization/MaterializationHandle.ts';
import { unavailableMaterializationRoots } from '../../src/domain/materialization/UnavailableMaterializationRoots.ts';
import { computeStateHash } from '../../src/domain/services/state/StateSerializer.ts';
import type WarpState from '../../src/domain/services/state/WarpState.ts';
import type CodecPort from '../../src/ports/CodecPort.ts';
import type CryptoPort from '../../src/ports/CryptoPort.ts';
import type MaterializationStorePort from '../../src/ports/MaterializationStorePort.ts';

export default async function retainUnavailableMaterialization(options: {
  materializations: Pick<MaterializationStorePort, 'retain'>;
  frontier: Map<string, string>;
  state: WarpState;
  codec: CodecPort;
  crypto: CryptoPort;
}): Promise<MaterializationHandle> {
  return await options.materializations.retain({
    coordinate: new MaterializationCoordinate({
      frontier: options.frontier,
      ceiling: null,
    }),
    roots: unavailableMaterializationRoots(),
    stateHash: await computeStateHash(options.state, {
      codec: options.codec,
      crypto: options.crypto,
    }),
    replayBasis: options.state,
  });
}
