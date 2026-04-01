/**
 * A TTL-based caching utility for a single value.
 *
 * Caches the result of an expensive operation and reuses it until
 * the configured TTL expires. Supports manual invalidation.
 *
 * @class CachedValue
 * @template T
 *
 * @example
 * const cache = new CachedValue({
 *   clock,
 *   ttlMs: 5000,
 *   compute: async () => await expensiveOperation(),
 * });
 *
 * // First call computes the value
 * const value1 = await cache.get();
 *
 * // Subsequent calls within TTL return cached value
 * const value2 = await cache.get(); // Same as value1
 *
 * // Force recompute
 * cache.invalidate();
 * const value3 = await cache.get(); // Fresh value
 */
class CachedValue {
  /**
   * Creates a CachedValue instance.
   *
   * @param {{ clock: import('../../ports/ClockPort.js').default, ttlMs: number, compute: () => T | Promise<T> }} options
   * @throws {Error} If ttlMs is not a positive number
   */
  constructor({ clock, ttlMs, compute }) {
    if (typeof ttlMs !== 'number' || ttlMs <= 0) {
      throw new Error('CachedValue ttlMs must be a positive number');
    }
    if (typeof compute !== 'function') {
      throw new Error('CachedValue compute must be a function');
    }
    /** @type {import('../../ports/ClockPort.js').default} */
    this._clock = clock;
    /** @type {number} */
    this._ttlMs = ttlMs;
    /** @type {() => T | Promise<T>} */
    this._compute = compute;
    /** @type {T|null} */
    this._value = null;
    /** @type {Promise<T>|null} */
    this._inflight = null;
    /** @type {number} */
    this._generation = 0;
    /** @type {number} */
    this._cachedAt = 0;
    /** @type {string|null} */
    this._cachedAtIso = null;
  }

  /**
   * Gets the cached value, computing it if stale or not present.
   *
   * @returns {Promise<T>} The cached or freshly computed value
   */
  async get() {
    if (this._isValid()) {
      return /** @type {T} */ (this._value);
    }
    if (this._inflight) {
      return await this._inflight;
    }
    this._inflight = this._computeAndCache(this._generation);
    return await this._inflight;
  }

  /**
   * Runs the compute function and caches the result if the generation is still current.
   * @param {number} generation - The generation at the time compute was initiated
   * @returns {Promise<T>}
   * @private
   */
  async _computeAndCache(generation) {
    try {
      const value = await this._compute();
      if (generation === this._generation) {
        this._value = value;
        this._cachedAt = this._clock.now();
        this._cachedAtIso = this._clock.timestamp();
        this._inflight = null;
      }
      return value;
    } catch (err) {
      if (generation === this._generation) {
        this._inflight = null;
      }
      throw err;
    }
  }

  /**
   * Gets the cached value with metadata about when it was cached.
   *
   * @returns {Promise<{value: T, cachedAt: string|null, fromCache: boolean}>}
   */
  async getWithMetadata() {
    const wasValid = this._isValid();
    const value = await this.get();

    return {
      value,
      cachedAt: wasValid ? this._cachedAtIso : null,
      fromCache: wasValid,
    };
  }

  /**
   * Invalidates the cached value, forcing recomputation on next get().
   */
  invalidate() {
    this._generation += 1;
    this._value = null;
    this._inflight = null;
    this._cachedAt = 0;
    this._cachedAtIso = null;
  }

  /**
   * Checks if the cached value is still valid.
   *
   * @returns {boolean} True if the cache is valid
   * @private
   */
  _isValid() {
    if (this._value === null) {
      return false;
    }
    return this._clock.now() - this._cachedAt < this._ttlMs;
  }

  /**
   * Gets the ISO timestamp of when the value was cached.
   * Returns null if no value is cached.
   *
   * @returns {string|null}
   */
  get cachedAt() {
    return this._cachedAtIso;
  }

  /**
   * Checks if a value is currently cached (regardless of validity).
   *
   * @returns {boolean}
   */
  get hasValue() {
    return this._value !== null;
  }
}

export default CachedValue;
