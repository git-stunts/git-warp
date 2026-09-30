import { expect, it, vi } from 'vitest';
import * as NodeIdModule from '../../../../../src/domain/graph/NodeId.ts';
import NodeId from '../../../../../src/domain/graph/NodeId.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import { ProvenanceIndex } from '../../../../../src/domain/services/provenance/ProvenanceIndex.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { E_CHECKPOINT_STALE_MATERIALIZATION } from '../../../../../src/domain/services/state/StaleCheckpointMaterialization.ts';
import { loadCheckpoint, materializeIncremental, reconstructStateFromCheckpoint } from '../../../../../src/domain/services/state/checkpointLoad.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';

it('preserves the provenance index supplied by the checkpoint store', async () => {
  const store = new InMemoryCheckpointStore();
  const provenanceIndex = ProvenanceIndex.empty();
  vi.spyOn(store, 'loadCheckpoint').mockResolvedValue({
    state: WarpState.empty(), frontier: new Map(), stateHash: 'hash', schema: 5,
    appliedVV: null, indexShardHandles: null, indexRoot: null, propertyRoot: null, provenanceIndex,
  });
  expect((await loadCheckpoint(store, 'a'.repeat(40))).provenanceIndex).toBe(provenanceIndex);
});

it('replays from genesis when the checkpoint has stale materialization semantics', async () => {
  const store = new InMemoryCheckpointStore();
  vi.spyOn(store, 'loadCheckpoint').mockRejectedValue(
    new PersistenceError('stale', E_CHECKPOINT_STALE_MATERIALIZATION),
  );
  const patchLoader = vi.fn(async () => []);
  const state = await materializeIncremental({
    checkpointStore: store, graphName: 'g', checkpointSha: 'a'.repeat(40),
    targetFrontier: new Map([['writer', 'b'.repeat(40)]]), patchLoader,
  });
  expect(patchLoader).toHaveBeenCalledWith('writer', null, 'b'.repeat(40));
  expect(state.propSize()).toBe(0);
});

it('does not relabel unexpected identifier-construction failures as malformed checkpoint data', () => {
  const failure = new Error('unexpected constructor failure');
  class FailingNodeId extends NodeId {
    constructor(value: string) {
      super(value);
      throw failure;
    }
  }
  const constructor = vi.spyOn(NodeIdModule, 'default').mockImplementation(FailingNodeId);
  try {
    expect(() => reconstructStateFromCheckpoint({
      nodes: [], edges: [], props: [{ node: 'n', key: 'k', value: 1 }],
    })).toThrow(failure);
  } finally {
    constructor.mockRestore();
  }
});
