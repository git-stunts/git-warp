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
 */
export function createLazyCas<T>(initFn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;

  return () => {
    if (!promise) {
      promise = initFn().catch((err: unknown) => {
        promise = null;
        throw err;
      });
    }
    return promise;
  };
}
