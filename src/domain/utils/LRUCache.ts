/**
 * A simple LRU (Least Recently Used) cache implementation.
 *
 * Uses Map's insertion order to track access recency. When the cache
 * exceeds maxSize, the oldest (least recently used) entry is evicted.
 */
class LRUCache<K, V> {
  readonly maxSize: number;
  private readonly _cache: Map<K, V>;

  /**
   * Creates an LRU cache with the specified maximum size.
   *
   * @throws {Error} If maxSize is not a positive integer
   */
  constructor(maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error('LRUCache maxSize must be a positive integer');
    }
    this.maxSize = maxSize;
    this._cache = new Map();
  }

  /** Gets a value from the cache and marks it as recently used. */
  get(key: K): V | undefined {
    if (!this._cache.has(key)) {
      return undefined;
    }
    // Delete-reinsert maintains insertion order in the underlying Map, which
    // serves as the LRU eviction order. This is O(1) amortized in V8's Map
    // implementation despite appearing wasteful (2x Map ops per get).
    const value = this._cache.get(key)!;
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Sets a value in the cache, evicting the oldest entry if at capacity.
   *
   * If the key already exists, it is updated and marked as recently used.
   */
  set(key: K, value: V): LRUCache<K, V> {
    // If key exists, delete it first so it moves to the end
    if (this._cache.has(key)) {
      this._cache.delete(key);
    }

    // Add the new entry
    this._cache.set(key, value);

    // Evict oldest entry if over capacity
    if (this._cache.size > this.maxSize) {
      const oldestKey = this._cache.keys().next().value!;
      this._cache.delete(oldestKey);
    }

    return this;
  }

  /**
   * Checks if a key exists in the cache.
   *
   * Note: This does NOT update the access order (use get() for that).
   */
  has(key: K): boolean {
    return this._cache.has(key);
  }

  /** Deletes an entry from the cache. */
  delete(key: K): boolean {
    return this._cache.delete(key);
  }

  /** Clears all entries from the cache. */
  clear(): void {
    this._cache.clear();
  }

  /** Gets the current number of entries in the cache. */
  get size(): number {
    return this._cache.size;
  }
}

export default LRUCache;
