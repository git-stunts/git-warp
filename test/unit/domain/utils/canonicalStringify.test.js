import { describe, it, expect } from 'vitest';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { canonicalStringify } from '../../../../src/domain/utils/canonicalStringify.ts';

describe('canonicalStringify', () => {
  describe('primitives', () => {
    it('returns "null" for undefined', () => {
      expect(canonicalStringify(undefined)).toBe('null');
    });

    it('returns "null" for null', () => {
      expect(canonicalStringify(null)).toBe('null');
    });

    it('stringifies strings with JSON quoting', () => {
      expect(canonicalStringify('hello')).toBe('"hello"');
      expect(canonicalStringify('')).toBe('""');
      expect(canonicalStringify('with "quotes"')).toBe('"with \\"quotes\\""');
    });

    it('stringifies numbers', () => {
      expect(canonicalStringify(42)).toBe('42');
      expect(canonicalStringify(0)).toBe('0');
      expect(canonicalStringify(-3.14)).toBe('-3.14');
    });

    it('stringifies booleans', () => {
      expect(canonicalStringify(true)).toBe('true');
      expect(canonicalStringify(false)).toBe('false');
    });
  });

  describe('objects', () => {
    it('sorts keys alphabetically', () => {
      const result = canonicalStringify({ z: 1, a: 2, m: 3 });
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });

    it('returns "{}" for empty object', () => {
      expect(canonicalStringify({})).toBe('{}');
    });

    it('omits keys with undefined values', () => {
      const result = canonicalStringify({ a: 1, b: undefined, c: 3 });
      expect(result).toBe('{"a":1,"c":3}');
    });

    it('omits keys with function values', () => {
      const result = canonicalStringify({ a: 1, b: () => {}, c: 3 });
      expect(result).toBe('{"a":1,"c":3}');
    });

    it('omits keys with symbol values', () => {
      const result = canonicalStringify({ a: 1, b: Symbol('test'), c: 3 });
      expect(result).toBe('{"a":1,"c":3}');
    });

    it('returns "{}" when all values are filtered out', () => {
      const result = canonicalStringify({
        a: undefined,
        b: () => {},
        c: Symbol('x'),
      });
      expect(result).toBe('{}');
    });
  });

  describe('arrays', () => {
    it('stringifies basic arrays', () => {
      expect(canonicalStringify([1, 2, 3])).toBe('[1,2,3]');
      expect(canonicalStringify(['a', 'b'])).toBe('["a","b"]');
    });

    it('returns "[]" for empty array', () => {
      expect(canonicalStringify([])).toBe('[]');
    });

    it('replaces undefined elements with "null"', () => {
      const result = canonicalStringify([1, undefined, 3]);
      expect(result).toBe('[1,null,3]');
    });

    it('replaces function elements with "null"', () => {
      const result = canonicalStringify([1, () => {}, 3]);
      expect(result).toBe('[1,null,3]');
    });

    it('replaces symbol elements with "null"', () => {
      const result = canonicalStringify([1, Symbol('x'), 3]);
      expect(result).toBe('[1,null,3]');
    });
  });

  describe('nested structures', () => {
    it('handles nested objects with sorted keys', () => {
      const result = canonicalStringify({ b: { z: 1, a: 2 }, a: 'first' });
      expect(result).toBe('{"a":"first","b":{"a":2,"z":1}}');
    });

    it('handles nested arrays', () => {
      const result = canonicalStringify([[1, 2], [3, 4]]);
      expect(result).toBe('[[1,2],[3,4]]');
    });

    it('handles mixed nesting', () => {
      const result = canonicalStringify({ arr: [1, { b: 2, a: 1 }], key: 'val' });
      expect(result).toBe('{"arr":[1,{"a":1,"b":2}],"key":"val"}');
    });

    it('handles deeply nested structures', () => {
      const result = canonicalStringify({ a: { b: { c: { d: 42 } } } });
      expect(result).toBe('{"a":{"b":{"c":{"d":42}}}}');
    });
  });

  describe('cycle and shared-reference handling', () => {
    it('throws on circular object references', () => {
      /** @type {Record<string, unknown>} */
      const obj = { a: 1 };
      obj['self'] = obj;
      expect(() => canonicalStringify(obj)).toThrow(WarpError);
    });

    it('throws on circular array references', () => {
      /** @type {unknown[]} */
      const arr = [1, 2];
      arr.push(arr);
      expect(() => canonicalStringify(arr)).toThrow(WarpError);
    });

    it('allows shared (non-circular) object references', () => {
      const shared = { x: 1 };
      const obj = { a: shared, b: shared };
      expect(canonicalStringify(obj)).toBe('{"a":{"x":1},"b":{"x":1}}');
    });

    it('allows shared (non-circular) array references', () => {
      const shared = [1, 2];
      const obj = { a: shared, b: shared };
      expect(canonicalStringify(obj)).toBe('{"a":[1,2],"b":[1,2]}');
    });

    it('allows diamond-shaped object graph', () => {
      const leaf = { val: 42 };
      const left = { child: leaf };
      const right = { child: leaf };
      const root = { left, right };
      expect(canonicalStringify(root)).toBe(
        '{"left":{"child":{"val":42}},"right":{"child":{"val":42}}}',
      );
    });
  });

  describe('determinism', () => {
    it('produces identical output regardless of insertion order', () => {
      const obj1 = { z: 1, a: 2, m: 3 };
      const obj2 = { a: 2, z: 1, m: 3 };
      const obj3 = { m: 3, z: 1, a: 2 };

      const result1 = canonicalStringify(obj1);
      const result2 = canonicalStringify(obj2);
      const result3 = canonicalStringify(obj3);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });
});
