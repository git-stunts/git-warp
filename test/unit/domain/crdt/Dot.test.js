import { describe, it, expect } from 'vitest';
import {
  createDot,
  dotsEqual,
  encodeDot,
  decodeDot,
  compareDots,
} from '../../../../src/domain/crdt/Dot.js';

describe('Dot', () => {
  describe('createDot', () => {
    it('creates a dot with writerId and counter', () => {
      const dot = createDot('alice', 1);

      expect(dot).toEqual({
        writerId: 'alice',
        counter: 1,
      });
    });

    it('creates a dot with high counter value', () => {
      const dot = createDot('writer', 1000000);

      expect(dot).toEqual({
        writerId: 'writer',
        counter: 1000000,
      });
    });

    it('throws on empty writerId', () => {
      expect(() => createDot('', 1)).toThrow('writerId must be a non-empty string');
    });

    it('throws on non-string writerId', () => {
      expect(() => createDot(123, 1)).toThrow('writerId must be a non-empty string');
      expect(() => createDot(null, 1)).toThrow('writerId must be a non-empty string');
      expect(() => createDot(undefined, 1)).toThrow('writerId must be a non-empty string');
    });

    it('throws on non-positive counter', () => {
      expect(() => createDot('alice', 0)).toThrow('counter must be a positive integer');
      expect(() => createDot('alice', -1)).toThrow('counter must be a positive integer');
    });

    it('throws on non-integer counter', () => {
      expect(() => createDot('alice', 1.5)).toThrow('counter must be a positive integer');
      expect(() => createDot('alice', NaN)).toThrow('counter must be a positive integer');
      expect(() => createDot('alice', Infinity)).toThrow('counter must be a positive integer');
    });

    it('throws on non-number counter', () => {
      expect(() => createDot('alice', '1')).toThrow('counter must be a positive integer');
      expect(() => createDot('alice', null)).toThrow('counter must be a positive integer');
    });
  });

  describe('dotsEqual', () => {
    it('returns true for equal dots', () => {
      const a = createDot('alice', 1);
      const b = createDot('alice', 1);

      expect(dotsEqual(a, b)).toBe(true);
    });

    it('returns false for different writerIds', () => {
      const a = createDot('alice', 1);
      const b = createDot('bob', 1);

      expect(dotsEqual(a, b)).toBe(false);
    });

    it('returns false for different counters', () => {
      const a = createDot('alice', 1);
      const b = createDot('alice', 2);

      expect(dotsEqual(a, b)).toBe(false);
    });

    it('returns false for completely different dots', () => {
      const a = createDot('alice', 1);
      const b = createDot('bob', 2);

      expect(dotsEqual(a, b)).toBe(false);
    });

    it('is reflexive', () => {
      const dot = createDot('alice', 1);

      expect(dotsEqual(dot, dot)).toBe(true);
    });

    it('is symmetric', () => {
      const a = createDot('alice', 1);
      const b = createDot('alice', 1);

      expect(dotsEqual(a, b)).toBe(dotsEqual(b, a));
    });
  });

  describe('encodeDot', () => {
    it('encodes dot as writerId:counter', () => {
      const dot = createDot('alice', 1);

      expect(encodeDot(dot)).toBe('alice:1');
    });

    it('encodes dot with high counter', () => {
      const dot = createDot('writer', 1000000);

      expect(encodeDot(dot)).toBe('writer:1000000');
    });

    it('encodes dot with hyphenated writerId', () => {
      const dot = createDot('my-writer-id', 42);

      expect(encodeDot(dot)).toBe('my-writer-id:42');
    });

    it('encodes dot with writerId containing colons', () => {
      // WriterIds might contain colons in URN-style identifiers
      const dot = createDot('urn:uuid:abc', 1);

      expect(encodeDot(dot)).toBe('urn:uuid:abc:1');
    });
  });

  describe('decodeDot', () => {
    it('decodes encoded dot', () => {
      const encoded = 'alice:1';

      expect(decodeDot(encoded)).toEqual({
        writerId: 'alice',
        counter: 1,
      });
    });

    it('decodes dot with high counter', () => {
      const encoded = 'writer:1000000';

      expect(decodeDot(encoded)).toEqual({
        writerId: 'writer',
        counter: 1000000,
      });
    });

    it('decodes dot with hyphenated writerId', () => {
      const encoded = 'my-writer-id:42';

      expect(decodeDot(encoded)).toEqual({
        writerId: 'my-writer-id',
        counter: 42,
      });
    });

    it('decodes dot with writerId containing colons', () => {
      // Uses lastIndexOf to find the counter separator
      const encoded = 'urn:uuid:abc:1';

      expect(decodeDot(encoded)).toEqual({
        writerId: 'urn:uuid:abc',
        counter: 1,
      });
    });

    it('throws on missing colon', () => {
      expect(() => decodeDot('alice1')).toThrow('Invalid encoded dot format: missing colon');
    });

    it('throws on empty writerId', () => {
      expect(() => decodeDot(':1')).toThrow('Invalid encoded dot format: empty writerId');
    });

    it('throws on invalid counter', () => {
      expect(() => decodeDot('alice:abc')).toThrow('Invalid encoded dot format: invalid counter');
      expect(() => decodeDot('alice:')).toThrow('Invalid encoded dot format: invalid counter');
      expect(() => decodeDot('alice:0')).toThrow('Invalid encoded dot format: invalid counter');
      expect(() => decodeDot('alice:-1')).toThrow('Invalid encoded dot format: invalid counter');
    });

    it('roundtrips with encodeDot', () => {
      const original = createDot('alice', 42);
      const encoded = encodeDot(original);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(original, decoded)).toBe(true);
    });

    it('roundtrips with complex writerId', () => {
      const original = createDot('urn:uuid:550e8400-e29b-41d4-a716-446655440000', 999);
      const encoded = encodeDot(original);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(original, decoded)).toBe(true);
    });
  });

  describe('compareDots', () => {
    it('returns 0 for equal dots', () => {
      const a = createDot('alice', 1);
      const b = createDot('alice', 1);

      expect(compareDots(a, b)).toBe(0);
    });

    it('compares by writerId first', () => {
      const alice = createDot('alice', 100);
      const bob = createDot('bob', 1);

      expect(compareDots(alice, bob)).toBe(-1);
      expect(compareDots(bob, alice)).toBe(1);
    });

    it('compares by counter when writerIds are equal', () => {
      const first = createDot('alice', 1);
      const second = createDot('alice', 2);

      expect(compareDots(first, second)).toBe(-1);
      expect(compareDots(second, first)).toBe(1);
    });

    it('is reflexive (a == a)', () => {
      const dot = createDot('alice', 1);

      expect(compareDots(dot, dot)).toBe(0);
    });

    it('is antisymmetric (if a < b then b > a)', () => {
      const a = createDot('alice', 1);
      const b = createDot('bob', 2);

      const cmpAB = compareDots(a, b);
      const cmpBA = compareDots(b, a);

      expect(cmpAB).toBe(-cmpBA);
    });

    it('is transitive (a < b < c implies a < c)', () => {
      const a = createDot('alice', 1);
      const b = createDot('bob', 1);
      const c = createDot('charlie', 1);

      expect(compareDots(a, b)).toBe(-1);
      expect(compareDots(b, c)).toBe(-1);
      expect(compareDots(a, c)).toBe(-1);
    });

    it('can be used for sorting', () => {
      const dots = [
        createDot('charlie', 2),
        createDot('alice', 1),
        createDot('bob', 3),
        createDot('alice', 2),
      ];

      dots.sort(compareDots);

      expect(dots).toEqual([
        createDot('alice', 1),
        createDot('alice', 2),
        createDot('bob', 3),
        createDot('charlie', 2),
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles writerId with special characters', () => {
      const dot = createDot('user_123.test-writer', 1);

      expect(dot).toEqual({
        writerId: 'user_123.test-writer',
        counter: 1,
      });

      const encoded = encodeDot(dot);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(dot, decoded)).toBe(true);
    });

    it('handles very large counter values', () => {
      const dot = createDot('alice', Number.MAX_SAFE_INTEGER);

      expect(dot.counter).toBe(Number.MAX_SAFE_INTEGER);

      const encoded = encodeDot(dot);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(dot, decoded)).toBe(true);
    });

    it('handles unicode writerId', () => {
      const dot = createDot('writer-\u4e2d\u6587', 1);

      expect(dot.writerId).toBe('writer-\u4e2d\u6587');

      const encoded = encodeDot(dot);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(dot, decoded)).toBe(true);
    });
  });
});
