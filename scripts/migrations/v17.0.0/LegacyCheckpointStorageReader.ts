import LegacyCheckpointArtifactAdapter from '../../../src/infrastructure/adapters/LegacyCheckpointArtifactAdapter.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import type CheckpointStorePort from '../../../src/ports/CheckpointStorePort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  LEGACY_CHECKPOINT_STORAGE_FORMAT,
  type CheckpointCommitMessage,
} from '../../../src/ports/CommitMessageCodecPort.ts';
import {
  type CheckpointMigrationHistory,
  type CheckpointUpgradePayload,
} from './checkpoint-schema-upgrade.ts';
import CheckpointSchemaUpgradeError from './CheckpointSchemaUpgradeError.ts';

/** Recovers schema-5 checkpoint payloads before v19 bundle republication. */
export default class LegacyCheckpointStorageReader {
  readonly #persistence: CheckpointMigrationHistory;
  readonly #checkpointStore: CheckpointStorePort;
  readonly #artifacts: LegacyCheckpointArtifactAdapter;
  readonly #graphName: string;

  constructor(options: {
    readonly persistence: CheckpointMigrationHistory;
    readonly checkpointStore: CheckpointStorePort;
    readonly assetStorage: AssetStoragePort;
    readonly graphName: string;
  }) {
    this.#persistence = options.persistence;
    this.#checkpointStore = options.checkpointStore;
    this.#graphName = options.graphName;
    this.#artifacts = new LegacyCheckpointArtifactAdapter({
      history: options.persistence,
      assets: options.assetStorage,
    });
  }

  async load(checkpointSha: string): Promise<CheckpointUpgradePayload> {
    const loaded = await this.#checkpointStore.loadCheckpoint(checkpointSha, this.#graphName);
    const rootTreeOid = await this.#persistence.getCommitTree(checkpointSha);
    const rawTreeOids = await this.#persistence.readTreeOids(rootTreeOid);
    const indexShardOids = await this.#readIndexShardOids(rawTreeOids);
    const indexTree = await this.#readIndexTree(indexShardOids);
    return {
      state: loaded.state,
      frontier: loaded.frontier,
      ...(indexTree === undefined ? {} : { indexTree }),
      ...(loaded.provenanceIndex === null || loaded.provenanceIndex === undefined
        ? {}
        : { provenanceIndex: loaded.provenanceIndex }),
    };
  }

  async #readIndexShardOids(
    rawTreeOids: Readonly<Record<string, string>>,
  ): Promise<Record<string, string>> {
    const flattened = Object.fromEntries(
      Object.entries(rawTreeOids)
        .filter(([path]) => path.startsWith('index/'))
        .map(([path, oid]) => [path.slice('index/'.length), oid]),
    );
    if (Object.keys(flattened).length > 0 || rawTreeOids['index'] === undefined) {
      return flattened;
    }
    return await this.#persistence.readTreeOids(rawTreeOids['index']);
  }

  async #readIndexTree(
    indexShardOids: Readonly<Record<string, string>>,
  ): Promise<Record<string, Uint8Array> | undefined> {
    const paths = Object.keys(indexShardOids).sort();
    if (paths.length === 0) {
      return undefined;
    }
    const indexTree: Record<string, Uint8Array> = {};
    for (const path of paths) {
      const oid = indexShardOids[path];
      if (oid === undefined || path.length === 0) {
        throw new CheckpointSchemaUpgradeError(
          `Invalid legacy checkpoint index member: ${path || '(empty)'}`,
        );
      }
      indexTree[path] = await this.#artifacts.read(oid);
    }
    return indexTree;
  }
}

export function hasCurrentCheckpointStorage(message: CheckpointCommitMessage): boolean {
  return message.checkpointVersion === CHECKPOINT_STORAGE_FORMAT
    && message.bundleHandle !== null;
}

export function requireMigratableLegacyStorage(
  checkpointSha: string,
  message: CheckpointCommitMessage,
): void {
  if (message.checkpointVersion === CHECKPOINT_STORAGE_FORMAT) {
    throw new CheckpointSchemaUpgradeError(
      `Checkpoint ${checkpointSha} declares ${CHECKPOINT_STORAGE_FORMAT} storage `
        + 'but has no bundle handle; refusing to reinterpret a malformed current checkpoint.',
    );
  }
  if (message.bundleHandle !== null) {
    throw new CheckpointSchemaUpgradeError(
      `Checkpoint ${checkpointSha} carries a bundle handle under unsupported storage `
        + `${message.checkpointVersion ?? '(unspecified)'}.`,
    );
  }
  if (message.checkpointVersion !== null
    && message.checkpointVersion !== LEGACY_CHECKPOINT_STORAGE_FORMAT) {
    throw new CheckpointSchemaUpgradeError(
      `Checkpoint ${checkpointSha} uses unsupported storage `
        + `${message.checkpointVersion}; refusing to reinterpret it as legacy storage.`,
    );
  }
}
