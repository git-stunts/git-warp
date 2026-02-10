import { describe, it, expect } from 'vitest';
import { createEventId as _createEventId, compareEventIds, isGreater } from '../../../../src/domain/utils/EventId.js';

/** @type {any} */
const createEventId = _createEventId;

describe('EventId', () => {
  describe('createEventId', () => {
    it('creates EventId with valid inputs', () => {
      const eventId = createEventId(1, 'writer-1', 'abcd1234', 0);

      expect(eventId).toEqual({
        lamport: 1,
        writerId: 'writer-1',
        patchSha: 'abcd1234',
        opIndex: 0,
      });
    });

    it('accepts minimum valid patchSha length (4 chars)', () => {
      const eventId = createEventId(1, 'writer', 'abcd', 0);

      expect(eventId.patchSha).toBe('abcd');
    });

    it('accepts maximum valid patchSha length (64 chars)', () => {
      const sha64 = 'a'.repeat(64);
      const eventId = createEventId(1, 'writer', sha64, 0);

      expect(eventId.patchSha).toBe(sha64);
    });

    it('accepts full SHA-1 hash (40 chars)', () => {
      const sha1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
      const eventId = createEventId(1, 'writer', sha1, 0);

      expect(eventId.patchSha).toBe(sha1);
    });

    describe('lamport validation', () => {
      it('rejects negative lamport', () => {
        expect(() => createEventId(-1, 'writer', 'abcd1234', 0)).toThrow(
          'lamport must be a positive integer'
        );
      });

      it('rejects zero lamport', () => {
        expect(() => createEventId(0, 'writer', 'abcd1234', 0)).toThrow(
          'lamport must be a positive integer'
        );
      });

      it('rejects non-integer lamport', () => {
        expect(() => createEventId(1.5, 'writer', 'abcd1234', 0)).toThrow(
          'lamport must be a positive integer'
        );
      });

      it('rejects NaN lamport', () => {
        expect(() => createEventId(NaN, 'writer', 'abcd1234', 0)).toThrow(
          'lamport must be a positive integer'
        );
      });

      it('rejects Infinity lamport', () => {
        expect(() => createEventId(Infinity, 'writer', 'abcd1234', 0)).toThrow(
          'lamport must be a positive integer'
        );
      });
    });

    describe('writerId validation', () => {
      it('rejects empty writerId', () => {
        expect(() => createEventId(1, '', 'abcd1234', 0)).toThrow(
          'writerId must be a non-empty string'
        );
      });

      it('rejects null writerId', () => {
        expect(() => createEventId(1, null, 'abcd1234', 0)).toThrow(
          'writerId must be a non-empty string'
        );
      });

      it('rejects undefined writerId', () => {
        expect(() => createEventId(1, undefined, 'abcd1234', 0)).toThrow(
          'writerId must be a non-empty string'
        );
      });

      it('rejects number writerId', () => {
        expect(() => createEventId(1, 123, 'abcd1234', 0)).toThrow(
          'writerId must be a non-empty string'
        );
      });
    });

    describe('patchSha validation', () => {
      it('rejects invalid patchSha (too short)', () => {
        expect(() => createEventId(1, 'writer', 'abc', 0)).toThrow(
          'patchSha must be a hex string of 4-64 characters'
        );
      });

      it('rejects invalid patchSha (too long)', () => {
        const sha65 = 'a'.repeat(65);
        expect(() => createEventId(1, 'writer', sha65, 0)).toThrow(
          'patchSha must be a hex string of 4-64 characters'
        );
      });

      it('rejects invalid patchSha (non-hex characters)', () => {
        expect(() => createEventId(1, 'writer', 'ghij1234', 0)).toThrow(
          'patchSha must be a hex string of 4-64 characters'
        );
      });

      it('rejects invalid patchSha (uppercase hex)', () => {
        expect(() => createEventId(1, 'writer', 'ABCD1234', 0)).toThrow(
          'patchSha must be a hex string of 4-64 characters'
        );
      });

      it('rejects empty patchSha', () => {
        expect(() => createEventId(1, 'writer', '', 0)).toThrow(
          'patchSha must be a hex string of 4-64 characters'
        );
      });

      it('rejects null patchSha', () => {
        expect(() => createEventId(1, 'writer', null, 0)).toThrow(
          'patchSha must be a hex string of 4-64 characters'
        );
      });
    });

    describe('opIndex validation', () => {
      it('rejects negative opIndex', () => {
        expect(() => createEventId(1, 'writer', 'abcd1234', -1)).toThrow(
          'opIndex must be a non-negative integer'
        );
      });

      it('accepts zero opIndex', () => {
        const eventId = createEventId(1, 'writer', 'abcd1234', 0);

        expect(eventId.opIndex).toBe(0);
      });

      it('rejects non-integer opIndex', () => {
        expect(() => createEventId(1, 'writer', 'abcd1234', 1.5)).toThrow(
          'opIndex must be a non-negative integer'
        );
      });

      it('rejects NaN opIndex', () => {
        expect(() => createEventId(1, 'writer', 'abcd1234', NaN)).toThrow(
          'opIndex must be a non-negative integer'
        );
      });
    });
  });

  describe('compareEventIds', () => {
    it('returns -1 when a < b by lamport', () => {
      const a = createEventId(1, 'writer', 'abcd1234', 0);
      const b = createEventId(2, 'writer', 'abcd1234', 0);

      expect(compareEventIds(a, b)).toBe(-1);
    });

    it('returns 1 when a > b by lamport', () => {
      const a = createEventId(5, 'writer', 'abcd1234', 0);
      const b = createEventId(3, 'writer', 'abcd1234', 0);

      expect(compareEventIds(a, b)).toBe(1);
    });

    it('compares by writerId when lamport is equal', () => {
      const a = createEventId(1, 'alice', 'abcd1234', 0);
      const b = createEventId(1, 'bob', 'abcd1234', 0);

      expect(compareEventIds(a, b)).toBe(-1);
      expect(compareEventIds(b, a)).toBe(1);
    });

    it('compares by patchSha when lamport and writerId are equal', () => {
      const a = createEventId(1, 'writer', 'aaaa1234', 0);
      const b = createEventId(1, 'writer', 'bbbb1234', 0);

      expect(compareEventIds(a, b)).toBe(-1);
      expect(compareEventIds(b, a)).toBe(1);
    });

    it('compares by opIndex when lamport, writerId, and patchSha are equal', () => {
      const a = createEventId(1, 'writer', 'abcd1234', 0);
      const b = createEventId(1, 'writer', 'abcd1234', 1);

      expect(compareEventIds(a, b)).toBe(-1);
      expect(compareEventIds(b, a)).toBe(1);
    });

    it('returns 0 when fully equal', () => {
      const a = createEventId(1, 'writer', 'abcd1234', 0);
      const b = createEventId(1, 'writer', 'abcd1234', 0);

      expect(compareEventIds(a, b)).toBe(0);
    });

    it('compares writerId as string (not numerically)', () => {
      const a = createEventId(1, '10', 'abcd1234', 0);
      const b = createEventId(1, '9', 'abcd1234', 0);

      // String comparison: '10' < '9' because '1' < '9'
      expect(compareEventIds(a, b)).toBe(-1);
    });

    it('compares patchSha as string (not numerically)', () => {
      const a = createEventId(1, 'writer', '000a1234', 0);
      const b = createEventId(1, 'writer', '00091234', 0);

      // String comparison: '000a' > '0009' because 'a' > '9'
      expect(compareEventIds(a, b)).toBe(1);
    });
  });

  describe('isGreater', () => {
    it('returns true when a > b by lamport', () => {
      const a = createEventId(5, 'writer', 'abcd1234', 0);
      const b = createEventId(3, 'writer', 'abcd1234', 0);

      expect(isGreater(a, b)).toBe(true);
    });

    it('returns false when a < b', () => {
      const a = createEventId(1, 'writer', 'abcd1234', 0);
      const b = createEventId(2, 'writer', 'abcd1234', 0);

      expect(isGreater(a, b)).toBe(false);
    });

    it('returns false when a equals b', () => {
      const a = createEventId(1, 'writer', 'abcd1234', 0);
      const b = createEventId(1, 'writer', 'abcd1234', 0);

      expect(isGreater(a, b)).toBe(false);
    });

    it('returns true when a > b by writerId (lamport equal)', () => {
      const a = createEventId(1, 'zoe', 'abcd1234', 0);
      const b = createEventId(1, 'alice', 'abcd1234', 0);

      expect(isGreater(a, b)).toBe(true);
    });

    it('returns true when a > b by patchSha (lamport and writerId equal)', () => {
      const a = createEventId(1, 'writer', 'ffff1234', 0);
      const b = createEventId(1, 'writer', 'aaaa1234', 0);

      expect(isGreater(a, b)).toBe(true);
    });

    it('returns true when a > b by opIndex (all else equal)', () => {
      const a = createEventId(1, 'writer', 'abcd1234', 5);
      const b = createEventId(1, 'writer', 'abcd1234', 2);

      expect(isGreater(a, b)).toBe(true);
    });
  });

  describe('Array.sort() with compareEventIds', () => {
    it('produces correct order', () => {
      const events = [
        createEventId(2, 'bob', 'bbbb1234', 0),
        createEventId(1, 'alice', 'aaaa1234', 1),
        createEventId(1, 'alice', 'aaaa1234', 0),
        createEventId(3, 'charlie', 'cccc1234', 0),
        createEventId(1, 'bob', 'aaaa1234', 0),
      ];

      const sorted = [...events].sort(compareEventIds);

      expect(sorted).toEqual([
        createEventId(1, 'alice', 'aaaa1234', 0),
        createEventId(1, 'alice', 'aaaa1234', 1),
        createEventId(1, 'bob', 'aaaa1234', 0),
        createEventId(2, 'bob', 'bbbb1234', 0),
        createEventId(3, 'charlie', 'cccc1234', 0),
      ]);
    });

    it('sorts by all four fields in order', () => {
      const events = [
        createEventId(1, 'writer', 'abcd1234', 2),
        createEventId(1, 'writer', 'abcd1234', 0),
        createEventId(1, 'writer', 'abcd1234', 1),
      ];

      const sorted = [...events].sort(compareEventIds);

      expect(sorted.map((e) => e.opIndex)).toEqual([0, 1, 2]);
    });

    it('handles empty array', () => {
      /** @type {any[]} */
      const events = [];
      const sorted = [...events].sort(compareEventIds);

      expect(sorted).toEqual([]);
    });

    it('handles single element array', () => {
      const events = [createEventId(1, 'writer', 'abcd1234', 0)];
      const sorted = [...events].sort(compareEventIds);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toEqual(createEventId(1, 'writer', 'abcd1234', 0));
    });

    it('handles already sorted array', () => {
      const events = [
        createEventId(1, 'writer', 'abcd1234', 0),
        createEventId(2, 'writer', 'abcd1234', 0),
        createEventId(3, 'writer', 'abcd1234', 0),
      ];

      const sorted = [...events].sort(compareEventIds);

      expect(sorted).toEqual(events);
    });

    it('handles reverse sorted array', () => {
      const events = [
        createEventId(3, 'writer', 'abcd1234', 0),
        createEventId(2, 'writer', 'abcd1234', 0),
        createEventId(1, 'writer', 'abcd1234', 0),
      ];

      const sorted = [...events].sort(compareEventIds);

      expect(sorted.map((e) => e.lamport)).toEqual([1, 2, 3]);
    });

    it('maintains stability for equal elements', () => {
      // Note: JavaScript's Array.sort is stable since ES2019
      const a = createEventId(1, 'writer', 'abcd1234', 0);
      const b = createEventId(1, 'writer', 'abcd1234', 0);
      const events = [a, b];

      const sorted = events.sort(compareEventIds);

      // Since they're equal, original order should be preserved
      expect(sorted[0]).toBe(a);
      expect(sorted[1]).toBe(b);
    });
  });
});
