import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCrypto from '../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import type CheckpointStorePort from '../../../src/ports/CheckpointStorePort.ts';
import type RuntimeStorageProviderPort from '../../../src/ports/RuntimeStorageProviderPort.ts';

export interface CheckpointMigrationStorage {
  readonly checkpointStore: CheckpointStorePort;
  readonly assetStorage: AssetStoragePort;
}

/** Resolves current semantic storage for one legacy checkpoint migration. */
export async function openCheckpointMigrationStore(
  runtimeStorage: RuntimeStorageProviderPort,
  graphName: string,
): Promise<CheckpointMigrationStorage> {
  const services = await runtimeStorage.createRuntimeStorageServices({
    timelineName: graphName,
    codec: defaultCodec,
    crypto: defaultCrypto,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return Object.freeze({
    checkpointStore: services.checkpoints,
    assetStorage: services.content,
  });
}
