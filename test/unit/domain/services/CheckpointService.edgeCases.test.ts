import { describe, expect, it, vi } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import StateHashService from '../../../../src/domain/services/state/StateHashService.ts';
import { createCheckpointEnvelope } from '../../../../src/domain/services/state/checkpointCreate.ts';
import {
  loadCheckpoint,
  materializeIncremental,
  reconstructStateFromCheckpoint,
} from '../../../../src/domain/services/state/checkpointLoad.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryCheckpointStore from '../../../helpers/InMemoryCheckpointStore.ts';

const stateHashService = new StateHashService({
  codec: defaultCodec,
  crypto: new NodeCryptoAdapter(),
});

describe('checkpoint domain edge cases', () => {
  it('rejects an unknown semantic checkpoint handle', async () => {
    await expect(loadCheckpoint(new InMemoryCheckpointStore(), 'f'.repeat(40)))
      .rejects.toThrow(/Checkpoint not found/);
  });

  it('returns the checkpoint state without invoking loaders when no suffix exists', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const state = createEmptyState();
    state.nodeAlive.add('node:a', Dot.create('alice', 1));
    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state,
      frontier: new Map([['alice', 'a'.repeat(40)]]),
      compact: false,
      stateHashService,
    });
    const patchLoader = vi.fn(async () => []);

    const result = await materializeIncremental({
      checkpointStore,
      graphName: 'events',
      checkpointSha: sha,
      targetFrontier: new Map(),
      patchLoader,
    });
    expect(result).toBe(state);
    expect(patchLoader).not.toHaveBeenCalled();
  });

  it('rejects a checkpoint from a different graph before replaying patches', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'other-events',
      state: createEmptyState(),
      frontier: new Map(),
      compact: false,
      stateHashService,
    });
    const patchLoader = vi.fn(async () => []);

    await expect(materializeIncremental({
      checkpointStore,
      graphName: 'events',
      checkpointSha: sha,
      targetFrontier: new Map(),
      patchLoader,
    })).rejects.toThrow(/belongs to graph other-events, not events/);
    expect(patchLoader).not.toHaveBeenCalled();
  });

  it('loads a writer absent from the checkpoint from causal genesis', async () => {
    const checkpointStore = new InMemoryCheckpointStore();
    const sha = await createCheckpointEnvelope({
      checkpointStore,
      graphName: 'events',
      state: createEmptyState(),
      frontier: new Map(),
      compact: false,
      stateHashService,
    });
    const patchLoader = vi.fn(async () => []);
    const target = 'b'.repeat(40);

    await materializeIncremental({
      checkpointStore,
      graphName: 'events',
      checkpointSha: sha,
      targetFrontier: new Map([['bob', target]]),
      patchLoader,
    });
    expect(patchLoader).toHaveBeenCalledWith('bob', null, target);
  });

  it('reconstructs an empty visible projection as an empty state', () => {
    const state = reconstructStateFromCheckpoint({ nodes: [], edges: [], props: [] });
    expect(state.nodeAlive.entries.size).toBe(0);
    expect(state.edgeAlive.entries.size).toBe(0);
  });
});
