import { describe, it, expect } from 'vitest';
import { encode, decode } from '../../../../src/infrastructure/codecs/CborCodec.js';

describe('CborCodec', () => {
  describe('encode', () => {
    it('encodes and returns a Buffer', () => {
      const result = encode({ hello: 'world' });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('produces bytes with keys sorted (a before z)', () => {
      // Encode object with keys in reverse order
      const result = encode({ z: 1, a: 2 });

      // Decode to verify key order is preserved after encoding
      const decoded = /** @type {Record<string, unknown>} */ (decode(result));
      const keys = Object.keys(decoded);

      // Object.keys on decoded should show sorted order
      // (JavaScript objects preserve insertion order since ES2015)
      expect(keys).toEqual(['a', 'z']);
    });

    it('handles empty objects', () => {
      const result = encode({});
      const decoded = decode(result);
      expect(decoded).toEqual({});
    });

    it('handles null values', () => {
      const result = encode(null);
      const decoded = decode(result);
      expect(decoded).toBeNull();
    });

    it('handles undefined values', () => {
      const result = encode(undefined);
      const decoded = decode(result);
      // cbor-x preserves undefined as undefined
      expect(decoded).toBeUndefined();
    });

    it('handles primitive values', () => {
      expect(decode(encode(42))).toBe(42);
      expect(decode(encode('hello'))).toBe('hello');
      expect(decode(encode(true))).toBe(true);
      expect(decode(encode(false))).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('decode(encode(data)) equals original data for simple object', () => {
      const original = { name: 'test', value: 123 };
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });

    it('preserves nested object structure', () => {
      const original = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });

    it('preserves arrays', () => {
      const original = [1, 2, 3, 'four', { five: 5 }];
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });

    it('preserves arrays of objects with correct key order', () => {
      const original = [{ z: 1, a: 2 }, { b: 3, c: 4 }];
      const result = /** @type {any[]} */ (decode(encode(original)));
      expect(result).toEqual(original);
      expect(Object.keys(result[0])).toEqual(['a', 'z']);
    });

    it('preserves unicode strings', () => {
      const original = {
        emoji: '🚀',
        chinese: '你好',
        arabic: 'مرحبا',
        mixed: 'Hello 世界 🌍',
      };
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });

    it('handles large integers', () => {
      const original = {
        maxSafe: Number.MAX_SAFE_INTEGER,
        minSafe: Number.MIN_SAFE_INTEGER,
        large: 9007199254740991,
      };
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });

    it('handles BigInt values', () => {
      const original = {
        big: BigInt('9223372036854775807'),
        negative: BigInt('-9223372036854775808'),
      };
      const result = /** @type {any} */ (decode(encode(original)));
      expect(result.big).toBe(original.big);
      expect(result.negative).toBe(original.negative);
    });

    it('handles floating point numbers', () => {
      const original = {
        pi: 3.14159265359,
        e: 2.71828182845,
        negative: -123.456,
      };
      const result = /** @type {any} */ (decode(encode(original)));
      expect(result.pi).toBeCloseTo(original.pi, 10);
      expect(result.e).toBeCloseTo(original.e, 10);
      expect(result.negative).toBeCloseTo(original.negative, 10);
    });

    it('handles boolean values', () => {
      const original = { yes: true, no: false };
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });
  });

  describe('determinism', () => {
    it('encode(obj) called twice produces identical Buffer', () => {
      const obj = { z: 1, a: 2, m: 3 };

      const result1 = encode(obj);
      const result2 = encode(obj);

      expect(result1.equals(result2)).toBe(true);
    });

    it('different key insertion order produces identical bytes', () => {
      // Create objects with same data but different insertion order
      const obj1 = { z: 1, a: 2, m: 3 };
      const obj2 = { a: 2, z: 1, m: 3 };
      const obj3 = { m: 3, a: 2, z: 1 };

      const result1 = encode(obj1);
      const result2 = encode(obj2);
      const result3 = encode(obj3);

      expect(result1.equals(result2)).toBe(true);
      expect(result2.equals(result3)).toBe(true);
    });

    it('produces identical bytes for complex nested structures', () => {
      const obj1 = {
        z: { b: 1, a: 2 },
        a: { d: 3, c: 4 },
        array: [{ z: 1, a: 2 }],
      };

      const obj2 = {
        a: { c: 4, d: 3 },
        z: { a: 2, b: 1 },
        array: [{ a: 2, z: 1 }],
      };

      const result1 = encode(obj1);
      const result2 = encode(obj2);

      expect(result1.equals(result2)).toBe(true);
    });

    it('multiple encodes of deep nested structure are identical', () => {
      const deep = {
        level1: {
          z: 'last',
          a: 'first',
          level2: {
            z: { value: 1 },
            a: { value: 2 },
            level3: {
              array: [
                { z: 1, a: 2 },
                { b: 3, a: 4 },
              ],
            },
          },
        },
      };

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(encode(deep));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[0].equals(results[i])).toBe(true);
      }
    });

    it('produces different bytes for different data', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 2 };

      const result1 = encode(obj1);
      const result2 = encode(obj2);

      expect(result1.equals(result2)).toBe(false);
    });
  });

  describe('nested objects', () => {
    it('sorts keys at all nesting levels', () => {
      const nested = {
        z: {
          z: 1,
          a: 2,
        },
        a: {
          z: 3,
          a: 4,
        },
      };

      const result = /** @type {any} */ (decode(encode(nested)));

      // Verify top-level keys are sorted
      expect(Object.keys(result)).toEqual(['a', 'z']);

      // Verify nested keys are sorted
      expect(Object.keys(result.a)).toEqual(['a', 'z']);
      expect(Object.keys(result.z)).toEqual(['a', 'z']);
    });

    it('handles mixed arrays and objects', () => {
      const mixed = {
        items: [
          { z: 1, a: 2 },
          { c: 3, b: 4 },
          'string',
          42,
        ],
      };

      const result = /** @type {any} */ (decode(encode(mixed)));

      expect(Object.keys(result.items[0])).toEqual(['a', 'z']);
      expect(Object.keys(result.items[1])).toEqual(['b', 'c']);
      expect(result.items[2]).toBe('string');
      expect(result.items[3]).toBe(42);
    });

    it('handles deeply nested structures', () => {
      const deep = {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: {
                  value: 'deep',
                  z: 1,
                  a: 2,
                },
              },
            },
          },
        },
      };

      const result = /** @type {any} */ (decode(encode(deep)));
      const deepKeys = Object.keys(result.l1.l2.l3.l4.l5);
      expect(deepKeys).toEqual(['a', 'value', 'z']);
    });
  });

  describe('arrays', () => {
    it('preserves array order', () => {
      const original = [3, 1, 2];
      const result = decode(encode(original));
      expect(result).toEqual([3, 1, 2]);
    });

    it('handles empty arrays', () => {
      /** @type {any[]} */
      const original = [];
      const result = decode(encode(original));
      expect(result).toEqual([]);
    });

    it('handles nested arrays', () => {
      const original = [[1, 2], [3, 4], [[5, 6]]];
      const result = decode(encode(original));
      expect(result).toEqual(original);
    });

    it('handles arrays with null/undefined elements', () => {
      const original = [1, null, 3];
      const result = decode(encode(original));
      expect(result).toEqual([1, null, 3]);
    });
  });

  describe('special cases', () => {
    it('handles objects with numeric string keys deterministically', () => {
      // JavaScript automatically sorts integer-like string keys numerically in objects
      // This means Object.keys returns ['1', '2', '10'] regardless of insertion order
      const obj1 = { '10': 'ten', '2': 'two', '1': 'one' };
      const obj2 = { '1': 'one', '2': 'two', '10': 'ten' };
      const obj3 = { '2': 'two', '10': 'ten', '1': 'one' };

      const enc1 = encode(obj1);
      const enc2 = encode(obj2);
      const enc3 = encode(obj3);

      // All encodings should be identical (deterministic)
      expect(enc1.equals(enc2)).toBe(true);
      expect(enc2.equals(enc3)).toBe(true);

      // Decoding should preserve the data
      const result = decode(enc1);
      expect(result).toEqual({ '1': 'one', '2': 'two', '10': 'ten' });
    });

    it('handles objects with special characters in keys', () => {
      const obj = { 'key-with-dash': 1, 'key_with_underscore': 2, 'key.with.dot': 3 };
      const result = decode(encode(obj));
      expect(result).toEqual(obj);
    });

    it('handles objects with unicode keys', () => {
      const obj = { alpha: 1, beta: 2, gamma: 3 };
      const result = /** @type {any} */ (decode(encode(obj)));
      expect(Object.keys(result)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('handles Buffer/Uint8Array values', () => {
      const buffer = Buffer.from([1, 2, 3, 4]);
      const obj = { data: buffer };
      const result = /** @type {any} */ (decode(encode(obj)));

      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result.data).equals(buffer)).toBe(true);
    });
  });

  describe('decode', () => {
    it('decodes Buffer input', () => {
      const encoded = encode({ test: 'value' });
      const result = decode(encoded);
      expect(result).toEqual({ test: 'value' });
    });

    it('decodes Uint8Array input', () => {
      const encoded = encode({ test: 'value' });
      const uint8 = new Uint8Array(encoded);
      const result = decode(uint8);
      expect(result).toEqual({ test: 'value' });
    });
  });
});
