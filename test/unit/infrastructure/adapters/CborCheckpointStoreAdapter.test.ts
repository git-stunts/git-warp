import { describe, expect, it, vi } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import type { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { collectAsyncIterable } from '../../../../src/domain/utils/streamUtils.ts';
import { CborCheckpointStoreAdapter } from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CheckpointStorePort from '../../../../src/ports/CheckpointStorePort.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

function createState(): WarpState {
  const nodeAlive = ORSet.empty();
  nodeAlive.add('user:alice', Dot.create('w1', 1));
  nodeAlive.add('user:bob', Dot.create('w1', 2));
  const edgeAlive = ORSet.empty();
  edgeAlive.add('user:alice\0user:bob\0knows', Dot.create('w1', 3));
  const prop = new Map<string, LWWRegister<PropValue>>();
  prop.set('user:alice\0name', {
    eventId: new EventId(1, 'w1', 'a'.repeat(40), 0),
    value: 'Alice',
  });
  const observedFrontier = VersionVector.empty();
  observedFrontier.set('w1', 3);
  return new WarpState({ nodeAlive, edgeAlive, prop, observedFrontier });
}

function createFixture() {
  const codec = new CborCodec();
  const history = new InMemoryGraphAdapter();
  const assets = new InMemoryBlobStorageAdapter();
  const checkpoints = new CborCheckpointStoreAdapter({
    codec,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    history,
    assetStorage: assets,
  });
  return { codec, history, assets, checkpoints };
}

function record(options: { index?: boolean; parents?: string[] } = {}) {
  const appliedVV = VersionVector.empty();
  appliedVV.set('w1', 3);
  return {
    graphName: 'test',
    state: createState(),
    frontier: new Map([['w1', 'a'.repeat(40)]]),
    appliedVV,
    stateHash: 'd'.repeat(64),
    parents: options.parents ?? [],
    ...(options.index === true
      ? { indexShards: { 'meta_aa.cbor': new CborCodec().encode({ node: 1 }) } }
      : {}),
  };
}

describe('CborCheckpointStoreAdapter semantic lifecycle', () => {
  it('is a CheckpointStorePort and requires every semantic dependency', () => {
    const { codec, history, assets, checkpoints } = createFixture();
    expect(checkpoints).toBeInstanceOf(CheckpointStorePort);

    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, history, assetStorage: assets }))
      .toThrow(/codec/);
    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ codec, history, assetStorage: assets }))
      .toThrow(/commitMessageCodec/);
    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ codec, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, assetStorage: assets }))
      .toThrow(/history/);
  });

  it('publishes, resolves, and round-trips checkpoint state', async () => {
    const { checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const loaded = await checkpoints.loadCheckpoint(published.checkpointSha);

    expect(await checkpoints.resolveHead('test')).toBe(published.checkpointSha);
    expect(loaded.stateHash).toBe('d'.repeat(64));
    expect(loaded.schema).toBe(5);
    expect(loaded.state.nodeAlive.contains('user:alice')).toBe(true);
    expect(loaded.state.edgeAlive.contains('user:alice\0user:bob\0knows')).toBe(true);
    expect(loaded.state.getNodeProp('user:alice', 'name')?.value).toBe('Alice');
    expect(loaded.frontier).toEqual(new Map([['w1', 'a'.repeat(40)]]));
    expect(loaded.appliedVV?.get('w1')).toBe(3);
    expect(loaded.indexShardHandles).toBeNull();
  });

  it('reads metadata without opening checkpoint payloads', async () => {
    const { history, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const readBlob = vi.spyOn(history, 'readBlob');

    await expect(checkpoints.readMetadata(published.checkpointSha)).resolves.toEqual({
      checkpointSha: published.checkpointSha,
      stateHash: 'd'.repeat(64),
      schema: 5,
    });
    expect(readBlob).not.toHaveBeenCalled();
  });

  it('loads a bounded basis and opens one shard through an opaque handle', async () => {
    const { codec, history, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record({ index: true }));
    const basis = await checkpoints.loadBasis(published.checkpointSha);
    const shardHandle = basis.indexShardHandles['meta_aa.cbor'];
    if (shardHandle === undefined) {
      throw new Error('expected checkpoint index shard handle');
    }
    const indexes = new CborIndexStoreAdapter({ codec, blobPort: history, treePort: history });
    const bytes = await collectAsyncIterable(indexes.openShard(shardHandle));

    expect(codec.decode(bytes)).toEqual({ node: 1 });
    expect(basis.frontier).toEqual(new Map([['w1', 'a'.repeat(40)]]));
    expect(Object.isFrozen(basis.indexShardHandles)).toBe(true);
  });

  it('fails closed when a checkpoint has no bounded index basis', async () => {
    const { checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());

    await expect(checkpoints.loadBasis(published.checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_INDEX' });
  });

  it('publishes coverage as a causal anchor of checkpoint parents', async () => {
    const { history, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const coverageSha = await checkpoints.publishCoverage({
      graphName: 'test',
      parents: [published.checkpointSha],
    });

    expect((await history.getNodeInfo(coverageSha)).parents).toEqual([published.checkpointSha]);
    expect(DEFAULT_COMMIT_MESSAGE_CODEC.detectKind(await history.showNode(coverageSha))).toBe('anchor');
  });
});
