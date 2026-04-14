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
export function createBarrier(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
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
 * @param {import('../../src/domain/WarpRuntime.ts').default} graph
 * @returns {{ graph: import('../../src/domain/WarpRuntime.ts').default, hooks: ConcurrencyHooks }}
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
