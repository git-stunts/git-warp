import type { WarpState } from '../services/JoinReducer.ts';

/**
 * Read-only access to the current materialized state.
 *
 * Used by QueryController (reads) and QueryContent (content access)
 * as a replacement for reaching through `_host._cachedState`.
 */
export default abstract class MaterializedStateProvider {
  /** Returns the current materialized state, or null if not yet materialized. */
  abstract current(): WarpState | null;

  /** Returns the state hash, or null if unavailable. */
  abstract stateHash(): string | null;
}
