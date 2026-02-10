import { describe, it, expect } from 'vitest';
import {
  createVersionVector,
  vvIncrement,
  vvMerge,
  vvDescends,
  vvContains,
  vvSerialize,
  vvDeserialize as _vvDeserialize,
  vvClone,
  vvEqual,
} from '../../../../src/domain/crdt/VersionVector.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';

/** @type {any} */
const vvDeserialize = _vvDeserialize;

describe('VersionVector', () => {
  describe('createVersionVector', () => {
    it('creates an empty version vector', () => {
      const vv = createVersionVector();

      expect(vv).toBeInstanceOf(Map);
      expect(vv.size).toBe(0);
    });
  });

  describe('vvIncrement', () => {
    it('increments counter for new writer', () => {
      const vv = createVersionVector();

      const dot = vvIncrement(vv, 'alice');

      expect(dot).toEqual({ writerId: 'alice', counter: 1 });
      expect(vv.get('alice')).toBe(1);
    });

    it('increments counter for existing writer', () => {
      const vv = createVersionVector();
      vvIncrement(vv, 'alice');
      vvIncrement(vv, 'alice');

      const dot = vvIncrement(vv, 'alice');

      expect(dot).toEqual({ writerId: 'alice', counter: 3 });
      expect(vv.get('alice')).toBe(3);
    });

    it('maintains separate counters per writer', () => {
      const vv = createVersionVector();

      vvIncrement(vv, 'alice');
      vvIncrement(vv, 'alice');
      vvIncrement(vv, 'bob');

      expect(vv.get('alice')).toBe(2);
      expect(vv.get('bob')).toBe(1);
    });

    it('mutates the version vector', () => {
      const vv = createVersionVector();

      vvIncrement(vv, 'alice');

      expect(vv.size).toBe(1);
    });

    it('returns a valid Dot', () => {
      const vv = createVersionVector();

      const dot = vvIncrement(vv, 'alice');

      expect(dot.writerId).toBe('alice');
      expect(dot.counter).toBe(1);
    });
  });

  describe('vvMerge', () => {
    it('merges empty vectors', () => {
      const a = createVersionVector();
      const b = createVersionVector();

      const result = vvMerge(a, b);

      expect(result.size).toBe(0);
    });

    it('merges with empty vector', () => {
      const a = createVersionVector();
      vvIncrement(a, 'alice');
      const b = createVersionVector();

      const result = vvMerge(a, b);

      expect(result.get('alice')).toBe(1);
    });

    it('takes pointwise maximum', () => {
      const a = createVersionVector();
      a.set('alice', 3);
      a.set('bob', 2);

      const b = createVersionVector();
      b.set('alice', 1);
      b.set('bob', 5);
      b.set('charlie', 1);

      const result = vvMerge(a, b);

      expect(result.get('alice')).toBe(3);
      expect(result.get('bob')).toBe(5);
      expect(result.get('charlie')).toBe(1);
    });

    it('does not mutate inputs', () => {
      const a = createVersionVector();
      a.set('alice', 1);
      const b = createVersionVector();
      b.set('bob', 2);

      vvMerge(a, b);

      expect(a.size).toBe(1);
      expect(a.get('alice')).toBe(1);
      expect(a.has('bob')).toBe(false);
    });

    it('is commutative', () => {
      const a = createVersionVector();
      a.set('alice', 3);
      a.set('bob', 2);

      const b = createVersionVector();
      b.set('alice', 1);
      b.set('charlie', 5);

      const ab = vvMerge(a, b);
      const ba = vvMerge(b, a);

      expect(vvEqual(ab, ba)).toBe(true);
    });

    it('is associative', () => {
      const a = createVersionVector();
      a.set('alice', 1);

      const b = createVersionVector();
      b.set('bob', 2);

      const c = createVersionVector();
      c.set('charlie', 3);

      const ab_c = vvMerge(vvMerge(a, b), c);
      const a_bc = vvMerge(a, vvMerge(b, c));

      expect(vvEqual(ab_c, a_bc)).toBe(true);
    });

    it('is idempotent', () => {
      const a = createVersionVector();
      a.set('alice', 1);
      a.set('bob', 2);

      const result = vvMerge(a, a);

      expect(vvEqual(result, a)).toBe(true);
    });
  });

  describe('vvDescends', () => {
    it('empty vector descends from empty vector', () => {
      const a = createVersionVector();
      const b = createVersionVector();

      expect(vvDescends(a, b)).toBe(true);
    });

    it('non-empty vector descends from empty vector', () => {
      const a = createVersionVector();
      a.set('alice', 1);
      const b = createVersionVector();

      expect(vvDescends(a, b)).toBe(true);
    });

    it('empty vector does not descend from non-empty vector', () => {
      const a = createVersionVector();
      const b = createVersionVector();
      b.set('alice', 1);

      expect(vvDescends(a, b)).toBe(false);
    });

    it('vector with equal values descends', () => {
      const a = createVersionVector();
      a.set('alice', 2);

      const b = createVersionVector();
      b.set('alice', 2);

      expect(vvDescends(a, b)).toBe(true);
    });

    it('vector with greater value descends', () => {
      const a = createVersionVector();
      a.set('alice', 3);

      const b = createVersionVector();
      b.set('alice', 2);

      expect(vvDescends(a, b)).toBe(true);
    });

    it('vector with lesser value does not descend', () => {
      const a = createVersionVector();
      a.set('alice', 1);

      const b = createVersionVector();
      b.set('alice', 2);

      expect(vvDescends(a, b)).toBe(false);
    });

    it('concurrent vectors neither descends from other', () => {
      const a = createVersionVector();
      a.set('alice', 2);
      a.set('bob', 1);

      const b = createVersionVector();
      b.set('alice', 1);
      b.set('bob', 2);

      expect(vvDescends(a, b)).toBe(false);
      expect(vvDescends(b, a)).toBe(false);
    });

    it('merged vector descends from both', () => {
      const a = createVersionVector();
      a.set('alice', 2);

      const b = createVersionVector();
      b.set('bob', 3);

      const merged = vvMerge(a, b);

      expect(vvDescends(merged, a)).toBe(true);
      expect(vvDescends(merged, b)).toBe(true);
    });
  });

  describe('vvContains', () => {
    it('empty vector does not contain any dot', () => {
      const vv = createVersionVector();
      const dot = createDot('alice', 1);

      expect(vvContains(vv, dot)).toBe(false);
    });

    it('contains dot with matching counter', () => {
      const vv = createVersionVector();
      vv.set('alice', 2);
      const dot = createDot('alice', 2);

      expect(vvContains(vv, dot)).toBe(true);
    });

    it('contains dot with smaller counter', () => {
      const vv = createVersionVector();
      vv.set('alice', 5);
      const dot = createDot('alice', 3);

      expect(vvContains(vv, dot)).toBe(true);
    });

    it('does not contain dot with larger counter', () => {
      const vv = createVersionVector();
      vv.set('alice', 2);
      const dot = createDot('alice', 3);

      expect(vvContains(vv, dot)).toBe(false);
    });

    it('does not contain dot for unknown writer', () => {
      const vv = createVersionVector();
      vv.set('alice', 2);
      const dot = createDot('bob', 1);

      expect(vvContains(vv, dot)).toBe(false);
    });
  });

  describe('vvSerialize / vvDeserialize', () => {
    it('serializes empty vector', () => {
      const vv = createVersionVector();

      const obj = vvSerialize(vv);

      expect(obj).toEqual({});
    });

    it('serializes vector with entries', () => {
      const vv = createVersionVector();
      vv.set('alice', 3);
      vv.set('bob', 2);

      const obj = vvSerialize(vv);

      expect(obj).toEqual({
        alice: 3,
        bob: 2,
      });
    });

    it('serializes with sorted keys', () => {
      const vv = createVersionVector();
      vv.set('charlie', 1);
      vv.set('alice', 2);
      vv.set('bob', 3);

      const obj = vvSerialize(vv);
      const keys = Object.keys(obj);

      expect(keys).toEqual(['alice', 'bob', 'charlie']);
    });

    it('deserializes empty object', () => {
      const obj = {};

      const vv = vvDeserialize(obj);

      expect(vv.size).toBe(0);
    });

    it('deserializes object with entries', () => {
      const obj = {
        alice: 3,
        bob: 2,
      };

      const vv = vvDeserialize(obj);

      expect(vv.get('alice')).toBe(3);
      expect(vv.get('bob')).toBe(2);
    });

    it('skips zero counters during deserialization', () => {
      const obj = {
        alice: 3,
        bob: 0,
      };

      const vv = vvDeserialize(obj);

      expect(vv.get('alice')).toBe(3);
      expect(vv.has('bob')).toBe(false);
    });

    it('throws on invalid counter', () => {
      expect(() => vvDeserialize({ alice: 'not a number' })).toThrow('Invalid counter');
      expect(() => vvDeserialize({ alice: 1.5 })).toThrow('Invalid counter');
      expect(() => vvDeserialize({ alice: -1 })).toThrow('Invalid counter');
    });

    it('roundtrips', () => {
      const original = createVersionVector();
      original.set('alice', 3);
      original.set('bob', 2);

      const serialized = vvSerialize(original);
      const deserialized = vvDeserialize(serialized);

      expect(vvEqual(original, deserialized)).toBe(true);
    });
  });

  describe('vvClone', () => {
    it('creates a copy', () => {
      const original = createVersionVector();
      original.set('alice', 1);

      const clone = vvClone(original);

      expect(vvEqual(original, clone)).toBe(true);
    });

    it('clone is independent from original', () => {
      const original = createVersionVector();
      original.set('alice', 1);

      const clone = vvClone(original);
      clone.set('alice', 2);

      expect(original.get('alice')).toBe(1);
      expect(clone.get('alice')).toBe(2);
    });
  });

  describe('vvEqual', () => {
    it('empty vectors are equal', () => {
      const a = createVersionVector();
      const b = createVersionVector();

      expect(vvEqual(a, b)).toBe(true);
    });

    it('equal vectors are equal', () => {
      const a = createVersionVector();
      a.set('alice', 1);

      const b = createVersionVector();
      b.set('alice', 1);

      expect(vvEqual(a, b)).toBe(true);
    });

    it('vectors with different sizes are not equal', () => {
      const a = createVersionVector();
      a.set('alice', 1);

      const b = createVersionVector();
      b.set('alice', 1);
      b.set('bob', 1);

      expect(vvEqual(a, b)).toBe(false);
    });

    it('vectors with different values are not equal', () => {
      const a = createVersionVector();
      a.set('alice', 1);

      const b = createVersionVector();
      b.set('alice', 2);

      expect(vvEqual(a, b)).toBe(false);
    });

    it('vectors with different keys are not equal', () => {
      const a = createVersionVector();
      a.set('alice', 1);

      const b = createVersionVector();
      b.set('bob', 1);

      expect(vvEqual(a, b)).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('simulates two writers merging', () => {
      const alice = createVersionVector();
      const bob = createVersionVector();

      // Alice does two operations
      vvIncrement(alice, 'alice');
      vvIncrement(alice, 'alice');

      // Bob does one operation
      vvIncrement(bob, 'bob');

      // Bob receives Alice's state
      const bobMerged = vvMerge(bob, alice);

      // Bob continues with merged state
      const dot = vvIncrement(bobMerged, 'bob');

      expect(dot).toEqual({ writerId: 'bob', counter: 2 });
      expect(bobMerged.get('alice')).toBe(2);
      expect(bobMerged.get('bob')).toBe(2);
    });

    it('tracks causality correctly', () => {
      const writer = createVersionVector();

      // Dot 1 is created
      const dot1 = vvIncrement(writer, 'writer');

      // At this point, dot1 is contained
      expect(vvContains(writer, dot1)).toBe(true);

      // But dot 2 doesn't exist yet
      const futureDot = createDot('writer', 2);
      expect(vvContains(writer, futureDot)).toBe(false);

      // Now create dot 2
      const dot2 = vvIncrement(writer, 'writer');
      expect(vvContains(writer, dot2)).toBe(true);
      expect(vvContains(writer, futureDot)).toBe(true);
    });
  });
});
