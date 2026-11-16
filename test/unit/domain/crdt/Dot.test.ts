import { describe, it, expect } from 'vitest';
import {
  Dot,
  dotsEqual,
  encodeDot,
  decodeDot,
} from '../../../../src/domain/crdt/Dot.ts';

describe('Dot', () => {
  describe('Dot.create()', () => {
    it('creates a dot with writerId and counter', () => {
      const dot = Dot.create('alice', 1);

      expect(dot).toEqual({
        writerId: 'alice',
        counter: 1,
      });
    });

    it('creates a dot with high counter value', () => {
      const dot = Dot.create('writer', 1000000);

      expect(dot).toEqual({
        writerId: 'writer',
        counter: 1000000,
      });
    });

    it('throws on empty writerId', () => {
      expect(() => Dot.create('', 1)).toThrow('writerId must be a non-empty string');
    });

    it('throws on non-string writerId', () => {
      // @ts-expect-error Exercise the JavaScript boundary with a number.
      expect(() => Dot.create(123, 1)).toThrow('writerId must be a non-empty string');
      // @ts-expect-error Exercise the JavaScript boundary with null.
      expect(() => Dot.create(null, 1)).toThrow('writerId must be a non-empty string');
      // @ts-expect-error Exercise the JavaScript boundary with undefined.
      expect(() => Dot.create(undefined, 1)).toThrow('writerId must be a non-empty string');
    });

    it('throws on non-positive counter', () => {
      expect(() => Dot.create('alice', 0)).toThrow('counter must be a positive safe integer');
      expect(() => Dot.create('alice', -1)).toThrow('counter must be a positive safe integer');
    });

    it('throws on non-integer counter', () => {
      expect(() => Dot.create('alice', 1.5)).toThrow('counter must be a positive safe integer');
      expect(() => Dot.create('alice', NaN)).toThrow('counter must be a positive safe integer');
      expect(() => Dot.create('alice', Infinity)).toThrow(
        'counter must be a positive safe integer'
      );
    });

    it('throws on non-number counter', () => {
      // @ts-expect-error Exercise the JavaScript boundary with a string.
      expect(() => Dot.create('alice', '1')).toThrow('counter must be a positive safe integer');
      // @ts-expect-error Exercise the JavaScript boundary with null.
      expect(() => Dot.create('alice', null)).toThrow('counter must be a positive safe integer');
    });
  });

  describe('dotsEqual', () => {
    it('returns true for equal dots', () => {
      const a = Dot.create('alice', 1);
      const b = Dot.create('alice', 1);

      expect(dotsEqual(a, b)).toBe(true);
    });

    it('returns false for different writerIds', () => {
      const a = Dot.create('alice', 1);
      const b = Dot.create('bob', 1);

      expect(dotsEqual(a, b)).toBe(false);
    });

    it('returns false for different counters', () => {
      const a = Dot.create('alice', 1);
      const b = Dot.create('alice', 2);

      expect(dotsEqual(a, b)).toBe(false);
    });

    it('returns false for completely different dots', () => {
      const a = Dot.create('alice', 1);
      const b = Dot.create('bob', 2);

      expect(dotsEqual(a, b)).toBe(false);
    });

    it('is reflexive', () => {
      const dot = Dot.create('alice', 1);

      expect(dotsEqual(dot, dot)).toBe(true);
    });

    it('is symmetric', () => {
      const a = Dot.create('alice', 1);
      const b = Dot.create('alice', 1);

      expect(dotsEqual(a, b)).toBe(dotsEqual(b, a));
    });
  });

  describe('encodeDot', () => {
    it('encodes dot as writerId:counter', () => {
      const dot = Dot.create('alice', 1);

      expect(encodeDot(dot)).toBe('alice:1');
    });

    it('encodes dot with high counter', () => {
      const dot = Dot.create('writer', 1000000);

      expect(encodeDot(dot)).toBe('writer:1000000');
    });

    it('encodes dot with hyphenated writerId', () => {
      const dot = Dot.create('my-writer-id', 42);

      expect(encodeDot(dot)).toBe('my-writer-id:42');
    });

    it('encodes dot with writerId containing colons', () => {
      // WriterIds might contain colons in URN-style identifiers
      const dot = Dot.create('urn:uuid:abc', 1);

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

    it.each([
      'alice:1garbage',
      'alice:1.5',
      'alice:1e3',
      'alice:+1',
      'alice:01',
      'alice: 1',
      'alice:1 ',
    ])('rejects non-canonical counter spelling %s', (encoded) => {
      expect(() => decodeDot(encoded)).toThrowError(
        expect.objectContaining({
          code: 'E_CRDT_INVALID_COUNTER',
        })
      );
    });

    it('roundtrips with encodeDot', () => {
      const original = Dot.create('alice', 42);
      const encoded = encodeDot(original);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(original, decoded)).toBe(true);
    });

    it('roundtrips with complex writerId', () => {
      const original = Dot.create('urn:uuid:550e8400-e29b-41d4-a716-446655440000', 999);
      const encoded = encodeDot(original);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(original, decoded)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles writerId with special characters', () => {
      const dot = Dot.create('user_123.test-writer', 1);

      expect(dot).toEqual({
        writerId: 'user_123.test-writer',
        counter: 1,
      });

      const encoded = encodeDot(dot);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(dot, decoded)).toBe(true);
    });

    it('handles very large counter values', () => {
      const dot = Dot.create('alice', Number.MAX_SAFE_INTEGER);

      expect(dot.counter).toBe(Number.MAX_SAFE_INTEGER);

      const encoded = encodeDot(dot);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(dot, decoded)).toBe(true);
    });

    it('rejects counters beyond exact integer representation', () => {
      expect(() => Dot.create('alice', Number.MAX_SAFE_INTEGER + 1)).toThrowError(
        expect.objectContaining({ code: 'E_CRDT_INVALID_COUNTER' })
      );
    });

    it('handles unicode writerId', () => {
      const dot = Dot.create('writer-\u4e2d\u6587', 1);

      expect(dot.writerId).toBe('writer-\u4e2d\u6587');

      const encoded = encodeDot(dot);
      const decoded = decodeDot(encoded);

      expect(dotsEqual(dot, decoded)).toBe(true);
    });
  });
});
