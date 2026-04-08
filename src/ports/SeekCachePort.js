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
import WarpError from '../domain/errors/WarpError.ts';

export default class SeekCachePort {
  /**
   * Retrieves a cached state buffer by key.
   * @param {string} _key - Cache key (e.g., 'v1:t42-<frontierHash>')
   * @returns {Promise<{ buffer: Uint8Array, indexTreeOid?: string } | null>} The cached entry, or null on miss
   * @throws {Error} If not implemented by a concrete adapter
   */
  async get(_key) {
    throw new WarpError('SeekCachePort.get() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Stores a state buffer under the given key.
   * @param {string} _key - Cache key
   * @param {Uint8Array} _buffer - Serialized state to cache
   * @param {{ indexTreeOid?: string }} [_options] - Optional metadata
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async set(_key, _buffer, _options) {
    throw new WarpError('SeekCachePort.set() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Checks whether a key exists in the cache.
   * @param {string} _key - Cache key
   * @returns {Promise<boolean>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async has(_key) {
    throw new WarpError('SeekCachePort.has() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Lists all keys currently in the cache index.
   * Note: keys may reference GC'd blobs; callers should handle miss on get().
   * @returns {Promise<string[]>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async keys() {
    throw new WarpError('SeekCachePort.keys() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Removes a single entry from the cache.
   * @param {string} _key - Cache key to remove
   * @returns {Promise<boolean>} True if the entry existed and was removed
   * @throws {Error} If not implemented by a concrete adapter
   */
  async delete(_key) {
    throw new WarpError('SeekCachePort.delete() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Removes all entries from the cache.
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async clear() {
    throw new WarpError('SeekCachePort.clear() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
