/**
 * Test helper: concurrency harness for testing race conditions.
 *
 * Provides barrier-based hooks that test code can use to inject
 * interleaving at critical points (GC swap, frontier snapshot, patch apply).
 *
 * @module test/helpers/concurrencyHarness
 */

/**
 * @typedef {Object} ConcurrencyHooks
 * @property {(() => Promise<void>)|null} onBeforeGCSwap - Called before GC swaps compacted state
 * @property {(() => Promise<void>)|null} onAfterFrontierSnapshot - Called after frontier is captured
 * @property {(() => Promise<void>)|null} onBeforeApplyPatch - Called before a patch is applied
 */

/**
 * Creates a barrier that resolves when released.
 *
 * @returns {{ promise: Promise<void>, release: () => void }}
 */
export function createBarrier() {
  /** @type {(value?: any) => void} */
  let release = () => {};
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * Wraps a graph instance with concurrency hooks.
 *
 * The returned hooks object has mutable properties that tests can set
 * to inject barriers at critical points.
 *
 * @param {import('../../src/domain/WarpRuntime.js').default} graph
 * @returns {{ graph: import('../../src/domain/WarpRuntime.js').default, hooks: ConcurrencyHooks }}
 */
export function wrapWithHooks(graph) {
  /** @type {ConcurrencyHooks} */
  const hooks = {
    onBeforeGCSwap: null,
    onAfterFrontierSnapshot: null,
    onBeforeApplyPatch: null,
  };
  // Attach hooks to the graph instance for internal access
  /** @type {*} */ (graph)._concurrencyHooks = hooks;
  return { graph, hooks };
}
