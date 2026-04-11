import { describe, it, expect } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';

/** @type {any} */

describe('VersionVector', () => {
  describe('createVersionVector', () => {
    it('creates an empty version vector', () => {
      const vv = VersionVector.empty();

      expect(vv).toBeInstanceOf(VersionVector);
      expect(vv.size).toBe(0);
    });
  });

  describe('vvIncrement', () => {
    it('increments counter for new writer', () => {
      const vv = VersionVector.empty();

      const dot = vv.increment('alice');

      expect(dot).toEqual({ writerId: 'alice', counter: 1 });
      expect(vv.get('alice')).toBe(1);
    });

    it('increments counter for existing writer', () => {
      const vv = VersionVector.empty();
      vv.increment('alice');
      vv.increment('alice');

      const dot = vv.increment('alice');

      expect(dot).toEqual({ writerId: 'alice', counter: 3 });
      expect(vv.get('alice')).toBe(3);
    });

    it('maintains separate counters per writer', () => {
      const vv = VersionVector.empty();

      vv.increment('alice');
      vv.increment('alice');
      vv.increment('bob');

      expect(vv.get('alice')).toBe(2);
      expect(vv.get('bob')).toBe(1);
    });

    it('mutates the version vector', () => {
      const vv = VersionVector.empty();

      vv.increment('alice');

      expect(vv.size).toBe(1);
    });

    it('returns a valid Dot', () => {
      const vv = VersionVector.empty();

      const dot = vv.increment('alice');

      expect(dot.writerId).toBe('alice');
      expect(dot.counter).toBe(1);
    });
  });

  describe('vvMerge', () => {
    it('merges empty vectors', () => {
      const a = VersionVector.empty();
      const b = VersionVector.empty();

      const result = a.merge(b);

      expect(result.size).toBe(0);
    });

    it('merges with empty vector', () => {
      const a = VersionVector.empty();
      a.increment('alice');
      const b = VersionVector.empty();

      const result = a.merge(b);

      expect(result.get('alice')).toBe(1);
    });

    it('takes pointwise maximum', () => {
      const a = VersionVector.empty();
      a.set('alice', 3);
      a.set('bob', 2);

      const b = VersionVector.empty();
      b.set('alice', 1);
      b.set('bob', 5);
      b.set('charlie', 1);

      const result = a.merge(b);

      expect(result.get('alice')).toBe(3);
      expect(result.get('bob')).toBe(5);
      expect(result.get('charlie')).toBe(1);
    });

    it('does not mutate inputs', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);
      const b = VersionVector.empty();
      b.set('bob', 2);

      a.merge(b);

      expect(a.size).toBe(1);
      expect(a.get('alice')).toBe(1);
      expect(a.has('bob')).toBe(false);
    });

    it('is commutative', () => {
      const a = VersionVector.empty();
      a.set('alice', 3);
      a.set('bob', 2);

      const b = VersionVector.empty();
      b.set('alice', 1);
      b.set('charlie', 5);

      const ab = a.merge(b);
      const ba = b.merge(a);

      expect(ab.equals(ba)).toBe(true);
    });

    it('is associative', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);

      const b = VersionVector.empty();
      b.set('bob', 2);

      const c = VersionVector.empty();
      c.set('charlie', 3);

      const ab_c = a.merge(b).merge(c);
      const a_bc = a.merge(b.merge(c));

      expect(ab_c.equals(a_bc)).toBe(true);
    });

    it('is idempotent', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);
      a.set('bob', 2);

      const result = a.merge(a);

      expect(result.equals(a)).toBe(true);
    });
  });

  describe('vvDescends', () => {
    it('empty vector descends from empty vector', () => {
      const a = VersionVector.empty();
      const b = VersionVector.empty();

      expect(a.descends(b)).toBe(true);
    });

    it('non-empty vector descends from empty vector', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);
      const b = VersionVector.empty();

      expect(a.descends(b)).toBe(true);
    });

    it('empty vector does not descend from non-empty vector', () => {
      const a = VersionVector.empty();
      const b = VersionVector.empty();
      b.set('alice', 1);

      expect(a.descends(b)).toBe(false);
    });

    it('vector with equal values descends', () => {
      const a = VersionVector.empty();
      a.set('alice', 2);

      const b = VersionVector.empty();
      b.set('alice', 2);

      expect(a.descends(b)).toBe(true);
    });

    it('vector with greater value descends', () => {
      const a = VersionVector.empty();
      a.set('alice', 3);

      const b = VersionVector.empty();
      b.set('alice', 2);

      expect(a.descends(b)).toBe(true);
    });

    it('vector with lesser value does not descend', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);

      const b = VersionVector.empty();
      b.set('alice', 2);

      expect(a.descends(b)).toBe(false);
    });

    it('concurrent vectors neither descends from other', () => {
      const a = VersionVector.empty();
      a.set('alice', 2);
      a.set('bob', 1);

      const b = VersionVector.empty();
      b.set('alice', 1);
      b.set('bob', 2);

      expect(a.descends(b)).toBe(false);
      expect(b.descends(a)).toBe(false);
    });

    it('merged vector descends from both', () => {
      const a = VersionVector.empty();
      a.set('alice', 2);

      const b = VersionVector.empty();
      b.set('bob', 3);

      const merged = a.merge(b);

      expect(merged.descends(a)).toBe(true);
      expect(merged.descends(b)).toBe(true);
    });
  });

  describe('vvContains', () => {
    it('empty vector does not contain any dot', () => {
      const vv = VersionVector.empty();
      const dot = Dot.create('alice', 1);

      expect(vv.contains(dot)).toBe(false);
    });

    it('contains dot with matching counter', () => {
      const vv = VersionVector.empty();
      vv.set('alice', 2);
      const dot = Dot.create('alice', 2);

      expect(vv.contains(dot)).toBe(true);
    });

    it('contains dot with smaller counter', () => {
      const vv = VersionVector.empty();
      vv.set('alice', 5);
      const dot = Dot.create('alice', 3);

      expect(vv.contains(dot)).toBe(true);
    });

    it('does not contain dot with larger counter', () => {
      const vv = VersionVector.empty();
      vv.set('alice', 2);
      const dot = Dot.create('alice', 3);

      expect(vv.contains(dot)).toBe(false);
    });

    it('does not contain dot for unknown writer', () => {
      const vv = VersionVector.empty();
      vv.set('alice', 2);
      const dot = Dot.create('bob', 1);

      expect(vv.contains(dot)).toBe(false);
    });
  });

  describe('vvSerialize / vvDeserialize', () => {
    it('serializes empty vector', () => {
      const vv = VersionVector.empty();

      const obj = VersionVector.serialize(vv);

      expect(obj).toEqual({});
    });

    it('serializes vector with entries', () => {
      const vv = VersionVector.empty();
      vv.set('alice', 3);
      vv.set('bob', 2);

      const obj = VersionVector.serialize(vv);

      expect(obj).toEqual({
        alice: 3,
        bob: 2,
      });
    });

    it('serializes with sorted keys', () => {
      const vv = VersionVector.empty();
      vv.set('charlie', 1);
      vv.set('alice', 2);
      vv.set('bob', 3);

      const obj = VersionVector.serialize(vv);
      const keys = Object.keys(obj);

      expect(keys).toEqual(['alice', 'bob', 'charlie']);
    });

    it('deserializes empty object', () => {
      const obj = {};

      const vv = VersionVector.from(obj);

      expect(vv.size).toBe(0);
    });

    it('deserializes object with entries', () => {
      const obj = {
        alice: 3,
        bob: 2,
      };

      const vv = VersionVector.from(obj);

      expect(vv.get('alice')).toBe(3);
      expect(vv.get('bob')).toBe(2);
    });

    it('skips zero counters during deserialization', () => {
      const obj = {
        alice: 3,
        bob: 0,
      };

      const vv = VersionVector.from(obj);

      expect(vv.get('alice')).toBe(3);
      expect(vv.has('bob')).toBe(false);
    });

    it('throws on invalid counter', () => {
      expect(() => VersionVector.from({ alice: 'not a number' })).toThrow('Invalid counter');
      expect(() => VersionVector.from({ alice: 1.5 })).toThrow('Invalid counter');
      expect(() => VersionVector.from({ alice: -1 })).toThrow('Invalid counter');
    });

    it('roundtrips', () => {
      const original = VersionVector.empty();
      original.set('alice', 3);
      original.set('bob', 2);

      const serialized = VersionVector.serialize(original);
      const deserialized = VersionVector.from(serialized);

      expect(original.equals(deserialized)).toBe(true);
    });
  });

  describe('vvClone', () => {
    it('creates a copy', () => {
      const original = VersionVector.empty();
      original.set('alice', 1);

      const clone = original.clone();

      expect(original.equals(clone)).toBe(true);
    });

    it('clone is independent from original', () => {
      const original = VersionVector.empty();
      original.set('alice', 1);

      const clone = original.clone();
      clone.set('alice', 2);

      expect(original.get('alice')).toBe(1);
      expect(clone.get('alice')).toBe(2);
    });
  });

  describe('vvEqual', () => {
    it('empty vectors are equal', () => {
      const a = VersionVector.empty();
      const b = VersionVector.empty();

      expect(a.equals(b)).toBe(true);
    });

    it('equal vectors are equal', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);

      const b = VersionVector.empty();
      b.set('alice', 1);

      expect(a.equals(b)).toBe(true);
    });

    it('vectors with different sizes are not equal', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);

      const b = VersionVector.empty();
      b.set('alice', 1);
      b.set('bob', 1);

      expect(a.equals(b)).toBe(false);
    });

    it('vectors with different values are not equal', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);

      const b = VersionVector.empty();
      b.set('alice', 2);

      expect(a.equals(b)).toBe(false);
    });

    it('vectors with different keys are not equal', () => {
      const a = VersionVector.empty();
      a.set('alice', 1);

      const b = VersionVector.empty();
      b.set('bob', 1);

      expect(a.equals(b)).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('simulates two writers merging', () => {
      const alice = VersionVector.empty();
      const bob = VersionVector.empty();

      // Alice does two operations
      alice.increment('alice');
      alice.increment('alice');

      // Bob does one operation
      bob.increment('bob');

      // Bob receives Alice's state
      const bobMerged = bob.merge(alice);

      // Bob continues with merged state
      const dot = bobMerged.increment('bob');

      expect(dot).toEqual({ writerId: 'bob', counter: 2 });
      expect(bobMerged.get('alice')).toBe(2);
      expect(bobMerged.get('bob')).toBe(2);
    });

    it('tracks causality correctly', () => {
      const writer = VersionVector.empty();

      // Dot 1 is created
      const dot1 = writer.increment('writer');

      // At this point, dot1 is contained
      expect(writer.contains(dot1)).toBe(true);

      // But dot 2 doesn't exist yet
      const futureDot = Dot.create('writer', 2);
      expect(writer.contains(futureDot)).toBe(false);

      // Now create dot 2
      const dot2 = writer.increment('writer');
      expect(writer.contains(dot2)).toBe(true);
      expect(writer.contains(futureDot)).toBe(true);
    });
  });
});
