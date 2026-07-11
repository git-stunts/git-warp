import { describe, expect, it } from 'vitest';

import AdjacencyMap from '../../../../src/domain/capabilities/AdjacencyMap.ts';
import { createEmptyState, type WarpState } from '../../../../src/domain/services/JoinReducer.ts';
import RuntimeStateStore from '../../../../src/domain/warp/RuntimeStateStore.ts';
import type { NeighborEdge } from '../../../../src/ports/NeighborProviderPort.ts';

type RuntimeMaterializedGraphFixture = {
  state: WarpState;
  stateHash: string;
  adjacency: {
    outgoing: Map<string, NeighborEdge[]>;
    incoming: Map<string, NeighborEdge[]>;
  };
};

type RuntimeStateStoreHostFixture = {
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _materializedGraph: RuntimeMaterializedGraphFixture | null;
};

function edge(neighborId: string, label: string): NeighborEdge {
  return { neighborId, label };
}

function emptyAdjacency(): AdjacencyMap {
  return new AdjacencyMap({
    outgoing: new Map<string, NeighborEdge[]>(),
    incoming: new Map<string, NeighborEdge[]>(),
  });
}

function createHost(): RuntimeStateStoreHostFixture {
  return {
    _cachedState: null,
    _stateDirty: true,
    _materializedGraph: null,
  };
}

describe('RuntimeStateStore', () => {
  it('returns null until cached state and graph snapshot are both present', () => {
    const host = createHost();
    const store = new RuntimeStateStore(host);
    const state = createEmptyState();

    expect(store.get()).toBeNull();

    host._cachedState = state;
    expect(store.get()).toBeNull();

    host._cachedState = null;
    host._materializedGraph = {
      state,
      stateHash: 'state-a',
      adjacency: {
        outgoing: new Map<string, NeighborEdge[]>(),
        incoming: new Map<string, NeighborEdge[]>(),
      },
    };

    expect(store.get()).toBeNull();
  });

  it('stores snapshots and isolates adjacency arrays from caller mutation', () => {
    const host = createHost();
    const store = new RuntimeStateStore(host);
    const state = createEmptyState();
    const sourceOutgoing = [edge('beta', 'child')];
    const sourceIncoming = [edge('alpha', 'parent')];
    const adjacency = new AdjacencyMap({
      outgoing: new Map<string, NeighborEdge[]>([['alpha', sourceOutgoing]]),
      incoming: new Map<string, NeighborEdge[]>([['beta', sourceIncoming]]),
    });

    store.set(state, 'state-a', adjacency);
    sourceOutgoing.push(edge('gamma', 'late'));
    sourceIncoming.push(edge('delta', 'late'));

    expect(host._cachedState).toBe(state);
    expect(host._stateDirty).toBe(false);
    expect(host._materializedGraph?.state).toBe(state);
    expect(host._materializedGraph?.stateHash).toBe('state-a');
    expect(host._materializedGraph?.adjacency.outgoing.get('alpha')).toEqual([
      edge('beta', 'child'),
    ]);
    expect(host._materializedGraph?.adjacency.incoming.get('beta')).toEqual([
      edge('alpha', 'parent'),
    ]);
  });

  it('returns copied snapshots and clears runtime cache state', () => {
    const host = createHost();
    const store = new RuntimeStateStore(host);
    const state = createEmptyState();

    store.set(state, null, emptyAdjacency());

    expect(host._materializedGraph?.stateHash).toBe('');
    expect(store.get()?.stateHash).toBe('');

    host._materializedGraph?.adjacency.outgoing.set('alpha', [edge('beta', 'child')]);
    const snapshot = store.get();
    expect(snapshot).not.toBeNull();
    if (snapshot === null) {
      throw new Error('runtime state snapshot must exist');
    }

    host._materializedGraph?.adjacency.outgoing.get('alpha')?.push(edge('gamma', 'late'));

    expect(snapshot.state).toBe(state);
    expect(snapshot.adjacency.outgoing.get('alpha')).toEqual([
      edge('beta', 'child'),
    ]);

    store.clear();

    expect(host._cachedState).toBeNull();
    expect(host._stateDirty).toBe(true);
    expect(host._materializedGraph).toBeNull();
    expect(store.get()).toBeNull();
  });
});
