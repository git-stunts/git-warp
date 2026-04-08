/**
 * A TTL-based caching utility for a single value.
 *
 * Caches the result of an expensive operation and reuses it until
 * the configured TTL expires. Supports manual invalidation.
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

import WarpError from '../errors/WarpError.ts';
import type ClockPort from '../../ports/ClockPort.ts';

interface CachedValueOptions<T> {
  readonly clock: ClockPort;
  readonly ttlMs: number;
  readonly compute: () => T | Promise<T>;
}

class CachedValue<T> {
  private readonly _clock: ClockPort;
  private readonly _ttlMs: number;
  private readonly _compute: () => T | Promise<T>;
  private _value: T | null;
  private _inflight: Promise<T> | null;
  private _generation: number;
  private _cachedAt: number;
  private _cachedAtIso: string | null;

  /**
   * Creates a CachedValue instance.
   *
   * @throws {Error} If ttlMs is not a positive number
   */
  constructor({ clock, ttlMs, compute }: CachedValueOptions<T>) {
    if (typeof ttlMs !== 'number' || ttlMs <= 0) {
      throw new WarpError('CachedValue ttlMs must be a positive number', 'E_INVALID_ARG');
    }
    if (typeof compute !== 'function') {
      throw new WarpError('CachedValue compute must be a function', 'E_INVALID_ARG');
    }
    this._clock = clock;
    this._ttlMs = ttlMs;
    this._compute = compute;
    this._value = null;
    this._inflight = null;
    this._generation = 0;
    this._cachedAt = 0;
    this._cachedAtIso = null;
  }

  /** Gets the cached value, computing it if stale or not present. */
  async get(): Promise<T> {
    if (this._isValid()) {
      return this._value!;
    }
    if (this._inflight) {
      return await this._inflight;
    }
    this._inflight = this._computeAndCache(this._generation);
    return await this._inflight;
  }

  /**
   * Runs the compute function and caches the result if the generation is still current.
   */
  private async _computeAndCache(generation: number): Promise<T> {
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

  /** Gets the cached value with metadata about when it was cached. */
  async getWithMetadata(): Promise<{ value: T; cachedAt: string | null; fromCache: boolean }> {
    const wasValid = this._isValid();
    const value = await this.get();

    return {
      value,
      cachedAt: wasValid ? this._cachedAtIso : null,
      fromCache: wasValid,
    };
  }

  /** Invalidates the cached value, forcing recomputation on next get(). */
  invalidate(): void {
    this._generation += 1;
    this._value = null;
    this._inflight = null;
    this._cachedAt = 0;
    this._cachedAtIso = null;
  }

  /** Checks if the cached value is still valid. */
  private _isValid(): boolean {
    if (this._value === null) {
      return false;
    }
    return this._clock.now() - this._cachedAt < this._ttlMs;
  }

  /**
   * Gets the ISO timestamp of when the value was cached.
   * Returns null if no value is cached.
   */
  get cachedAt(): string | null {
    return this._cachedAtIso;
  }

  /** Checks if a value is currently cached (regardless of validity). */
  get hasValue(): boolean {
    return this._value !== null;
  }
}

export default CachedValue;
