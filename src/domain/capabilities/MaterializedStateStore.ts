import type MaterializedSnapshot from './MaterializedSnapshot.ts';
import type { WarpState } from '../services/JoinReducer.ts';
import type AdjacencyMap from './AdjacencyMap.ts';

/**
 * Read/write store for the cached materialized state.
 *
 * Used by MaterializeController as a replacement for the
 * `_cachedState` / `_stateHash` / `_adjacency` fields on
 * WarpRuntime. The implementation lives in infrastructure;
 * domain code programs against this abstract contract.
 */
export default abstract class MaterializedStateStore {
  /** Returns the full snapshot, or null if nothing is cached. */
  abstract get(): MaterializedSnapshot | null;

  /** Stores a new materialized state with its hash and adjacency. */
  abstract set(
    _state: WarpState,
    _stateHash: string | null,
    _adjacency: AdjacencyMap,
  ): void;

  /** Clears the cached state (e.g., after invalidation). */
  abstract clear(): void;
}
