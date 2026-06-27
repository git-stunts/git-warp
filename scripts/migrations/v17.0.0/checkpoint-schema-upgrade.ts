import { createCheckpointEnvelope } from '../../../src/domain/services/state/checkpointCreate.ts';
import { loadCheckpoint } from '../../../src/domain/services/state/checkpointLoad.ts';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  isCurrentCheckpointSchema,
  partitionTreeOids,
} from '../../../src/domain/services/state/checkpointHelpers.ts';
import {
  deserializeFullState,
} from '../../../src/domain/services/state/CheckpointSerializer.ts';
import { deserializeFrontier } from '../../../src/domain/services/Frontier.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { ProvenanceIndex } from '../../../src/domain/services/provenance/ProvenanceIndex.ts';
import type GraphPersistencePort from '../../../src/ports/GraphPersistencePort.ts';
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

export interface CheckpointSchemaUpgradeOptions {
  readonly persistence: GraphPersistencePort;
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
    indexOid: checkpointMessage.indexOid,
    checkpointSha: previousCheckpointSha,
    ...(options.codec === undefined ? {} : { codec: options.codec }),
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
    persistence: options.persistence,
    graphName: options.graphName,
    state: retiredPayload.state,
    frontier: retiredPayload.frontier,
    parents: [previousCheckpointSha],
    commitMessageCodec,
    ...(options.codec === undefined ? {} : { codec: options.codec }),
    ...(options.crypto === undefined ? {} : { crypto: options.crypto }),
    ...(retiredPayload.indexTree === undefined ? {} : { indexTree: retiredPayload.indexTree }),
    ...(retiredPayload.provenanceIndex === undefined ? {} : { provenanceIndex: retiredPayload.provenanceIndex }),
  });

  await loadCheckpoint(options.persistence, upgradedCheckpointSha, {
    commitMessageCodec,
    ...(options.codec === undefined ? {} : { codec: options.codec }),
  });
  await options.persistence.updateRef(checkpointRef, upgradedCheckpointSha);

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

function isRetiredCheckpointSchema(schema: number): schema is typeof RETIRED_CHECKPOINT_SCHEMAS[number] {
  return RETIRED_CHECKPOINT_SCHEMAS.some((retiredSchema) => retiredSchema === schema);
}

async function loadRetiredCheckpointPayload(options: {
  readonly persistence: GraphPersistencePort;
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
  persistence: GraphPersistencePort,
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
  persistence: GraphPersistencePort,
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
