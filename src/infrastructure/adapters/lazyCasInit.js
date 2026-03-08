/**
 * Shared lazy-init helper for CAS (Content Addressable Store) adapters.
 *
 * Both CasBlobAdapter and CasSeekCacheAdapter use the same pattern:
 * cache a pending promise, reset on failure so the next call retries.
 *
 * @module infrastructure/adapters/lazyCasInit
 * @private
 */

/**
 * Creates a lazy CAS initializer that caches the resolved promise
 * and resets on rejection so subsequent calls retry.
 *
 * @template T
 * @param {() => Promise<T>} initFn - Factory that creates the CAS instance
 * @returns {() => Promise<T>} A `getCas()` function
 */
export function createLazyCas(initFn) {
  /** @type {Promise<T> | null} */
  let promise = null;

  return () => {
    if (!promise) {
      promise = initFn().catch((err) => {
        promise = null;
        throw err;
      });
    }
    return promise;
  };
}
