import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import { createFrontier, serializeFrontier, updateFrontier } from '../../../src/domain/services/Frontier.ts';
import {
  computeAppliedVV,
  serializeAppliedVV,
  serializeFullState,
} from '../../../src/domain/services/state/CheckpointSerializer.ts';
import { computeStateHash } from '../../../src/domain/services/state/StateSerializer.ts';
import { createCheckpointEnvelope } from '../../../src/domain/services/state/checkpointCreate.ts';
import { loadCheckpoint } from '../../../src/domain/services/state/checkpointLoad.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../src/domain/services/state/checkpointHelpers.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import {
  CheckpointSchemaUpgradeError,
  upgradeCheckpointSchema,
} from '../../../scripts/migrations/v17.0.0/checkpoint-schema-upgrade.ts';
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
  const message = DEFAULT_COMMIT_MESSAGE_CODEC.encodeCheckpoint({
    kind: 'checkpoint',
    graph: graphName,
    stateHash,
    frontierOid,
    indexOid: treeOid,
    schema: 4,
    checkpointVersion: null,
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
    });

    expect(result.status).toBe('would-upgrade');
    expect(result.previousCheckpointSha).toBe(retiredCheckpointSha);
    expect(result.upgradedCheckpointSha).toBeNull();
    expect(await persistence.readRef(checkpointRef)).toBe(retiredCheckpointSha);
  });

  it('writes a current checkpoint and updates the checkpoint ref after verification', async () => {
    const persistence = new InMemoryGraphAdapter();
    const retiredCheckpointSha = await writeRetiredCheckpoint({
      persistence,
      state: buildState(),
      includeIndex: true,
    });

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
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
    const loaded = await loadCheckpoint(persistence, upgradedSha, {
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
      codec: defaultCodec,
    });
    expect(loaded.schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    expect(loaded.state.nodeAlive.contains('node:a')).toBe(true);
    expect(loaded.indexShardOids).toEqual({ 'nodes/shard.cbor': expect.any(String) });
  });

  it('does not move the checkpoint ref when the retired payload is incomplete', async () => {
    const persistence = new InMemoryGraphAdapter();
    const retiredCheckpointSha = await writeRetiredCheckpoint({
      persistence,
      state: buildState(),
      includeState: false,
    });

    await expect(upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
    })).rejects.toThrow(CheckpointSchemaUpgradeError);
    expect(await persistence.readRef(checkpointRef)).toBe(retiredCheckpointSha);
  });

  it('leaves an already-current checkpoint alone', async () => {
    const persistence = new InMemoryGraphAdapter();
    const state = buildState();
    const frontier = createFrontier();
    updateFrontier(frontier, 'writer-a', makeOid('patch-a'));
    const currentCheckpointSha = await createCheckpointEnvelope({
      persistence,
      graphName,
      state,
      frontier,
      crypto,
      codec: defaultCodec,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });
    await persistence.updateRef(checkpointRef, currentCheckpointSha);

    const result = await upgradeCheckpointSchema({
      persistence,
      graphName,
      crypto,
    });

    expect(result.status).toBe('already-current');
    expect(result.upgradedCheckpointSha).toBe(currentCheckpointSha);
    expect(await persistence.readRef(checkpointRef)).toBe(currentCheckpointSha);
  });
});
