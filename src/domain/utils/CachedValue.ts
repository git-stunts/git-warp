/**
 * A tick-based caching utility for a single value.
 *
 * Caches the result of an expensive operation and reuses it until
 * the configured tick threshold is exceeded. Ticks are monotonic
 * counters (typically lamport ticks) passed by the caller — the
 * cache never reaches for wall-clock time.
 *
 * @example
 * const cache = new CachedValue({
 *   ttlTicks: 100,
 *   compute: async () => await expensiveOperation(),
 * });
 *
 * // First call computes the value
 * const value1 = await cache.get(currentLamport);
 *
 * // Subsequent calls within tick threshold return cached value
 * const value2 = await cache.get(currentLamport + 50); // Same as value1
 *
 * // Force recompute
 * cache.invalidate();
 * const value3 = await cache.get(currentLamport + 200); // Fresh value
 */

import WarpError from '../errors/WarpError.ts';

interface CachedValueOptions<T> {
  readonly ttlTicks: number;
  readonly compute: () => T | Promise<T>;
}

class CachedValue<T> {
  private readonly _ttlTicks: number;
  private readonly _compute: () => T | Promise<T>;
  private _value: T | null;
  private _inflight: Promise<T> | null;
  private _generation: number;
  private _cachedAtTick: number;

  /**
   * Creates a CachedValue instance.
   *
   * @throws {WarpError} If ttlTicks is not a positive number
   */
  constructor({ ttlTicks, compute }: CachedValueOptions<T>) {
    if (typeof ttlTicks !== 'number' || ttlTicks <= 0) {
      throw new WarpError('CachedValue ttlTicks must be a positive number', 'E_INVALID_ARG');
    }
    if (typeof compute !== 'function') {
      throw new WarpError('CachedValue compute must be a function', 'E_INVALID_ARG');
    }
    this._ttlTicks = ttlTicks;
    this._compute = compute;
    this._value = null;
    this._inflight = null;
    this._generation = 0;
    this._cachedAtTick = 0;
  }

  /** Gets the cached value, computing it if stale or not present. */
  async get(currentTick: number): Promise<T> {
    if (this._isValid(currentTick)) {
      return this._value!;
    }
    if (this._inflight) {
      return await this._inflight;
    }
    this._inflight = this._computeAndCache(this._generation, currentTick);
    return await this._inflight;
  }

  /**
   * Runs the compute function and caches the result if the generation is still current.
   */
  private async _computeAndCache(generation: number, currentTick: number): Promise<T> {
    try {
      const value = await this._compute();
      if (generation === this._generation) {
        this._value = value;
        this._cachedAtTick = currentTick;
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

  /** Gets the cached value with metadata about when it was cached. */
  async getWithMetadata(currentTick: number): Promise<{ value: T; cachedAtTick: number; fromCache: boolean }> {
    const wasValid = this._isValid(currentTick);
    const value = await this.get(currentTick);

    return {
      value,
      cachedAtTick: wasValid ? this._cachedAtTick : 0,
      fromCache: wasValid,
    };
  }

  /** Invalidates the cached value, forcing recomputation on next get(). */
  invalidate(): void {
    this._generation += 1;
    this._value = null;
    this._inflight = null;
    this._cachedAtTick = 0;
  }

  /** Checks if the cached value is still valid. */
  private _isValid(currentTick: number): boolean {
    if (this._value === null) {
      return false;
    }
    return currentTick - this._cachedAtTick < this._ttlTicks;
  }

  /**
   * Gets the tick at which the value was cached.
   * Returns 0 if no value is cached.
   */
  get cachedAtTick(): number {
    return this._cachedAtTick;
  }

  /** Checks if a value is currently cached (regardless of validity). */
  get hasValue(): boolean {
    return this._value !== null;
  }
}

export default CachedValue;
