/**
 * RuntimeStateStore — adapter wrapping WarpRuntime's cached state fields.
 *
 * Backs MaterializedStateStore with the _cachedState, stateHash, and
 * adjacency fields that live on WarpRuntime.
 */

import MaterializedStateStore from '../capabilities/MaterializedStateStore.ts';
import MaterializedSnapshot from '../capabilities/MaterializedSnapshot.ts';
import AdjacencyMap from '../capabilities/AdjacencyMap.ts';
import type { WarpState } from '../services/JoinReducer.ts';
import type { NeighborEdge } from '../../ports/NeighborProviderPort.ts';

type RuntimeAdjacencyShape = {
  outgoing: Map<string, NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
  incoming: Map<string, NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
};

type RuntimeMaterializedGraph = {
  state: WarpState;
  stateHash: string;
  adjacency: RuntimeAdjacencyShape;
};

type RuntimeStateStoreHost = {
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _materializedGraph: RuntimeMaterializedGraph | null;
};

export default class RuntimeStateStore extends MaterializedStateStore {
  private readonly _runtime: RuntimeStateStoreHost;

  constructor(runtime: RuntimeStateStoreHost) {
    super();
    this._runtime = runtime;
  }

  get(): MaterializedSnapshot | null {
    const r = this._runtime;
    if (!r._cachedState || !r._materializedGraph) {
      return null;
    }
    const adj = r._materializedGraph.adjacency;
    const outgoing = new Map<string, Array<{ neighborId: string; label: string }>>();
    for (const [k, v] of (adj?.outgoing ?? [])) { outgoing.set(k, [...v]); }
    const incoming = new Map<string, Array<{ neighborId: string; label: string }>>();
    for (const [k, v] of (adj?.incoming ?? [])) { incoming.set(k, [...v]); }
    return new MaterializedSnapshot({
      state: r._cachedState,
      stateHash: r._materializedGraph.stateHash ?? null,
      adjacency: new AdjacencyMap({ outgoing, incoming }),
    });
  }

  set(state: WarpState, stateHash: string | null, adjacency: AdjacencyMap): void {
    const r = this._runtime;
    r._cachedState = state;
    r._stateDirty = false;
    const outgoing = new Map<string, Array<{ neighborId: string; label: string }>>();
    for (const [k, v] of adjacency.outgoing) { outgoing.set(k, [...v]); }
    const incoming = new Map<string, Array<{ neighborId: string; label: string }>>();
    for (const [k, v] of adjacency.incoming) { incoming.set(k, [...v]); }
    r._materializedGraph = { state, stateHash: stateHash ?? '', adjacency: { outgoing, incoming } };
  }

  clear(): void {
    const r = this._runtime;
    r._cachedState = null;
    r._stateDirty = true;
    r._materializedGraph = null;
  }
}
