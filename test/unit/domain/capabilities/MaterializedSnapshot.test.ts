import { describe, expect, it } from 'vitest';
import AdjacencyMap from '../../../../src/domain/capabilities/AdjacencyMap.ts';
import MaterializedSnapshot from '../../../../src/domain/capabilities/MaterializedSnapshot.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';

describe('MaterializedSnapshot', () => {
  it('freezes a materialized state, hash, and adjacency bundle', () => {
    const state = WarpState.empty();
    const adjacency = new AdjacencyMap({
      outgoing: new Map(),
      incoming: new Map(),
    });

    const snapshot = new MaterializedSnapshot({
      state,
      stateHash: 'sha1:state',
      adjacency,
    });

    expect(snapshot.state).toBe(state);
    expect(snapshot.stateHash).toBe('sha1:state');
    expect(snapshot.adjacency).toBe(adjacency);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
