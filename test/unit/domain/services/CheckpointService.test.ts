import { describe, expect, it, vi } from 'vitest';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import StateHashService from '../../../../src/domain/services/state/StateHashService.ts';
import {
  createCheckpointEnvelope,
} from '../../../../src/domain/services/state/checkpointCreate.ts';
import {
  loadCheckpoint,
  materializeIncremental,
  reconstructStateFromCheckpoint,
} from '../../../../src/domain/services/state/checkpointLoad.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryCheckpointStore from '../../../helpers/InMemoryCheckpointStore.ts';

const stateHashService = new StateHashService({
  codec: defaultCodec,
  crypto: new NodeCryptoAdapter(),
});

function stateWithNode(nodeId = 'node:a') {
  const state = createEmptyState();
  state.nodeAlive.add(nodeId, Dot.create('alice', 1));
  return state;
}

describe('checkpoint domain lifecycle', () => {
  it('hashes state and delegates one semantic publication record', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const state = stateWithNode();
    const frontier = new Map([['alice', 'a'.repeat(40)]]);

    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state,
      frontier,
      parents: ['b'.repeat(40)],
      compact: false,
      stateHashService,
    });

    expect(sha).toHaveLength(40);
    expect(checkpointStore.lastPublished).toMatchObject({
      graphName: 'events',
      parents: ['b'.repeat(40)],
      state,
      frontier,
    });
    expect(checkpointStore.lastPublished?.stateHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compacts a cloned checkpoint state without mutating the live state', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const state = createEmptyState();
    const dot = Dot.create('alice', 1);
    state.nodeAlive.add('deleted', dot);
    state.nodeAlive.remove(new Set([encodeDot(dot)]));

    await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state,
      frontier: new Map(),
      compact: true,
      stateHashService,
    });

    expect(state.nodeAlive.entries.has('deleted')).toBe(true);
    expect(checkpointStore.lastPublished?.state.nodeAlive.entries.has('deleted')).toBe(false);
    expect(checkpointStore.lastPublished?.state.nodeAlive.tombstones.size).toBe(0);
  });

  it('preserves tombstones when compaction is disabled', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const state = createEmptyState();
    const dot = Dot.create('alice', 1);
    state.nodeAlive.add('deleted', dot);
    state.nodeAlive.remove(new Set([encodeDot(dot)]));

    await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state,
      frontier: new Map(),
      compact: false,
      stateHashService,
    });

    expect(checkpointStore.lastPublished?.state.nodeAlive.entries.has('deleted')).toBe(true);
    expect(checkpointStore.lastPublished?.state.nodeAlive.tombstones.has('alice:1')).toBe(true);
  });

  it('round-trips state and frontier through CheckpointStorePort', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const state = stateWithNode();
    const frontier = new Map([['alice', 'a'.repeat(40)]]);
    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state,
      frontier,
      compact: false,
      stateHashService,
    });

    const loaded = await loadCheckpoint(checkpointStore, sha);
    expect(loaded.state.nodeAlive.contains('node:a')).toBe(true);
    expect(loaded.frontier).toEqual(frontier);
    expect(loaded.schema).toBe(5);
    expect(loaded.appliedVV?.get('alice')).toBe(1);
  });

  it('propagates materialized index shards as opaque checkpoint handles', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state: stateWithNode(),
      frontier: new Map(),
      compact: false,
      indexTree: { 'meta_aa.cbor': defaultCodec.encode({ node: 1 }) },
      stateHashService,
    });

    const loaded = await loadCheckpoint(checkpointStore, sha);
    expect(loaded.indexShardHandles?.['meta_aa.cbor']?.toString())
      .toContain('checkpoint-shard:');
  });

  it('replays only causal suffix patches after the checkpoint frontier', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const checkpointTip = 'a'.repeat(40);
    const targetTip = 'b'.repeat(40);
    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state: stateWithNode('node:a'),
      frontier: new Map([['alice', checkpointTip]]),
      compact: false,
      stateHashService,
    });
    const patchLoader = vi.fn(async () => [{
      sha: targetTip,
      patch: new Patch({
        schema: 3,
        writer: 'alice',
        lamport: 2,
        context: { alice: 1 },
        ops: [new NodeAdd('node:b', Dot.create('alice', 2))],
        reads: [],
        writes: ['node:b'],
      }),
    }]);

    const materialized = await materializeIncremental({
      checkpointStore,
      graphName: 'events',
      checkpointSha: sha,
      targetFrontier: new Map([['alice', targetTip]]),
      patchLoader,
    });

    expect(patchLoader).toHaveBeenCalledWith('alice', checkpointTip, targetTip);
    expect(materialized.nodeAlive.contains('node:a')).toBe(true);
    expect(materialized.nodeAlive.contains('node:b')).toBe(true);
  });

  it('reconstructs nodes, edges, and properties from a visible projection', () => {
    const state = reconstructStateFromCheckpoint({
      nodes: ['node:a', 'node:b'],
      edges: [{ from: 'node:a', to: 'node:b', label: 'knows' }],
      props: [{ node: 'node:a', key: 'name', value: 'Alice' }],
    });

    expect(state.nodeAlive.contains('node:a')).toBe(true);
    expect(state.edgeAlive.contains('node:a\0node:b\0knows')).toBe(true);
    expect(state.getNodeProp('node:a', 'name')?.value).toBe('Alice');
  });
});
