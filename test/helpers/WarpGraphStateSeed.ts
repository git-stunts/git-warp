import { vi } from 'vitest';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import { createEmptyState, encodeEdgeKey } from '../../src/domain/services/JoinReducer.ts';
import { createSnapshotWarpState } from '../../src/domain/services/ImmutableSnapshot.ts';
import type WarpState from '../../src/domain/services/state/WarpState.ts';

type MaterializedGraphFixture = {
  readonly state: WarpState;
  readonly stateHash: string;
  readonly adjacency: object;
};

type GraphStateSeedTarget = {
  _buildAdjacency(state: WarpState): object;
  _cachedState?: WarpState;
  _stateDirty?: boolean;
  _materializedGraph?: MaterializedGraphFixture;
  _materializeGraph?: ReturnType<typeof vi.fn>;
  materialize?: ReturnType<typeof vi.fn>;
};

export function addNodeToState(state: WarpState, nodeId: string, counter: number, writerId = 'w1'): void {
  state.nodeAlive.add(nodeId, Dot.create(writerId, counter));
}

export function addEdgeToState(
  state: WarpState,
  from: string,
  to: string,
  label: string,
  counter: number,
  writerId = 'w1',
): void {
  state.edgeAlive.add(encodeEdgeKey(from, to, label), Dot.create(writerId, counter));
}

export function setupGraphState(graph: GraphStateSeedTarget, seedFn: (state: WarpState) => void): WarpState {
  const state = createEmptyState();
  seedFn(state);
  const materializedGraph = {
    state,
    stateHash: 'test-state-hash',
    adjacency: graph._buildAdjacency(state),
  };

  graph._cachedState = state;
  graph._stateDirty = false;
  graph._materializedGraph = materializedGraph;
  graph._materializeGraph = vi.fn().mockResolvedValue(materializedGraph);
  graph.materialize = vi.fn().mockResolvedValue(createSnapshotWarpState(state));
  return state;
}
