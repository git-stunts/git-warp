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
import { CborCheckpointStoreAdapter } from '../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import type AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { ProvenanceIndex } from '../../../src/domain/services/provenance/ProvenanceIndex.ts';
import type CodecPort from '../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../src/ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../../src/ports/CryptoPort.ts';

const RETIRED_CHECKPOINT_SCHEMAS = [2, 3, 4] as const;

type UpgradeStatus = 'missing-checkpoint' | 'already-current' | 'would-upgrade' | 'upgraded';

export class CheckpointSchemaUpgradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointSchemaUpgradeError';
  }
}

/** Legacy Git history surface required only by the retired-checkpoint migrator. */
export interface CheckpointMigrationHistory {
  writeBlob(content: Uint8Array | string): Promise<string>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeTree(entries: string[]): Promise<string>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  commitNode(options: { message: string; parents: string[] }): Promise<string>;
  commitNodeWithTree(options: {
    treeOid: string;
    parents: string[];
    message: string;
  }): Promise<string>;
  showNode(sha: string): Promise<string>;
  getCommitTree(sha: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
}

export interface CheckpointSchemaUpgradeOptions {
  readonly persistence: CheckpointMigrationHistory;
  readonly graphName: string;
  readonly dryRun?: boolean;
  readonly codec?: CodecPort;
  readonly commitMessageCodec?: CommitMessageCodecPort;
  readonly crypto?: CryptoPort;
}

export interface CheckpointSchemaUpgradeResult {
  readonly status: UpgradeStatus;
  readonly graphName: string;
  readonly checkpointRef: string;
  readonly previousCheckpointSha: string | null;
  readonly upgradedCheckpointSha: string | null;
  readonly previousSchema: number | null;
  readonly currentSchema: number;
}

interface RetiredCheckpointPayload {
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
  const checkpointStore = new CborCheckpointStoreAdapter({
    codec,
    commitMessageCodec,
    history: options.persistence,
    assetStorage: legacyMigrationAssetStorage(options.persistence),
  });
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
    };
  }

  const checkpointMessage = commitMessageCodec.decodeCheckpoint(
    await options.persistence.showNode(previousCheckpointSha),
  );

  if (isCurrentCheckpointSchema(checkpointMessage.schema)) {
    return {
      status: 'already-current',
      graphName: options.graphName,
      checkpointRef,
      previousCheckpointSha,
      upgradedCheckpointSha: previousCheckpointSha,
      previousSchema: checkpointMessage.schema,
      currentSchema: CURRENT_CHECKPOINT_SCHEMA,
    };
  }

  if (!isRetiredCheckpointSchema(checkpointMessage.schema)) {
    throw new CheckpointSchemaUpgradeError(
      `Checkpoint ${previousCheckpointSha} uses unsupported schema:${checkpointMessage.schema}. ` +
        `This migration can upgrade retired schemas ${RETIRED_CHECKPOINT_SCHEMAS.join(', ')} only.`,
    );
  }

  const retiredPayload = await loadRetiredCheckpointPayload({
    persistence: options.persistence,
    indexOid: await options.persistence.getCommitTree(previousCheckpointSha),
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
    };
  }

  const upgradedCheckpointSha = await createCheckpointEnvelope({
    checkpointStore,
    graphName: options.graphName,
    state: retiredPayload.state,
    frontier: retiredPayload.frontier,
    parents: [previousCheckpointSha],
    codec,
    ...(options.crypto === undefined ? {} : { crypto: options.crypto }),
    ...(retiredPayload.indexTree === undefined ? {} : { indexTree: retiredPayload.indexTree }),
    ...(retiredPayload.provenanceIndex === undefined ? {} : { provenanceIndex: retiredPayload.provenanceIndex }),
  });

  await loadCheckpoint(checkpointStore, upgradedCheckpointSha);

  return {
    status: 'upgraded',
    graphName: options.graphName,
    checkpointRef,
    previousCheckpointSha,
    upgradedCheckpointSha,
    previousSchema: checkpointMessage.schema,
    currentSchema: CURRENT_CHECKPOINT_SCHEMA,
  };
}

function legacyMigrationAssetStorage(
  persistence: CheckpointMigrationHistory,
): AssetStoragePort {
  return {
    stage: () => Promise.reject(new CheckpointSchemaUpgradeError(
      'Checkpoint migration does not stage standalone assets',
    )),
    open: (handle: AssetHandle): AsyncIterable<Uint8Array> => (async function* () {
      yield await persistence.readBlob(handle.toString());
    })(),
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
  readonly indexOid: string;
  readonly checkpointSha: string;
  readonly codec?: CodecPort;
}): Promise<RetiredCheckpointPayload> {
  const rawTreeOids = await options.persistence.readTreeOids(options.indexOid);
  const { treeOids, indexShardOids } = partitionTreeOids(rawTreeOids);
  const codecOpt = options.codec === undefined ? {} : { codec: options.codec };

  const stateOid = requireTreeOid(options.checkpointSha, treeOids, 'state.cbor');
  const frontierOid = requireTreeOid(options.checkpointSha, treeOids, 'frontier.cbor');

  const state = deserializeFullState(await options.persistence.readBlob(stateOid), codecOpt);
  const frontier = deserializeFrontier(await options.persistence.readBlob(frontierOid), codecOpt);
  const indexTree = await readIndexTree(options.persistence, indexShardOids);
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
  persistence: CheckpointMigrationHistory,
  indexShardOids: Record<string, string>,
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
    indexTree[path] = await persistence.readBlob(oid);
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
