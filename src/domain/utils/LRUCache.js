/**
 * A simple LRU (Least Recently Used) cache implementation.
 *
 * Uses Map's insertion order to track access recency. When the cache
 * exceeds maxSize, the oldest (least recently used) entry is evicted.
 *
 * @class LRUCache
 * @template K, V
 */
class LRUCache {
  /**
   * Creates an LRU cache with the specified maximum size.
   *
   * @param {number} maxSize - Maximum number of entries to cache
   * @throws {Error} If maxSize is not a positive integer
   */
  constructor(maxSize) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error('LRUCache maxSize must be a positive integer');
    }
    /** @type {number} */
    this.maxSize = maxSize;
    /** @type {Map<K, V>} */
    this._cache = new Map();
  }

  /**
   * Gets a value from the cache and marks it as recently used.
   *
   * @param {K} key - The key to look up
   * @returns {V|undefined} The cached value, or undefined if not found
   */
  get(key) {
    if (!this._cache.has(key)) {
      return undefined;
    }
    // Move to end (most recently used) by deleting and re-inserting
    const value = this._cache.get(key);
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Sets a value in the cache, evicting the oldest entry if at capacity.
   *
   * If the key already exists, it is updated and marked as recently used.
   *
   * @param {K} key - The key to set
   * @param {V} value - The value to cache
   * @returns {LRUCache} The cache instance for chaining
   */
  set(key, value) {
    // If key exists, delete it first so it moves to the end
    if (this._cache.has(key)) {
      this._cache.delete(key);
    }

    // Add the new entry
    this._cache.set(key, value);

    // Evict oldest entry if over capacity
    if (this._cache.size > this.maxSize) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }

    return this;
  }

  /**
   * Checks if a key exists in the cache.
   *
   * Note: This does NOT update the access order (use get() for that).
   *
   * @param {K} key - The key to check
   * @returns {boolean} True if the key exists
   */
  has(key) {
    return this._cache.has(key);
  }

  /**
   * Deletes an entry from the cache.
   *
   * @param {K} key - The key to delete
   * @returns {boolean} True if the entry was deleted, false if it didn't exist
   */
  delete(key) {
    return this._cache.delete(key);
  }

  /**
   * Clears all entries from the cache.
   *
   * @returns {void}
   */
  clear() {
    this._cache.clear();
  }

  /**
   * Gets the current number of entries in the cache.
   *
   * @returns {number} The number of cached entries
   */
  get size() {
    return this._cache.size;
  }
}

export default LRUCache;
