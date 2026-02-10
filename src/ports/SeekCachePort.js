/**
 * Port interface for seek materialization cache operations.
 *
 * Defines the contract for caching and retrieving serialized WarpStateV5
 * snapshots keyed by (ceiling, frontier) tuples. Used by the seek time-travel
 * feature to avoid full re-materialization for previously-visited ticks.
 *
 * Concrete adapters (e.g., CasSeekCacheAdapter) implement this interface
 * to store cached states in different backends (git-cas, filesystem, etc.).
 *
 * @abstract
 */
export default class SeekCachePort {
  /**
   * Retrieves a cached state buffer by key.
   * @param {string} key - Cache key (e.g., 'v1:t42-<frontierHash>')
   * @returns {Promise<Buffer|null>} The cached buffer, or null on miss
   * @throws {Error} If not implemented by a concrete adapter
   */
  async get(_key) {
    throw new Error('SeekCachePort.get() not implemented');
  }

  /**
   * Stores a state buffer under the given key.
   * @param {string} key - Cache key
   * @param {Buffer} buffer - Serialized state to cache
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async set(_key, _buffer) {
    throw new Error('SeekCachePort.set() not implemented');
  }

  /**
   * Checks whether a key exists in the cache.
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async has(_key) {
    throw new Error('SeekCachePort.has() not implemented');
  }

  /**
   * Lists all keys currently in the cache index.
   * Note: keys may reference GC'd blobs; callers should handle miss on get().
   * @returns {Promise<string[]>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async keys() {
    throw new Error('SeekCachePort.keys() not implemented');
  }

  /**
   * Removes a single entry from the cache.
   * @param {string} key - Cache key to remove
   * @returns {Promise<boolean>} True if the entry existed and was removed
   * @throws {Error} If not implemented by a concrete adapter
   */
  async delete(_key) {
    throw new Error('SeekCachePort.delete() not implemented');
  }

  /**
   * Removes all entries from the cache.
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async clear() {
    throw new Error('SeekCachePort.clear() not implemented');
  }
}
