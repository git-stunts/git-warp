// TODO: Return type will change from WarpRuntime to WarpGraph when
// API_capability-interfaces lands the capability-namespaced API.
import type WarpRuntime from '../WarpRuntime.ts';

/**
 * Creates read-only, detached graph instances for isolated traversal.
 *
 * Replaces the 3 duplicated `openDetachedReadGraph` /
 * `openDetachedObserverGraph` free functions scattered across
 * QueryController, MaterializeController, and Worldline.
 *
 * The returned graph has `autoMaterialize: false` and is intended
 * for snapshot queries that must not mutate the primary graph.
 */
export default abstract class DetachedGraphFactory {
  abstract openReadOnly(): Promise<WarpRuntime>;
}
