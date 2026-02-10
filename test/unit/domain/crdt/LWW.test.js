import { describe, it, expect } from 'vitest';
import { lwwSet, lwwMax as _lwwMax, lwwValue } from '../../../../src/domain/crdt/LWW.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';

/** @type {any} */
const lwwMax = _lwwMax;

describe('LWW Register', () => {
  describe('lwwSet', () => {
    it('creates register with eventId and value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, 'hello');

      expect(register).toEqual({
        eventId,
        value: 'hello',
      });
    });

    it('creates register with null value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, null);

      expect(register).toEqual({
        eventId,
        value: null,
      });
    });

    it('creates register with undefined value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, undefined);

      expect(register).toEqual({
        eventId,
        value: undefined,
      });
    });
  });

  describe('lwwMax', () => {
    it('returns register with greater EventId (by lamport)', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId1, 'old');
      const b = lwwSet(eventId2, 'new');

      const result = lwwMax(a, b);

      expect(result).toBe(b);
      expect(result.value).toBe('new');
    });

    it('returns register with greater EventId (by writerId)', () => {
      const eventId1 = createEventId(1, 'alice', 'abcd1234', 0);
      const eventId2 = createEventId(1, 'bob', 'abcd1234', 0);
      const a = lwwSet(eventId1, 'alice-value');
      const b = lwwSet(eventId2, 'bob-value');

      const result = lwwMax(a, b);

      expect(result).toBe(b);
      expect(result.value).toBe('bob-value');
    });

    it('returns register with greater EventId (by patchSha)', () => {
      const eventId1 = createEventId(1, 'writer', 'aaaa1234', 0);
      const eventId2 = createEventId(1, 'writer', 'bbbb1234', 0);
      const a = lwwSet(eventId1, 'first');
      const b = lwwSet(eventId2, 'second');

      const result = lwwMax(a, b);

      expect(result).toBe(b);
      expect(result.value).toBe('second');
    });

    it('returns register with greater EventId (by opIndex)', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(1, 'writer', 'abcd1234', 1);
      const a = lwwSet(eventId1, 'op0');
      const b = lwwSet(eventId2, 'op1');

      const result = lwwMax(a, b);

      expect(result).toBe(b);
      expect(result.value).toBe('op1');
    });

    it('is commutative (swap args, same winner)', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(5, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId1, 'loser');
      const b = lwwSet(eventId2, 'winner');

      const result1 = lwwMax(a, b);
      const result2 = lwwMax(b, a);

      // Same winner regardless of argument order
      expect(result1).toBe(b);
      expect(result2).toBe(b);
      expect(result1.value).toBe(result2.value);
    });

    it('handles null first arg', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const b = lwwSet(eventId, 'value');

      const result = lwwMax(null, b);

      expect(result).toBe(b);
    });

    it('handles undefined first arg', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const b = lwwSet(eventId, 'value');

      const result = lwwMax(undefined, b);

      expect(result).toBe(b);
    });

    it('handles null second arg', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId, 'value');

      const result = lwwMax(a, null);

      expect(result).toBe(a);
    });

    it('handles undefined second arg', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId, 'value');

      const result = lwwMax(a, undefined);

      expect(result).toBe(a);
    });

    it('handles both null', () => {
      const result = lwwMax(null, null);

      expect(result).toBeNull();
    });

    it('handles both undefined', () => {
      const result = lwwMax(undefined, undefined);

      expect(result).toBeNull();
    });

    it('handles null and undefined mixed', () => {
      expect(lwwMax(null, undefined)).toBeNull();
      expect(lwwMax(undefined, null)).toBeNull();
    });

    it('with equal EventIds returns first arg (deterministic tie-break)', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(1, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId1, 'first');
      const b = lwwSet(eventId2, 'second');

      const result = lwwMax(a, b);

      // First argument wins on tie
      expect(result).toBe(a);
      expect(result.value).toBe('first');
    });

    it('is idempotent (same register twice)', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId, 'value');

      const result = lwwMax(a, a);

      expect(result).toBe(a);
    });

    it('is associative', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
      const eventId3 = createEventId(3, 'writer', 'abcd1234', 0);
      const a = lwwSet(eventId1, 'a');
      const b = lwwSet(eventId2, 'b');
      const c = lwwSet(eventId3, 'c');

      // (a max b) max c
      const left = lwwMax(lwwMax(a, b), c);
      // a max (b max c)
      const right = lwwMax(a, lwwMax(b, c));

      // Both should produce c (the one with highest lamport)
      expect(left).toBe(c);
      expect(right).toBe(c);
    });
  });

  describe('lwwValue', () => {
    it('extracts value from register', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, 'hello');

      expect(lwwValue(register)).toBe('hello');
    });

    it('returns undefined for null register', () => {
      expect(lwwValue(null)).toBeUndefined();
    });

    it('returns undefined for undefined register', () => {
      expect(lwwValue(undefined)).toBeUndefined();
    });

    it('returns null when value is null', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, null);

      expect(lwwValue(register)).toBeNull();
    });

    it('returns undefined when value is undefined', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, undefined);

      expect(lwwValue(register)).toBeUndefined();
    });
  });

  describe('works with boolean values (for node_alive, edge_alive)', () => {
    it('stores true value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, true);

      expect(lwwValue(register)).toBe(true);
    });

    it('stores false value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, false);

      expect(lwwValue(register)).toBe(false);
    });

    it('lwwMax selects correct boolean based on EventId', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
      const alive = lwwSet(eventId1, true);
      const deleted = lwwSet(eventId2, false);

      // Deletion wins because it has higher lamport
      expect(lwwValue(lwwMax(alive, deleted))).toBe(false);
      expect(lwwValue(lwwMax(deleted, alive))).toBe(false);
    });

    it('resurrection scenario - later true overrides earlier false', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
      const deleted = lwwSet(eventId1, false);
      const resurrected = lwwSet(eventId2, true);

      // Resurrection wins because it has higher lamport
      expect(lwwValue(lwwMax(deleted, resurrected))).toBe(true);
    });
  });

  describe('works with object values (for ValueRef in props)', () => {
    it('stores object value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const valueRef = { type: 'string', value: 'hello' };
      const register = lwwSet(eventId, valueRef);

      expect(lwwValue(register)).toEqual({ type: 'string', value: 'hello' });
    });

    it('lwwMax selects correct object based on EventId', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
      const old = lwwSet(eventId1, { type: 'string', value: 'old' });
      const newer = lwwSet(eventId2, { type: 'string', value: 'new' });

      const result = lwwMax(old, newer);

      expect(lwwValue(result)).toEqual({ type: 'string', value: 'new' });
    });

    it('stores complex nested object', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const complexValue = {
        type: 'object',
        nested: {
          array: [1, 2, 3],
          boolean: true,
          null: null,
        },
      };
      const register = lwwSet(eventId, complexValue);

      expect(lwwValue(register)).toEqual(complexValue);
    });
  });

  describe('edge cases', () => {
    it('works with number values', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, 42);

      expect(lwwValue(register)).toBe(42);
    });

    it('works with zero value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, 0);

      expect(lwwValue(register)).toBe(0);
    });

    it('works with empty string value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, '');

      expect(lwwValue(register)).toBe('');
    });

    it('works with array value', () => {
      const eventId = createEventId(1, 'writer', 'abcd1234', 0);
      const register = lwwSet(eventId, [1, 2, 3]);

      expect(lwwValue(register)).toEqual([1, 2, 3]);
    });

    it('preserves object reference identity in lwwMax', () => {
      const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
      const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const a = lwwSet(eventId1, obj1);
      const b = lwwSet(eventId2, obj2);

      const result = lwwMax(a, b);

      // Should be exact same object reference, not a copy
      expect(lwwValue(result)).toBe(obj2);
    });
  });
});
