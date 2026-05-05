import type { WarpState } from '../services/JoinReducer.ts';
import type AdjacencyMap from './AdjacencyMap.ts';

/**
 * Immutable snapshot of a fully materialized graph state.
 *
 * Combines the CRDT state, its content-addressable hash, and the
 * derived adjacency map into a single value object. Replaces the
 * anonymous `{ state, stateHash, adjacency }` bags that flow
 * through MaterializeController.
 */
export default class MaterializedSnapshot {
  readonly state: WarpState;
  readonly stateHash: string | null;
  readonly adjacency: AdjacencyMap;

  constructor(params: {
    state: WarpState;
    stateHash: string | null;
    adjacency: AdjacencyMap;
  }) {
    this.state = params.state;
    this.stateHash = params.stateHash;
    this.adjacency = params.adjacency;
    Object.freeze(this);
  }
}
