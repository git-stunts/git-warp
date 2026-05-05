import { describe, it, expect, vi } from 'vitest';
import CachedValue from '../../../../src/domain/utils/CachedValue.ts';

describe('CachedValue', () => {
  describe('constructor', () => {
    it('creates cache with valid options', () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      expect(cache.hasValue).toBe(false);
      expect(cache.cachedAtTick).toBe(0);
    });

    it('throws when ttlTicks is not a positive number', () => {
      const compute = () => 'value';

      expect(() => new CachedValue({ ttlTicks: 0, compute })).toThrow(
        'CachedValue ttlTicks must be a positive number',
      );
      expect(() => new CachedValue({ ttlTicks: -1, compute })).toThrow(
        'CachedValue ttlTicks must be a positive number',
      );
      expect(() => new CachedValue({ ttlTicks: 'invalid' as unknown as number, compute })).toThrow(
        'CachedValue ttlTicks must be a positive number',
      );
      expect(() => new CachedValue({ ttlTicks: null as unknown as number, compute })).toThrow(
        'CachedValue ttlTicks must be a positive number',
      );
    });

    it('throws when compute is not a function', () => {
      expect(() => new CachedValue({ ttlTicks: 100, compute: 'not a function' as unknown as () => string })).toThrow(
        'CachedValue compute must be a function',
      );
      expect(() => new CachedValue({ ttlTicks: 100, compute: null as unknown as () => string })).toThrow(
        'CachedValue compute must be a function',
      );
    });
  });

  describe('get', () => {
    it('computes value on first call', async () => {
      const compute = vi.fn().mockResolvedValue('computed');
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const value = await cache.get(1);

      expect(value).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('returns cached value within tick threshold', async () => {
      const compute = vi.fn().mockResolvedValue('computed');
      const cache = new CachedValue({ ttlTicks: 100, compute });

      await cache.get(10);
      const value = await cache.get(109); // Just under threshold

      expect(value).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('recomputes value after tick threshold exceeded', async () => {
      const compute = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const first = await cache.get(10);
      const second = await cache.get(111); // Past threshold

      expect(first).toBe('first');
      expect(second).toBe('second');
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('supports synchronous compute functions', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'sync value',
      });

      const value = await cache.get(1);

      expect(value).toBe('sync value');
    });

    it('supports async compute functions', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: async () => {
          return 'async value';
        },
      });

      const value = await cache.get(1);

      expect(value).toBe('async value');
    });

    it('memoizes in-flight compute for concurrent get calls', async () => {
      let resolveCompute: (value: string) => void = () => {};
      const compute = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveCompute = resolve;
        });
      });
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const first = cache.get(1);
      const second = cache.get(1);

      expect(compute).toHaveBeenCalledTimes(1);
      resolveCompute('computed');

      const [firstValue, secondValue] = await Promise.all([first, second]);
      expect(firstValue).toBe('computed');
      expect(secondValue).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWithMetadata', () => {
    it('returns fromCache false on first call', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      const result = await cache.getWithMetadata(1);

      expect(result.value).toBe('value');
      expect(result.fromCache).toBe(false);
      expect(result.cachedAtTick).toBe(0);
    });

    it('returns fromCache true and cachedAtTick for cached results', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      await cache.get(10);
      const result = await cache.getWithMetadata(20);

      expect(result.value).toBe('value');
      expect(result.fromCache).toBe(true);
      expect(result.cachedAtTick).toBe(10);
    });
  });

  describe('invalidate', () => {
    it('clears cached value', async () => {
      const compute = vi.fn().mockResolvedValue('computed');
      const cache = new CachedValue({ ttlTicks: 100, compute });

      await cache.get(1);
      cache.invalidate();

      expect(cache.hasValue).toBe(false);
      expect(cache.cachedAtTick).toBe(0);
    });

    it('forces recomputation on next get', async () => {
      const compute = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const first = await cache.get(1);
      cache.invalidate();
      const second = await cache.get(2);

      expect(first).toBe('first');
      expect(second).toBe('second');
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('does not re-cache stale in-flight result after invalidate', async () => {
      let resolveCompute: (value: string) => void = () => {};
      const compute = vi.fn()
        .mockImplementationOnce(() => {
          return new Promise((resolve) => {
            resolveCompute = resolve;
          });
        })
        .mockResolvedValueOnce('fresh');
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const first = cache.get(1);
      cache.invalidate();
      resolveCompute('stale');

      expect(await first).toBe('stale');
      expect(cache.hasValue).toBe(false);

      const second = await cache.get(2);
      expect(second).toBe('fresh');
      expect(cache.hasValue).toBe(true);
      expect(compute).toHaveBeenCalledTimes(2);
    });
  });

  describe('hasValue', () => {
    it('returns false before first computation', () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      expect(cache.hasValue).toBe(false);
    });

    it('returns true after computation', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      await cache.get(1);

      expect(cache.hasValue).toBe(true);
    });

    it('returns true even after tick threshold expires (value is stale but still cached)', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      await cache.get(1);

      // Value is stale but still present
      expect(cache.hasValue).toBe(true);
    });

    it('returns false after invalidate', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      await cache.get(1);
      cache.invalidate();

      expect(cache.hasValue).toBe(false);
    });
  });

  describe('cachedAtTick', () => {
    it('returns 0 before first computation', () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      expect(cache.cachedAtTick).toBe(0);
    });

    it('returns the tick at which the value was cached', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      await cache.get(42);

      expect(cache.cachedAtTick).toBe(42);
    });

    it('updates tick after recomputation', async () => {
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => 'value',
      });

      await cache.get(10);
      const firstTick = cache.cachedAtTick;

      await cache.get(200); // Past threshold, recomputes
      const secondTick = cache.cachedAtTick;

      expect(firstTick).toBe(10);
      expect(secondTick).toBe(200);
    });
  });

  describe('edge cases', () => {
    it('handles null return value from compute', async () => {
      const compute = vi.fn().mockResolvedValue(null);
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const value = await cache.get(1);

      expect(value).toBeNull();
      // Note: hasValue returns false for null since we check _value === null
      expect(cache.hasValue).toBe(false);
    });

    it('handles compute function that throws', async () => {
      const compute = vi.fn().mockRejectedValue(new Error('compute failed'));
      const cache = new CachedValue({ ttlTicks: 100, compute });

      await expect(cache.get(1)).rejects.toThrow('compute failed');
      expect(cache.hasValue).toBe(false);
    });

    it('handles very small tick threshold', async () => {
      const compute = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const cache = new CachedValue({ ttlTicks: 1, compute });

      await cache.get(1);
      const second = await cache.get(3);

      expect(second).toBe('second');
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('handles very large tick threshold', async () => {
      const compute = vi.fn().mockResolvedValue('value');
      const cache = new CachedValue({ ttlTicks: Number.MAX_SAFE_INTEGER, compute });

      await cache.get(1);
      await cache.get(1000000);

      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('caches object values correctly', async () => {
      const obj = { nested: { deeply: true }, array: [1, 2, 3] };
      const cache = new CachedValue({
        ttlTicks: 100,
        compute: () => obj,
      });

      const value = await cache.get(1);

      expect(value).toBe(obj);
      expect(value.nested.deeply).toBe(true);
      expect(value.array).toEqual([1, 2, 3]);
    });
  });

  // -----------------------------------------------------------------------
  // Null-payload semantics
  //
  // Returning `null` from compute means "no value available." This is an
  // intentional design contract: null is the sentinel that _isValid() checks,
  // so a null result is never cached. Every subsequent get() recomputes, and
  // the cache reports itself as empty. This prevents stale "absence" from
  // being treated as a valid cached answer.
  // -----------------------------------------------------------------------
  describe('null-payload semantics', () => {
    it('null return triggers recomputation on every get()', async () => {
      const compute = vi.fn().mockResolvedValue(null);
      const cache = new CachedValue({ ttlTicks: 100, compute });

      const first = await cache.get(1);
      const second = await cache.get(2);

      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('getWithMetadata returns fromCache=false for null', async () => {
      const compute = vi.fn().mockResolvedValue(null);
      const cache = new CachedValue({ ttlTicks: 100, compute });

      await cache.get(1);
      const result = await cache.getWithMetadata(2);

      expect(result.value).toBeNull();
      expect(result.fromCache).toBe(false);
    });

    it('hasValue returns false when compute returned null', async () => {
      const compute = vi.fn().mockResolvedValue(null);
      const cache = new CachedValue({ ttlTicks: 100, compute });

      await cache.get(1);

      expect(cache.hasValue).toBe(false);
    });
  });
});
