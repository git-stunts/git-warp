import { createCheckpointEnvelope } from '../../../src/domain/services/state/checkpointCreate.ts';
import { loadCheckpoint } from '../../../src/domain/services/state/checkpointLoad.ts';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  isCurrentCheckpointSchema,
} from '../../../src/domain/services/state/checkpointHelpers.ts';
import {
  deserializeFullState,
} from '../../../src/domain/services/state/CheckpointSerializer.ts';
import { deserializeFrontier } from '../../../src/domain/services/Frontier.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { ProvenanceIndex } from '../../../src/domain/services/provenance/ProvenanceIndex.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import type CodecPort from '../../../src/ports/CodecPort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  type default as CommitMessageCodecPort,
} from '../../../src/ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../../src/ports/CryptoPort.ts';
import type CheckpointStorePort from '../../../src/ports/CheckpointStorePort.ts';
import LegacyCheckpointStorageReader, {
  hasCurrentCheckpointStorage,
  requireMigratableLegacyStorage,
} from './LegacyCheckpointStorageReader.ts';
import CheckpointSchemaUpgradeError from './CheckpointSchemaUpgradeError.ts';

export { default as CheckpointSchemaUpgradeError } from './CheckpointSchemaUpgradeError.ts';

const RETIRED_CHECKPOINT_SCHEMAS = [2, 3, 4] as const;

type UpgradeStatus = 'missing-checkpoint' | 'already-current' | 'would-upgrade' | 'upgraded';

/** Legacy Git history surface required only by the retired-checkpoint migrator. */
export interface CheckpointMigrationHistory {
  readBlob(oid: string): Promise<Uint8Array>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  showNode(sha: string): Promise<string>;
  getNodeInfo(sha: string): Promise<{ readonly parents: string[] }>;
  getCommitTree(sha: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
}

export interface CheckpointSchemaUpgradeOptions {
  readonly persistence: CheckpointMigrationHistory;
  readonly graphName: string;
  readonly dryRun?: boolean;
  readonly codec?: CodecPort;
  readonly commitMessageCodec?: CommitMessageCodecPort;
  readonly crypto?: CryptoPort;
  readonly checkpointStore: CheckpointStorePort;
  readonly assetStorage: AssetStoragePort;
}

export interface CheckpointSchemaUpgradeResult {
  readonly status: UpgradeStatus;
  readonly graphName: string;
  readonly checkpointRef: string;
  readonly previousCheckpointSha: string | null;
  readonly upgradedCheckpointSha: string | null;
  readonly previousSchema: number | null;
  readonly currentSchema: number;
  readonly previousStorageVersion: string | null;
  readonly currentStorageVersion: string;
}

export interface CheckpointUpgradePayload {
  readonly state: ReturnType<typeof deserializeFullState>;
  readonly frontier: Map<string, string>;
  readonly indexTree?: Record<string, Uint8Array>;
  readonly provenanceIndex?: ProvenanceIndex;
}

export async function upgradeCheckpointSchema(
  options: CheckpointSchemaUpgradeOptions,
): Promise<CheckpointSchemaUpgradeResult> {
  const commitMessageCodec = options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
  const codec = options.codec ?? defaultCodec;
  const checkpointStore = options.checkpointStore;
  const checkpointRef = buildCheckpointRef(options.graphName);
  const previousCheckpointSha = await options.persistence.readRef(checkpointRef);

  if (previousCheckpointSha === null) {
    return {
      status: 'missing-checkpoint',
      graphName: options.graphName,
      checkpointRef,
      previousCheckpointSha: null,
      upgradedCheckpointSha: null,
      previousSchema: null,
      currentSchema: CURRENT_CHECKPOINT_SCHEMA,
      previousStorageVersion: null,
      currentStorageVersion: CHECKPOINT_STORAGE_FORMAT,
    };
  }

  const checkpointMessage = commitMessageCodec.decodeCheckpoint(
    await options.persistence.showNode(previousCheckpointSha),
  );

  if (isCurrentCheckpointSchema(checkpointMessage.schema)
    && hasCurrentCheckpointStorage(checkpointMessage)) {
    await loadCheckpoint(checkpointStore, previousCheckpointSha, options.graphName);
    return {
      status: 'already-current',
      graphName: options.graphName,
      checkpointRef,
      previousCheckpointSha,
      upgradedCheckpointSha: previousCheckpointSha,
      previousSchema: checkpointMessage.schema,
      currentSchema: CURRENT_CHECKPOINT_SCHEMA,
      previousStorageVersion: checkpointMessage.checkpointVersion,
      currentStorageVersion: CHECKPOINT_STORAGE_FORMAT,
    };
  }

  if (isCurrentCheckpointSchema(checkpointMessage.schema)) {
    requireMigratableLegacyStorage(previousCheckpointSha, checkpointMessage);
  } else if (!isRetiredCheckpointSchema(checkpointMessage.schema)) {
    throw new CheckpointSchemaUpgradeError(
      `Checkpoint ${previousCheckpointSha} uses unsupported schema:${checkpointMessage.schema}. ` +
        `This migration can upgrade retired schemas ${RETIRED_CHECKPOINT_SCHEMAS.join(', ')} only.`,
    );
  }

  const payload = isCurrentCheckpointSchema(checkpointMessage.schema)
    ? await new LegacyCheckpointStorageReader({
        persistence: options.persistence,
        checkpointStore,
        assetStorage: options.assetStorage,
        graphName: options.graphName,
      }).load(previousCheckpointSha)
    : await loadRetiredCheckpointPayload({
        persistence: options.persistence,
        rootTreeOid: await options.persistence.getCommitTree(previousCheckpointSha),
        checkpointSha: previousCheckpointSha,
        codec,
      });

  if (options.dryRun === true) {
    return {
      status: 'would-upgrade',
      graphName: options.graphName,
      checkpointRef,
      previousCheckpointSha,
      upgradedCheckpointSha: null,
      previousSchema: checkpointMessage.schema,
      currentSchema: CURRENT_CHECKPOINT_SCHEMA,
      previousStorageVersion: checkpointMessage.checkpointVersion,
      currentStorageVersion: CHECKPOINT_STORAGE_FORMAT,
    };
  }

  const upgradedCheckpointSha = await createCheckpointEnvelope({
    checkpointStore,
    graphName: options.graphName,
    state: payload.state,
    frontier: payload.frontier,
    parents: (await options.persistence.getNodeInfo(previousCheckpointSha)).parents,
    expectedCheckpointSha: previousCheckpointSha,
    codec,
    ...(options.crypto === undefined ? {} : { crypto: options.crypto }),
    ...(payload.indexTree === undefined ? {} : { indexTree: payload.indexTree }),
    ...(payload.provenanceIndex === undefined ? {} : { provenanceIndex: payload.provenanceIndex }),
  });

  await loadCheckpoint(checkpointStore, upgradedCheckpointSha, options.graphName);

  return {
    status: 'upgraded',
    graphName: options.graphName,
    checkpointRef,
    previousCheckpointSha,
    upgradedCheckpointSha,
    previousSchema: checkpointMessage.schema,
    currentSchema: CURRENT_CHECKPOINT_SCHEMA,
    previousStorageVersion: checkpointMessage.checkpointVersion,
    currentStorageVersion: CHECKPOINT_STORAGE_FORMAT,
  };
}

function isRetiredCheckpointSchema(schema: number): schema is typeof RETIRED_CHECKPOINT_SCHEMAS[number] {
  return RETIRED_CHECKPOINT_SCHEMAS.some((retiredSchema) => retiredSchema === schema);
}

function partitionTreeOids(rawOids: Record<string, string>): {
  treeOids: Record<string, string>;
  indexShardOids: Record<string, string>;
} {
  const treeOids = new Map<string, string>();
  const indexShardOids = new Map<string, string>();
  for (const [path, oid] of Object.entries(rawOids)) {
    if (path.startsWith('index/')) {
      indexShardOids.set(path.slice('index/'.length), oid);
    } else {
      treeOids.set(path, oid);
    }
  }
  return {
    treeOids: Object.fromEntries(treeOids),
    indexShardOids: Object.fromEntries(indexShardOids),
  };
}

async function loadRetiredCheckpointPayload(options: {
  readonly persistence: CheckpointMigrationHistory;
  readonly rootTreeOid: string;
  readonly checkpointSha: string;
  readonly codec?: CodecPort;
}): Promise<CheckpointUpgradePayload> {
  const rawTreeOids = await options.persistence.readTreeOids(options.rootTreeOid);
  const { treeOids, indexShardOids } = partitionTreeOids(rawTreeOids);
  const codecOpt = options.codec === undefined ? {} : { codec: options.codec };

  const stateOid = requireTreeOid(options.checkpointSha, treeOids, 'state.cbor');
  const frontierOid = requireTreeOid(options.checkpointSha, treeOids, 'frontier.cbor');

  const state = deserializeFullState(await options.persistence.readBlob(stateOid), codecOpt);
  const frontier = deserializeFrontier(await options.persistence.readBlob(frontierOid), codecOpt);
  const indexTree = await readIndexTree(
    indexShardOids,
    async (oid) => await options.persistence.readBlob(oid),
  );
  const provenanceIndex = await readProvenanceIndex(options.persistence, treeOids, codecOpt);

  return {
    state,
    frontier,
    ...(indexTree === undefined ? {} : { indexTree }),
    ...(provenanceIndex === undefined ? {} : { provenanceIndex }),
  };
}

function requireTreeOid(checkpointSha: string, treeOids: Record<string, string>, path: string): string {
  const oid = treeOids[path];
  if (oid !== undefined) {
    return oid;
  }
  throw new CheckpointSchemaUpgradeError(
    `Retired checkpoint ${checkpointSha} is missing ${path}; cannot upgrade safely.`,
  );
}

async function readIndexTree(
  indexShardOids: Record<string, string>,
  readArtifact: (oid: string) => Promise<Uint8Array>,
): Promise<Record<string, Uint8Array> | undefined> {
  const paths = Object.keys(indexShardOids).sort();
  if (paths.length === 0) {
    return undefined;
  }

  const indexTree: Record<string, Uint8Array> = {};
  for (const path of paths) {
    const oid = indexShardOids[path];
    if (oid === undefined) {
      throw new CheckpointSchemaUpgradeError(`Missing retired checkpoint index OID for ${path}`);
    }
    if (path.length === 0) {
      throw new CheckpointSchemaUpgradeError('Retired checkpoint index path is empty');
    }
    indexTree[path] = await readArtifact(oid);
  }
  return indexTree;
}

async function readProvenanceIndex(
  persistence: CheckpointMigrationHistory,
  treeOids: Record<string, string>,
  codecOpt: { readonly codec?: CodecPort },
): Promise<ProvenanceIndex | undefined> {
  const provenanceIndexOid = treeOids['provenanceIndex.cbor'];
  if (provenanceIndexOid === undefined) {
    return undefined;
  }
  const provenanceIndexBuffer = await persistence.readBlob(provenanceIndexOid);
  return ProvenanceIndex.deserialize(provenanceIndexBuffer, codecOpt);
}
