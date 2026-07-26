import { describe, expect, it, vi } from 'vitest';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import { createFrontier, serializeFrontier, updateFrontier } from '../../../src/domain/services/Frontier.ts';
import {
  computeAppliedVV,
  serializeAppliedVV,
  serializeCheckpointStateEnvelope,
  serializeFullState,
} from '../../../src/domain/services/state/CheckpointSerializer.ts';
import { computeStateHash } from '../../../src/domain/services/state/StateSerializer.ts';
import { createCheckpointEnvelope } from '../../../src/domain/services/state/checkpointCreate.ts';
import { loadCheckpoint } from '../../../src/domain/services/state/checkpointLoad.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../src/domain/services/state/checkpointHelpers.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { CborCheckpointStoreAdapter } from '../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasMaterializationStoreAdapter from '../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { textEncode } from '../../../src/domain/utils/bytes.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
} from '../../../src/ports/CommitMessageCodecPort.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';
import retainUnavailableMaterialization from '../../helpers/retainUnavailableMaterialization.ts';
import {
  CheckpointSchemaUpgradeError,
  upgradeCheckpointSchema,
} from '../../../scripts/migrations/v17.0.0/checkpoint-schema-upgrade.ts';
import {
  encodeLegacyCheckpointMessage,
} from '../../../scripts/migrations/v17.0.0/LegacyCheckpointCommitMessageCodec.ts';
import {
  LEGACY_CHECKPOINT_STORAGE_FORMAT,
} from '../../../scripts/migrations/v17.0.0/LegacyCheckpointFormat.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';

const crypto = new NodeCryptoAdapter();
const graphName = 'upgrade-test';
const checkpointRef = buildCheckpointRef(graphName);

function makeOid(prefix: string): string {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
}

function buildState(): WarpState {
  const state = createEmptyState();
  state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
  return state;
}

async function writeRetiredCheckpoint(options: {
  readonly persistence: InMemoryGraphAdapter;
  readonly state: WarpState;
  readonly includeState?: boolean;
  readonly includeIndex?: boolean;
}): Promise<string> {
  const frontier = createFrontier();
  updateFrontier(frontier, 'writer-a', makeOid('patch-a'));
  const stateHash = await computeStateHash(options.state, { crypto, codec: defaultCodec });
  const frontierOid = await options.persistence.writeBlob(serializeFrontier(frontier, { codec: defaultCodec }));
  const appliedVVOid = await options.persistence.writeBlob(
    serializeAppliedVV(computeAppliedVV(options.state), { codec: defaultCodec }),
  );

  const treeEntries = [
    `100644 blob ${frontierOid}\tfrontier.cbor`,
    `100644 blob ${appliedVVOid}\tappliedVV.cbor`,
  ];

  if (options.includeState !== false) {
    const stateOid = await options.persistence.writeBlob(serializeFullState(options.state, { codec: defaultCodec }));
    treeEntries.push(`100644 blob ${stateOid}\tstate.cbor`);
  }

  if (options.includeIndex === true) {
    const indexOid = await options.persistence.writeBlob(new Uint8Array([1, 2, 3]));
    treeEntries.push(`100644 blob ${indexOid}\tindex/nodes/shard.cbor`);
  }

  treeEntries.sort();
  const treeOid = await options.persistence.writeTree(treeEntries);
  const message = encodeLegacyCheckpointMessage({
    graph: graphName,
    stateHash,
    schema: 4,
  });
  const checkpointSha = await options.persistence.commitNodeWithTree({
    treeOid,
    parents: [],
    message,
  });
  await options.persistence.updateRef(checkpointRef, checkpointSha);
  return checkpointSha;
}

describe('checkpoint schema upgrade script boundary', () => {
  it('dry-runs a retired checkpoint without moving the checkpoint ref', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const retiredCheckpointSha = await writeRetiredCheckpoint({
      persistence,
      state: buildState(),
      includeIndex: true,
    });

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      dryRun: true,
      crypto,
      ...migrationStorage,
    });

    expect(result.status).toBe('would-upgrade');
    expect(result.previousCheckpointSha).toBe(retiredCheckpointSha);
    expect(result.upgradedCheckpointSha).toBeNull();
    expect(await persistence.readRef(checkpointRef)).toBe(retiredCheckpointSha);
  });

  it('writes a current checkpoint and updates the checkpoint ref after verification', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const retiredCheckpointSha = await writeRetiredCheckpoint({
      persistence,
      state: buildState(),
      includeIndex: true,
    });

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    });

    expect(result.status).toBe('upgraded');
    expect(result.previousCheckpointSha).toBe(retiredCheckpointSha);
    expect(result.upgradedCheckpointSha).not.toBe(retiredCheckpointSha);
    expect(await persistence.readRef(checkpointRef)).toBe(result.upgradedCheckpointSha);

    const upgradedSha = result.upgradedCheckpointSha;
    expect(upgradedSha).not.toBeNull();
    if (upgradedSha === null) {
      throw new Error('Expected upgraded checkpoint SHA');
    }
    const loaded = await loadCheckpoint(migrationStorage.checkpointStore, upgradedSha);
    expect(loaded.schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    expect(loaded.state.nodeAlive.contains('node:a')).toBe(true);
    expect(loaded.indexShardHandles).toBeNull();
    expect(loaded.indexRoot).toBeNull();
  });

  it('does not move the checkpoint ref when the retired payload is incomplete', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const retiredCheckpointSha = await writeRetiredCheckpoint({
      persistence,
      state: buildState(),
      includeState: false,
    });

    await expect(upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    })).rejects.toThrow(CheckpointSchemaUpgradeError);
    expect(await persistence.readRef(checkpointRef)).toBe(retiredCheckpointSha);
  });

  it('republishes schema-5 state without copying its derived pointer-backed index', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const indexBytes = new Uint8Array([9, 8, 7, 6]);
    const supportSha = await persistence.commitNode({ message: 'support', parents: [] });
    const legacyCheckpointSha = await writeLegacyCurrentCheckpoint({
      persistence,
      assetStorage: migrationStorage.assetStorage,
      state: buildState(),
      indexBytes,
      pointerBackedIndex: true,
      parents: [supportSha],
    });

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    });

    expect(result.status).toBe('upgraded');
    expect(result.previousCheckpointSha).toBe(legacyCheckpointSha);
    expect(result.previousSchema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    expect(result.previousStorageVersion).toBe(LEGACY_CHECKPOINT_STORAGE_FORMAT);
    expect(result.currentStorageVersion).toBe(CHECKPOINT_STORAGE_FORMAT);

    const upgradedSha = result.upgradedCheckpointSha;
    if (upgradedSha === null) {
      throw new Error('Expected upgraded checkpoint SHA');
    }
    const metadata = DEFAULT_COMMIT_MESSAGE_CODEC.decodeCheckpoint(
      await persistence.showNode(upgradedSha),
    );
    expect(metadata.checkpointVersion).toBe(CHECKPOINT_STORAGE_FORMAT);
    expect(metadata.bundleHandle).not.toBeNull();
    expect((await persistence.getNodeInfo(upgradedSha)).parents).toEqual([supportSha]);
    expect((await persistence.getNodeInfo(upgradedSha)).parents)
      .not.toContain(legacyCheckpointSha);

    const loaded = await migrationStorage.checkpointStore.loadCheckpoint(upgradedSha);
    expect(loaded.state.nodeAlive.contains('node:a')).toBe(true);
    expect(loaded.state.nodeAlive.contains('node:a')).toBe(true);
    expect(loaded.indexShardHandles).toBeNull();
    expect(loaded.indexRoot).toBeNull();
    expect(loaded.propertyRoot).toBeNull();
  });

  it('dry-runs schema-5 storage migration without moving the checkpoint ref', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const legacyCheckpointSha = await writeLegacyCurrentCheckpoint({
      persistence,
      assetStorage: migrationStorage.assetStorage,
      state: buildState(),
      indexBytes: new Uint8Array([1, 3, 5]),
      pointerBackedIndex: false,
    });

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      dryRun: true,
      crypto,
      ...migrationStorage,
    });

    expect(result.status).toBe('would-upgrade');
    expect(result.previousSchema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    expect(result.previousStorageVersion).toBe(LEGACY_CHECKPOINT_STORAGE_FORMAT);
    expect(await persistence.readRef(checkpointRef)).toBe(legacyCheckpointSha);
  });

  it('does not overwrite a checkpoint ref advanced during migration', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const legacyCheckpointSha = await writeLegacyCurrentCheckpoint({
      persistence,
      assetStorage: migrationStorage.assetStorage,
      state: buildState(),
      indexBytes: new Uint8Array([2, 4, 6]),
      pointerBackedIndex: false,
    });
    const readNodeInfo = persistence.getNodeInfo.bind(persistence);
    let concurrentCheckpointSha: string | null = null;
    vi.spyOn(persistence, 'getNodeInfo').mockImplementation(async (sha) => {
      const info = await readNodeInfo(sha);
      if (sha === legacyCheckpointSha && concurrentCheckpointSha === null) {
        concurrentCheckpointSha = await persistence.commitNode({
          message: 'concurrent checkpoint',
          parents: [],
        });
        await persistence.updateRef(checkpointRef, concurrentCheckpointSha);
      }
      return info;
    });

    await expect(upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    })).rejects.toThrow();
    expect(concurrentCheckpointSha).not.toBeNull();
    expect(await persistence.readRef(checkpointRef)).toBe(concurrentCheckpointSha);
  });

  it('rejects a checkpoint that declares v19 storage without a bundle handle', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const malformedCheckpointSha = await persistence.commitNode({
      message: malformedCurrentCheckpointMessage(),
      parents: [],
    });
    await persistence.updateRef(checkpointRef, malformedCheckpointSha);

    await expect(upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    })).rejects.toThrow('has no bundle handle');
    expect(await persistence.readRef(checkpointRef)).toBe(malformedCheckpointSha);
  });

  it('rejects an unrecognized checkpoint storage version instead of treating it as legacy', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const malformedCheckpointSha = await persistence.commitNode({
      message: legacyCheckpointMessage().replace(
        `eg-checkpoint: ${LEGACY_CHECKPOINT_STORAGE_FORMAT}`,
        'eg-checkpoint: v999',
      ),
      parents: [],
    });
    await persistence.updateRef(checkpointRef, malformedCheckpointSha);

    await expect(upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    })).rejects.toThrow('unsupported storage v999');
    expect(await persistence.readRef(checkpointRef)).toBe(malformedCheckpointSha);
  });

  it('leaves an already-current checkpoint alone', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const state = buildState();
    const frontier = createFrontier();
    updateFrontier(frontier, 'writer-a', makeOid('patch-a'));
    const currentCheckpointSha = await createCurrentCheckpoint({
      storage: migrationStorage,
      graphName,
      state,
      frontier,
    });

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    });

    expect(result.status).toBe('already-current');
    expect(result.upgradedCheckpointSha).toBe(currentCheckpointSha);
    expect(await persistence.readRef(checkpointRef)).toBe(currentCheckpointSha);
  });

  it('rejects a checkpoint ref that names another graph', async () => {
    const persistence = new InMemoryGraphAdapter();
    const migrationStorage = createCheckpointMigrationStorage(persistence);
    const foreignCheckpointSha = await createCurrentCheckpoint({
      storage: migrationStorage,
      graphName: 'other-graph',
      state: buildState(),
      frontier: createFrontier(),
    });
    await persistence.updateRef(checkpointRef, foreignCheckpointSha);

    await expect(upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
      ...migrationStorage,
    })).rejects.toMatchObject({ code: 'E_CHECKPOINT_GRAPH_MISMATCH' });
    expect(await persistence.readRef(checkpointRef)).toBe(foreignCheckpointSha);
  });
});

function createCheckpointMigrationStorage(
  persistence: InMemoryGraphAdapter,
): {
  readonly checkpointStore: CborCheckpointStoreAdapter;
  readonly assetStorage: GitCasAssetStorageAdapter;
  readonly materializationStore: GitCasMaterializationStoreAdapter;
} {
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history: persistence, storage: backing });
  const assetStorage = new GitCasAssetStorageAdapter({ cas });
  const materializationStore = new GitCasMaterializationStoreAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'test-graph',
  });
  return {
    checkpointStore: new CborCheckpointStoreAdapter({
      codec: defaultCodec,
      crypto: new NodeCryptoAdapter(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
      history: persistence,
      cas,
    }),
    assetStorage,
    materializationStore,
  };
}

async function createCurrentCheckpoint(options: {
  storage: ReturnType<typeof createCheckpointMigrationStorage>;
  graphName: string;
  state: ReturnType<typeof buildState>;
  frontier: Map<string, string>;
}): Promise<string> {
  const materialization = await retainUnavailableMaterialization({
    materializations: options.storage.materializationStore,
    frontier: options.frontier,
    state: options.state,
    crypto,
    codec: defaultCodec,
  });
  return await createCheckpointEnvelope({
    checkpointStore: options.storage.checkpointStore,
    graphName: options.graphName,
    state: options.state,
    frontier: options.frontier,
    crypto,
    codec: defaultCodec,
    materialization,
  });
}

async function writeLegacyCurrentCheckpoint(options: {
  readonly persistence: InMemoryGraphAdapter;
  readonly assetStorage: AssetStoragePort;
  readonly state: WarpState;
  readonly indexBytes: Uint8Array;
  readonly pointerBackedIndex: boolean;
  readonly parents?: string[];
}): Promise<string> {
  const frontier = createFrontier();
  updateFrontier(frontier, 'writer-a', makeOid('patch-a'));
  const envelope = serializeCheckpointStateEnvelope(options.state, { codec: defaultCodec });
  const stateEntries = await writeStateEnvelope(options.persistence, envelope);
  const stateTreeOid = await options.persistence.writeTree(stateEntries);
  const frontierOid = await options.persistence.writeBlob(
    defaultCodec.encode(Object.fromEntries(frontier)),
  );
  const appliedVVOid = await options.persistence.writeBlob(
    defaultCodec.encode(VersionVector.serialize(computeAppliedVV(options.state))),
  );
  const indexOid = options.pointerBackedIndex
    ? await writeLegacyCasPointer(options.persistence, options.assetStorage, options.indexBytes)
    : await options.persistence.writeBlob(options.indexBytes);
  const indexTreeOid = await options.persistence.writeTree([
    `100644 blob ${indexOid}\tnodes/shard.cbor`,
  ]);
  const rootTreeOid = await options.persistence.writeTree([
    `100644 blob ${appliedVVOid}\tappliedVV.cbor`,
    `100644 blob ${frontierOid}\tfrontier.cbor`,
    `040000 tree ${indexTreeOid}\tindex`,
    `040000 tree ${stateTreeOid}\tstate`,
  ]);
  const stateHash = await computeStateHash(options.state, { crypto, codec: defaultCodec });
  const checkpointSha = await options.persistence.commitNodeWithTree({
    treeOid: rootTreeOid,
    parents: options.parents ?? [],
    message: encodeLegacyCheckpointMessage({
      graph: graphName,
      stateHash,
      schema: CURRENT_CHECKPOINT_SCHEMA,
    }),
  });
  await options.persistence.updateRef(checkpointRef, checkpointSha);
  return checkpointSha;
}

async function writeStateEnvelope(
  persistence: InMemoryGraphAdapter,
  envelope: ReturnType<typeof serializeCheckpointStateEnvelope>,
): Promise<string[]> {
  return await Promise.all([
    writeTreeEntry(persistence, 'edgeAlive', envelope.edgeAlive),
    writeTreeEntry(persistence, 'edgeBirthEvent.cbor', envelope.edgeBirthEvent),
    writeTreeEntry(persistence, 'nodeAlive', envelope.nodeAlive),
    writeTreeEntry(persistence, 'observedFrontier.cbor', envelope.observedFrontier),
    writeTreeEntry(persistence, 'prop.cbor', envelope.prop),
  ]);
}

async function writeTreeEntry(
  persistence: InMemoryGraphAdapter,
  path: string,
  bytes: Uint8Array,
): Promise<string> {
  return `100644 blob ${await persistence.writeBlob(bytes)}\t${path}`;
}

async function writeLegacyCasPointer(
  persistence: InMemoryGraphAdapter,
  assetStorage: AssetStoragePort,
  bytes: Uint8Array,
): Promise<string> {
  const staged = await assetStorage.stage(singleChunk(bytes), {
    slug: 'legacy-checkpoint-index',
    filename: 'shard.cbor',
    expectedSize: bytes.length,
  });
  return await persistence.writeBlob(
    textEncode(`git-warp:cas-pointer:v1:${staged.handle.toString()}`),
  );
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

function malformedCurrentCheckpointMessage(): string {
  return legacyCheckpointMessage().replace(
    `eg-checkpoint: ${LEGACY_CHECKPOINT_STORAGE_FORMAT}`,
    `eg-checkpoint: ${CHECKPOINT_STORAGE_FORMAT}`,
  );
}

function legacyCheckpointMessage(): string {
  return encodeLegacyCheckpointMessage({
    graph: graphName,
    stateHash: '0'.repeat(64),
    schema: CURRENT_CHECKPOINT_SCHEMA,
  });
}
