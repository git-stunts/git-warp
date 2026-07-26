import LegacyCheckpointArtifactAdapter from './LegacyCheckpointArtifactAdapter.ts';
import { ProvenanceIndex } from '../../../src/domain/services/provenance/ProvenanceIndex.ts';
import {
  deserializeCheckpointStateEnvelope,
  type CheckpointStateEnvelopeBuffers,
} from '../../../src/domain/services/state/CheckpointSerializer.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import type CodecPort from '../../../src/ports/CodecPort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  type CheckpointCommitMessage,
} from '../../../src/ports/CommitMessageCodecPort.ts';
import {
  type CheckpointMigrationHistory,
  type CheckpointUpgradePayload,
} from './checkpoint-schema-upgrade.ts';
import CheckpointSchemaUpgradeError from './CheckpointSchemaUpgradeError.ts';
import { LEGACY_CHECKPOINT_STORAGE_FORMAT } from './LegacyCheckpointFormat.ts';

export { LEGACY_CHECKPOINT_STORAGE_FORMAT } from './LegacyCheckpointFormat.ts';

/** Recovers schema-5 checkpoint payloads before v19 bundle republication. */
export default class LegacyCheckpointStorageReader {
  readonly #persistence: CheckpointMigrationHistory;
  readonly #artifacts: LegacyCheckpointArtifactAdapter;
  readonly #codec: CodecPort;

  constructor(options: {
    readonly persistence: CheckpointMigrationHistory;
    readonly assetStorage: AssetStoragePort;
    readonly codec: CodecPort;
  }) {
    this.#persistence = options.persistence;
    this.#codec = options.codec;
    this.#artifacts = new LegacyCheckpointArtifactAdapter({
      history: options.persistence,
      assets: options.assetStorage,
    });
  }

  async load(checkpointSha: string): Promise<CheckpointUpgradePayload> {
    const rootTreeOid = await this.#persistence.getCommitTree(checkpointSha);
    const rawTreeOids = await this.#persistence.readTreeOids(rootTreeOid);
    const treeOids = await this.#expandStateTree(rawTreeOids);
    const indexShardOids = await this.#readIndexShardOids(rawTreeOids);
    const indexTree = await this.#readIndexTree(indexShardOids);
    const state = deserializeCheckpointStateEnvelope(
      await this.#readStateEnvelope(checkpointSha, treeOids),
      { codec: this.#codec },
    );
    const frontier = await this.#readFrontier(checkpointSha, treeOids);
    const provenanceIndex = await this.#readProvenanceIndex(treeOids);
    return {
      state,
      frontier,
      ...(indexTree === undefined ? {} : { indexTree }),
      ...(provenanceIndex === undefined
        ? {}
        : { provenanceIndex }),
    };
  }

  async #expandStateTree(
    treeOids: Readonly<Record<string, string>>,
  ): Promise<Record<string, string>> {
    if (treeOids['state/nodeAlive'] !== undefined || treeOids['state'] === undefined) {
      return { ...treeOids };
    }
    const expanded = { ...treeOids };
    for (const [path, oid] of Object.entries(
      await this.#persistence.readTreeOids(treeOids['state']),
    )) {
      expanded[`state/${path}`] = oid;
    }
    return expanded;
  }

  async #readStateEnvelope(
    checkpointSha: string,
    treeOids: Readonly<Record<string, string>>,
  ): Promise<CheckpointStateEnvelopeBuffers> {
    return {
      nodeAlive: await this.#readRequired(checkpointSha, treeOids, 'state/nodeAlive'),
      edgeAlive: await this.#readRequired(checkpointSha, treeOids, 'state/edgeAlive'),
      prop: await this.#readRequired(checkpointSha, treeOids, 'state/prop.cbor'),
      observedFrontier: await this.#readRequired(
        checkpointSha,
        treeOids,
        'state/observedFrontier.cbor',
      ),
      edgeBirthEvent: await this.#readRequired(
        checkpointSha,
        treeOids,
        'state/edgeBirthEvent.cbor',
      ),
    };
  }

  async #readFrontier(
    checkpointSha: string,
    treeOids: Readonly<Record<string, string>>,
  ): Promise<Map<string, string>> {
    const decoded = this.#codec.decode<unknown>(
      await this.#readRequired(checkpointSha, treeOids, 'frontier.cbor'),
    );
    if (!isPlainRecord(decoded)) {
      throw invalidFrontier(checkpointSha);
    }
    const frontier = new Map<string, string>();
    for (const [writerId, sha] of Object.entries(decoded)) {
      if (writerId.length === 0 || typeof sha !== 'string' || sha.length === 0) {
        throw invalidFrontier(checkpointSha);
      }
      frontier.set(writerId, sha);
    }
    return frontier;
  }

  async #readProvenanceIndex(
    treeOids: Readonly<Record<string, string>>,
  ): Promise<ProvenanceIndex | undefined> {
    const oid = treeOids['provenanceIndex.cbor'];
    if (oid === undefined) {
      return undefined;
    }
    return ProvenanceIndex.deserialize(await this.#artifacts.read(oid), {
      codec: this.#codec,
    });
  }

  async #readRequired(
    checkpointSha: string,
    treeOids: Readonly<Record<string, string>>,
    path: string,
  ): Promise<Uint8Array> {
    const oid = treeOids[path];
    if (oid === undefined) {
      throw new CheckpointSchemaUpgradeError(
        `Checkpoint ${checkpointSha} is missing ${path}.`,
      );
    }
    return await this.#artifacts.read(oid);
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

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidFrontier(checkpointSha: string): CheckpointSchemaUpgradeError {
  return new CheckpointSchemaUpgradeError(
    `Checkpoint ${checkpointSha} has an invalid frontier.`,
  );
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
