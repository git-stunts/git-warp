import { describe, it, expect } from 'vitest';
import LRUCache_ from '../../../../src/domain/utils/LRUCache.js';

/** @type {any} */
const LRUCache = LRUCache_;

describe('LRUCache', () => {
  describe('constructor', () => {
    it('creates cache with specified maxSize', () => {
      const cache = new LRUCache(10);
      expect(cache.maxSize).toBe(10);
      expect(cache.size).toBe(0);
    });

    it('throws when maxSize is not a positive integer', () => {
      expect(() => new LRUCache(0)).toThrow('LRUCache maxSize must be a positive integer');
      expect(() => new LRUCache(-1)).toThrow('LRUCache maxSize must be a positive integer');
      expect(() => new LRUCache(1.5)).toThrow('LRUCache maxSize must be a positive integer');
      expect(() => new LRUCache('10')).toThrow('LRUCache maxSize must be a positive integer');
      expect(() => new LRUCache(null)).toThrow('LRUCache maxSize must be a positive integer');
      expect(() => new LRUCache(undefined)).toThrow('LRUCache maxSize must be a positive integer');
    });

    it('accepts maxSize of 1', () => {
      const cache = new LRUCache(1);
      expect(cache.maxSize).toBe(1);
    });
  });

  describe('set and get', () => {
    it('stores and retrieves values', () => {
      const cache = new LRUCache(10);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('returns undefined for missing keys', () => {
      const cache = new LRUCache(10);

      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing values', () => {
      const cache = new LRUCache(10);

      cache.set('key', 'original');
      expect(cache.get('key')).toBe('original');

      cache.set('key', 'updated');
      expect(cache.get('key')).toBe('updated');
      expect(cache.size).toBe(1);
    });

    it('supports various value types', () => {
      const cache = new LRUCache(10);
      const obj = { nested: true };
      const arr = [1, 2, 3];

      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('object', obj);
      cache.set('array', arr);
      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toBe(obj);
      expect(cache.get('array')).toBe(arr);
      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
    });

    it('returns cache instance from set for chaining', () => {
      const cache = new LRUCache(10);
      const result = cache.set('key', 'value');
      expect(result).toBe(cache);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when exceeding maxSize', () => {
      const cache = new LRUCache(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.size).toBe(3);

      // Adding 'd' should evict 'a' (oldest)
      cache.set('d', 4);
      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('get() marks entry as recently used', () => {
      const cache = new LRUCache(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Adding 'd' should now evict 'b' (now oldest)
      cache.set('d', 4);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('set() on existing key marks it as recently used', () => {
      const cache = new LRUCache(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to make it recently used
      cache.set('a', 100);

      // Adding 'd' should evict 'b' (now oldest)
      cache.set('d', 4);
      expect(cache.has('a')).toBe(true);
      expect(cache.get('a')).toBe(100);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('handles maxSize of 1', () => {
      const cache = new LRUCache(1);

      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      cache.set('b', 2);
      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('get() on missing key does not affect order', () => {
      const cache = new LRUCache(2);

      cache.set('a', 1);
      cache.set('b', 2);

      // Access non-existent key
      cache.get('nonexistent');

      // 'a' should still be oldest
      cache.set('c', 3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });

    it('evicts multiple items when adding many at once', () => {
      const cache = new LRUCache(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4);
      cache.set('e', 5);
      cache.set('f', 6);

      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(false);
      expect(cache.has('d')).toBe(true);
      expect(cache.has('e')).toBe(true);
      expect(cache.has('f')).toBe(true);
    });
  });

  describe('has', () => {
    it('returns true for existing keys', () => {
      const cache = new LRUCache(10);
      cache.set('key', 'value');

      expect(cache.has('key')).toBe(true);
    });

    it('returns false for missing keys', () => {
      const cache = new LRUCache(10);

      expect(cache.has('nonexistent')).toBe(false);
    });

    it('does NOT update access order', () => {
      const cache = new LRUCache(2);

      cache.set('a', 1);
      cache.set('b', 2);

      // has() should NOT make 'a' recently used
      cache.has('a');

      // 'a' should still be evicted as oldest
      cache.set('c', 3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });
  });

  describe('delete', () => {
    it('removes existing entry', () => {
      const cache = new LRUCache(10);
      cache.set('key', 'value');

      const result = cache.delete('key');

      expect(result).toBe(true);
      expect(cache.has('key')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('returns false for missing keys', () => {
      const cache = new LRUCache(10);

      const result = cache.delete('nonexistent');

      expect(result).toBe(false);
    });

    it('allows re-adding after delete', () => {
      const cache = new LRUCache(10);
      cache.set('key', 'original');
      cache.delete('key');
      cache.set('key', 'new');

      expect(cache.get('key')).toBe('new');
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new LRUCache(10);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(false);
    });

    it('can add entries after clear', () => {
      const cache = new LRUCache(10);
      cache.set('a', 1);
      cache.clear();
      cache.set('b', 2);

      expect(cache.size).toBe(1);
      expect(cache.get('b')).toBe(2);
    });
  });

  describe('size', () => {
    it('returns 0 for empty cache', () => {
      const cache = new LRUCache(10);
      expect(cache.size).toBe(0);
    });

    it('increases as entries are added', () => {
      const cache = new LRUCache(10);

      cache.set('a', 1);
      expect(cache.size).toBe(1);

      cache.set('b', 2);
      expect(cache.size).toBe(2);

      cache.set('c', 3);
      expect(cache.size).toBe(3);
    });

    it('stays at maxSize after eviction', () => {
      const cache = new LRUCache(2);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size).toBe(2);
    });

    it('decreases when entries are deleted', () => {
      const cache = new LRUCache(10);
      cache.set('a', 1);
      cache.set('b', 2);

      cache.delete('a');

      expect(cache.size).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles undefined as a key', () => {
      const cache = new LRUCache(10);

      cache.set(undefined, 'value for undefined');

      expect(cache.has(undefined)).toBe(true);
      expect(cache.get(undefined)).toBe('value for undefined');
    });

    it('handles null as a key', () => {
      const cache = new LRUCache(10);

      cache.set(null, 'value for null');

      expect(cache.has(null)).toBe(true);
      expect(cache.get(null)).toBe('value for null');
    });

    it('handles object as a key', () => {
      const cache = new LRUCache(10);
      const key = { id: 1 };

      cache.set(key, 'value');

      expect(cache.has(key)).toBe(true);
      expect(cache.get(key)).toBe('value');
      // Different object with same contents is a different key
      expect(cache.has({ id: 1 })).toBe(false);
    });

    it('handles empty string as a key', () => {
      const cache = new LRUCache(10);

      cache.set('', 'empty string key');

      expect(cache.has('')).toBe(true);
      expect(cache.get('')).toBe('empty string key');
    });

    it('handles large number of entries efficiently', () => {
      const cache = new LRUCache(1000);

      // Add more than maxSize entries
      for (let i = 0; i < 2000; i++) {
        cache.set(`key${i}`, i);
      }

      expect(cache.size).toBe(1000);

      // Only the last 1000 entries should remain
      expect(cache.has('key0')).toBe(false);
      expect(cache.has('key999')).toBe(false);
      expect(cache.has('key1000')).toBe(true);
      expect(cache.has('key1999')).toBe(true);
    });
  });
});
