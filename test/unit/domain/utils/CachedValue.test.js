import { describe, it, expect, vi } from 'vitest';
import CachedValue_ from '../../../../src/domain/utils/CachedValue.js';

/** @type {any} */
const CachedValue = CachedValue_;

/**
 * Creates a mock clock for testing.
 * @returns {any} Mock clock with controllable time
 */
function createMockClock() {
  let currentTime = 0;
  return {
    now: () => currentTime,
    timestamp: () => new Date(currentTime).toISOString(),
    advance: (/** @type {number} */ ms) => {
      currentTime += ms;
    },
    setTime: (/** @type {number} */ ms) => {
      currentTime = ms;
    },
  };
}

describe('CachedValue', () => {
  describe('constructor', () => {
    it('creates cache with valid options', () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      expect(cache.hasValue).toBe(false);
      expect(cache.cachedAt).toBeNull();
    });

    it('throws when ttlMs is not a positive number', () => {
      const clock = createMockClock();
      const compute = () => 'value';

      expect(() => new CachedValue({ clock, ttlMs: 0, compute })).toThrow(
        'CachedValue ttlMs must be a positive number',
      );
      expect(() => new CachedValue({ clock, ttlMs: -1, compute })).toThrow(
        'CachedValue ttlMs must be a positive number',
      );
      expect(() => new CachedValue({ clock, ttlMs: 'invalid', compute })).toThrow(
        'CachedValue ttlMs must be a positive number',
      );
      expect(() => new CachedValue({ clock, ttlMs: null, compute })).toThrow(
        'CachedValue ttlMs must be a positive number',
      );
    });

    it('throws when compute is not a function', () => {
      const clock = createMockClock();

      expect(() => new CachedValue({ clock, ttlMs: 5000, compute: 'not a function' })).toThrow(
        'CachedValue compute must be a function',
      );
      expect(() => new CachedValue({ clock, ttlMs: 5000, compute: null })).toThrow(
        'CachedValue compute must be a function',
      );
    });
  });

  describe('get', () => {
    it('computes value on first call', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValue('computed');
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      const value = await cache.get();

      expect(value).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('returns cached value within TTL', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValue('computed');
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      await cache.get();
      clock.advance(4999); // Just under TTL
      const value = await cache.get();

      expect(value).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('recomputes value after TTL expires', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      const first = await cache.get();
      clock.advance(5001); // Just over TTL
      const second = await cache.get();

      expect(first).toBe('first');
      expect(second).toBe('second');
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('supports synchronous compute functions', async () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'sync value',
      });

      const value = await cache.get();

      expect(value).toBe('sync value');
    });

    it('supports async compute functions', async () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: async () => {
          return 'async value';
        },
      });

      const value = await cache.get();

      expect(value).toBe('async value');
    });
  });

  describe('getWithMetadata', () => {
    it('returns fromCache false on first call', async () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      const result = await cache.getWithMetadata();

      expect(result.value).toBe('value');
      expect(result.fromCache).toBe(false);
      expect(result.cachedAt).toBeNull();
    });

    it('returns fromCache true and cachedAt for cached results', async () => {
      const clock = createMockClock();
      clock.setTime(1000);
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      await cache.get();
      clock.advance(1000);
      const result = await cache.getWithMetadata();

      expect(result.value).toBe('value');
      expect(result.fromCache).toBe(true);
      expect(result.cachedAt).toBe(new Date(1000).toISOString());
    });
  });

  describe('invalidate', () => {
    it('clears cached value', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValue('computed');
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      await cache.get();
      cache.invalidate();

      expect(cache.hasValue).toBe(false);
      expect(cache.cachedAt).toBeNull();
    });

    it('forces recomputation on next get', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      const first = await cache.get();
      cache.invalidate();
      const second = await cache.get();

      expect(first).toBe('first');
      expect(second).toBe('second');
      expect(compute).toHaveBeenCalledTimes(2);
    });
  });

  describe('hasValue', () => {
    it('returns false before first computation', () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      expect(cache.hasValue).toBe(false);
    });

    it('returns true after computation', async () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      await cache.get();

      expect(cache.hasValue).toBe(true);
    });

    it('returns true even after TTL expires (value is stale but still cached)', async () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      await cache.get();
      clock.advance(10000); // Way past TTL

      // Value is stale but still present
      expect(cache.hasValue).toBe(true);
    });

    it('returns false after invalidate', async () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      await cache.get();
      cache.invalidate();

      expect(cache.hasValue).toBe(false);
    });
  });

  describe('cachedAt', () => {
    it('returns null before first computation', () => {
      const clock = createMockClock();
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      expect(cache.cachedAt).toBeNull();
    });

    it('returns ISO timestamp after computation', async () => {
      const clock = createMockClock();
      clock.setTime(1609459200000); // 2021-01-01T00:00:00.000Z
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      await cache.get();

      expect(cache.cachedAt).toBe('2021-01-01T00:00:00.000Z');
    });

    it('updates timestamp after recomputation', async () => {
      const clock = createMockClock();
      clock.setTime(1000);
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => 'value',
      });

      await cache.get();
      const firstCachedAt = cache.cachedAt;

      clock.advance(6000); // Past TTL
      await cache.get();
      const secondCachedAt = cache.cachedAt;

      expect(firstCachedAt).not.toBe(secondCachedAt);
      expect(secondCachedAt).toBe(new Date(7000).toISOString());
    });
  });

  describe('edge cases', () => {
    it('handles null return value from compute', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValue(null);
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      const value = await cache.get();

      expect(value).toBeNull();
      // Note: hasValue returns false for null since we check _value === null
      expect(cache.hasValue).toBe(false);
    });

    it('handles compute function that throws', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockRejectedValue(new Error('compute failed'));
      const cache = new CachedValue({ clock, ttlMs: 5000, compute });

      await expect(cache.get()).rejects.toThrow('compute failed');
      expect(cache.hasValue).toBe(false);
    });

    it('handles very small TTL', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const cache = new CachedValue({ clock, ttlMs: 1, compute });

      await cache.get();
      clock.advance(2);
      const second = await cache.get();

      expect(second).toBe('second');
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('handles very large TTL', async () => {
      const clock = createMockClock();
      const compute = vi.fn().mockResolvedValue('value');
      const cache = new CachedValue({ clock, ttlMs: Number.MAX_SAFE_INTEGER, compute });

      await cache.get();
      clock.advance(1000000000);
      await cache.get();

      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('caches object values correctly', async () => {
      const clock = createMockClock();
      const obj = { nested: { deeply: true }, array: [1, 2, 3] };
      const cache = new CachedValue({
        clock,
        ttlMs: 5000,
        compute: () => obj,
      });

      const value = await cache.get();

      expect(value).toBe(obj);
      expect(value.nested.deeply).toBe(true);
      expect(value.array).toEqual([1, 2, 3]);
    });
  });
});
