import { describe, it, expect } from 'vitest';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';

/** @param {Map<any, any>} map @param {any} key @returns {any} */
const getEntry = (map, key) => map.get(key);

describe('ORSet', () => {
  describe('createORSet', () => {
    it('creates empty ORSet', () => {
      const set = ORSet.empty();

      expect(set.entries).toBeInstanceOf(Map);
      expect(set.entries.size).toBe(0);
      expect(set.tombstones).toBeInstanceOf(Set);
      expect(set.tombstones.size).toBe(0);
    });
  });

  describe('orsetAdd', () => {
    it('adds element with dot', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);

      expect(set.entries.has('element1')).toBe(true);
      expect(getEntry(set.entries,'element1').has(encodeDot(dot))).toBe(true);
    });

    it('adds multiple dots to same element', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      set.add('element1', dot1);
      set.add('element1', dot2);

      expect(getEntry(set.entries,'element1').size).toBe(2);
      expect(getEntry(set.entries,'element1').has(encodeDot(dot1))).toBe(true);
      expect(getEntry(set.entries,'element1').has(encodeDot(dot2))).toBe(true);
    });

    it('adds same dot twice (idempotent)', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.add('element1', dot);

      expect(getEntry(set.entries,'element1').size).toBe(1);
    });

    it('adds different elements', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      set.add('element1', dot1);
      set.add('element2', dot2);

      expect(set.entries.size).toBe(2);
    });
  });

  describe('orsetRemove', () => {
    it('adds observed dots to tombstones', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);
      const encodedDot = encodeDot(dot);

      set.add('element1', dot);
      set.remove(new Set([encodedDot]));

      expect(set.tombstones.has(encodedDot)).toBe(true);
    });

    it('adds multiple dots to tombstones', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      set.add('element1', dot1);
      set.add('element1', dot2);
      set.remove(new Set([encodeDot(dot1), encodeDot(dot2)]));

      expect(set.tombstones.size).toBe(2);
    });

    it('removes with empty observedDots does nothing', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.remove(new Set());

      expect(set.tombstones.size).toBe(0);
    });
  });

  describe('orsetContains', () => {
    it('returns true for element with non-tombstoned dot', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);

      expect(set.contains('element1')).toBe(true);
    });

    it('returns false for element with all dots tombstoned', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.remove(new Set([encodeDot(dot)]));

      expect(set.contains('element1')).toBe(false);
    });

    it('returns true if at least one dot is not tombstoned', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      set.add('element1', dot1);
      set.add('element1', dot2);
      set.remove(new Set([encodeDot(dot1)]));

      expect(set.contains('element1')).toBe(true);
    });

    it('returns false for non-existent element', () => {
      const set = ORSet.empty();

      expect(set.contains('nonexistent')).toBe(false);
    });
  });

  describe('orsetElements', () => {
    it('returns empty array for empty set', () => {
      const set = ORSet.empty();

      expect(set.elements()).toEqual([]);
    });

    it('returns only present elements', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      set.add('element1', dot1);
      set.add('element2', dot2);
      set.remove(new Set([encodeDot(dot1)]));

      const elements = set.elements();
      expect(elements).toContain('element2');
      expect(elements).not.toContain('element1');
      expect(elements.length).toBe(1);
    });

    it('returns all present elements', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);
      const dot3 = createDot('writer1', 3);

      set.add('a', dot1);
      set.add('b', dot2);
      set.add('c', dot3);

      const elements = set.elements();
      expect(elements.length).toBe(3);
      expect(elements).toContain('a');
      expect(elements).toContain('b');
      expect(elements).toContain('c');
    });
  });

  describe('orsetGetDots', () => {
    it('returns non-tombstoned dots for element', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      set.add('element1', dot1);
      set.add('element1', dot2);
      set.remove(new Set([encodeDot(dot1)]));

      const dots = set.getDots('element1');
      expect(dots.size).toBe(1);
      expect(dots.has(encodeDot(dot2))).toBe(true);
      expect(dots.has(encodeDot(dot1))).toBe(false);
    });

    it('returns empty set for non-existent element', () => {
      const set = ORSet.empty();

      const dots = set.getDots('nonexistent');
      expect(dots.size).toBe(0);
    });

    it('returns empty set if all dots tombstoned', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.remove(new Set([encodeDot(dot)]));

      const dots = set.getDots('element1');
      expect(dots.size).toBe(0);
    });
  });

  describe('orsetJoin - Lattice Properties', () => {
    it('commutativity: a.join(b) equals b.join(a)', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      a.add('element1', dot1);
      b.add('element2', dot2);
      a.remove(new Set([encodeDot(dot1)]));

      const ab = a.join(b);
      const ba = b.join(a);

      // Same elements
      expect(ab.elements().sort()).toEqual(ba.elements().sort());

      // Same tombstones
      expect([...ab.tombstones].sort()).toEqual([...ba.tombstones].sort());

      // Same entries structure
      expect(ab.entries.size).toBe(ba.entries.size);
      for (const [element, dots] of ab.entries) {
        expect(ba.entries.has(element)).toBe(true);
        expect([...dots].sort()).toEqual([...getEntry(ba.entries, element)].sort());
      }
    });

    it('associativity: orsetJoin(a.join(b), c) equals a.join(orsetJoin(b, c))', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const c = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);
      const dot3 = createDot('writer3', 1);

      a.add('element1', dot1);
      b.add('element2', dot2);
      c.add('element3', dot3);
      b.remove(new Set([encodeDot(dot2)]));

      const left = a.join(b).join(c);
      const right = a.join(b.join(c));

      // Same elements
      expect(left.elements().sort()).toEqual(right.elements().sort());

      // Same tombstones
      expect([...left.tombstones].sort()).toEqual([...right.tombstones].sort());

      // Same entries structure
      expect(left.entries.size).toBe(right.entries.size);
      for (const [element, dots] of left.entries) {
        expect(right.entries.has(element)).toBe(true);
        expect([...dots].sort()).toEqual([...getEntry(right.entries, element)].sort());
      }
    });

    it('idempotence: a.join(a) equals a', () => {
      const a = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      a.add('element1', dot1);
      a.add('element2', dot2);
      a.remove(new Set([encodeDot(dot1)]));

      const result = a.join(a);

      // Same elements
      expect(result.elements().sort()).toEqual(a.elements().sort());

      // Same tombstones
      expect([...result.tombstones].sort()).toEqual([...a.tombstones].sort());

      // Same entries structure
      expect(result.entries.size).toBe(a.entries.size);
      for (const [element, dots] of result.entries) {
        expect(a.entries.has(element)).toBe(true);
        expect([...dots].sort()).toEqual([...getEntry(a.entries, element)].sort());
      }
    });
  });

  describe('orsetJoin - Union Semantics', () => {
    it('unions entries from both sets', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      a.add('element1', dot1);
      b.add('element2', dot2);

      const result = a.join(b);

      expect(result.contains('element1')).toBe(true);
      expect(result.contains('element2')).toBe(true);
    });

    it('unions dots for same element', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      a.add('element1', dot1);
      b.add('element1', dot2);

      const result = a.join(b);

      expect(getEntry(result.entries, 'element1').size).toBe(2);
    });

    it('unions tombstones', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      a.add('element1', dot1);
      b.add('element2', dot2);
      a.remove(new Set([encodeDot(dot1)]));
      b.remove(new Set([encodeDot(dot2)]));

      const result = a.join(b);

      expect(result.tombstones.size).toBe(2);
      expect(result.tombstones.has(encodeDot(dot1))).toBe(true);
      expect(result.tombstones.has(encodeDot(dot2))).toBe(true);
    });

    it('does not mutate input sets', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      a.add('element1', dot1);
      b.add('element2', dot2);

      const aEntriesBefore = a.entries.size;
      const bEntriesBefore = b.entries.size;

      a.join(b);

      expect(a.entries.size).toBe(aEntriesBefore);
      expect(b.entries.size).toBe(bEntriesBefore);
    });
  });

  describe('OR-Set Semantics', () => {
    it('add then remove = removed', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      expect(set.contains('element1')).toBe(true);

      set.remove(new Set([encodeDot(dot)]));
      expect(set.contains('element1')).toBe(false);
    });

    it('concurrent add + remove with empty observedDots = add wins', () => {
      // Scenario: Writer A adds element, Writer B removes (but hasn't seen the add)
      const setA = ORSet.empty();
      const setB = ORSet.empty();
      const dot = createDot('writerA', 1);

      // Writer A adds
      setA.add('element1', dot);

      // Writer B removes with empty observed dots (hasn't seen A's add)
      setB.remove(new Set());

      // Join the sets
      const result = setA.join(setB);

      // Add wins because removal didn't observe any dots
      expect(result.contains('element1')).toBe(true);
    });

    it('remove only removes observed dots', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      set.add('element1', dot1);
      set.add('element1', dot2);

      // Only remove dot1, not dot2
      set.remove(new Set([encodeDot(dot1)]));

      // Element still present due to dot2
      expect(set.contains('element1')).toBe(true);

      // dot1 is tombstoned, dot2 is not
      const dots = set.getDots('element1');
      expect(dots.has(encodeDot(dot1))).toBe(false);
      expect(dots.has(encodeDot(dot2))).toBe(true);
    });

    it('concurrent add after remove = element present (add-wins)', () => {
      // Scenario: A removes, then B adds concurrently (different dot)
      const setA = ORSet.empty();
      const setB = ORSet.empty();
      const dot1 = createDot('writerA', 1);
      const dot2 = createDot('writerB', 1);

      // Initial state: element exists with dot1
      setA.add('element1', dot1);
      setB.add('element1', dot1);

      // A removes the element (tombstones dot1)
      setA.remove(new Set([encodeDot(dot1)]));

      // B concurrently adds with a new dot
      setB.add('element1', dot2);

      // Join
      const result = setA.join(setB);

      // Element is present because dot2 is not tombstoned
      expect(result.contains('element1')).toBe(true);
      expect(result.getDots('element1').has(encodeDot(dot2))).toBe(true);
    });
  });

  describe('orsetCompact', () => {
    it('removes tombstoned dots that are <= includedVV', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.remove(new Set([encodeDot(dot)]));

      const vv = VersionVector.empty();
      vv.set('writer1', 1);

      set.compact(vv);

      // Both the dot and tombstone should be removed
      expect(set.entries.has('element1')).toBe(false);
      expect(set.tombstones.has(encodeDot(dot))).toBe(false);
    });

    it('does NOT remove live (non-tombstoned) dots even if <= vv', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      // No tombstone!

      const vv = VersionVector.empty();
      vv.set('writer1', 1);

      set.compact(vv);

      // Dot should still be there (CRITICAL: never remove live dots)
      expect(set.entries.has('element1')).toBe(true);
      expect(getEntry(set.entries,'element1').has(encodeDot(dot))).toBe(true);
    });

    it('does NOT remove tombstoned dots that are > includedVV', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 5);

      set.add('element1', dot);
      set.remove(new Set([encodeDot(dot)]));

      const vv = VersionVector.empty();
      vv.set('writer1', 3); // vv only includes up to counter 3

      set.compact(vv);

      // Dot and tombstone should still be there
      expect(set.entries.has('element1')).toBe(true);
      expect(set.tombstones.has(encodeDot(dot))).toBe(true);
    });

    it('removes entry when all dots are compacted', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      set.add('element1', dot1);
      set.add('element1', dot2);
      set.remove(new Set([encodeDot(dot1), encodeDot(dot2)]));

      const vv = VersionVector.empty();
      vv.set('writer1', 2);

      set.compact(vv);

      expect(set.entries.has('element1')).toBe(false);
    });

    it('partially compacts when some dots are beyond vv', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 5);

      set.add('element1', dot1);
      set.add('element1', dot2);
      set.remove(new Set([encodeDot(dot1), encodeDot(dot2)]));

      const vv = VersionVector.empty();
      vv.set('writer1', 3);

      set.compact(vv);

      // dot1 compacted, dot2 still there
      expect(set.entries.has('element1')).toBe(true);
      expect(getEntry(set.entries,'element1').has(encodeDot(dot1))).toBe(false);
      expect(getEntry(set.entries,'element1').has(encodeDot(dot2))).toBe(true);
      expect(set.tombstones.has(encodeDot(dot1))).toBe(false);
      expect(set.tombstones.has(encodeDot(dot2))).toBe(true);
    });

    it('compacts multiple elements', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      set.add('element1', dot1);
      set.add('element2', dot2);
      set.remove(new Set([encodeDot(dot1), encodeDot(dot2)]));

      const vv = VersionVector.empty();
      vv.set('writer1', 2);

      set.compact(vv);

      expect(set.entries.size).toBe(0);
      expect(set.tombstones.size).toBe(0);
    });
  });

  describe('orsetSerialize / orsetDeserialize', () => {
    it('serializes empty set', () => {
      const set = ORSet.empty();
      const serialized = set.serialize();

      expect(serialized).toEqual({
        entries: [],
        tombstones: [],
      });
    });

    it('serializes set with entries', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      const serialized = set.serialize();

      expect(serialized.entries).toEqual([['element1', ['writer1:1']]]);
      expect(serialized.tombstones).toEqual([]);
    });

    it('serializes set with tombstones', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.remove(new Set([encodeDot(dot)]));
      const serialized = set.serialize();

      expect(serialized.tombstones).toEqual(['writer1:1']);
    });

    it('sorts entries by element', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);
      const dot3 = createDot('writer1', 3);

      set.add('c', dot1);
      set.add('a', dot2);
      set.add('b', dot3);

      const serialized = set.serialize();

      const e0 = serialized.entries[0]; if (e0 === undefined) { throw new Error('missing'); }
      const e1 = serialized.entries[1]; if (e1 === undefined) { throw new Error('missing'); }
      const e2 = serialized.entries[2]; if (e2 === undefined) { throw new Error('missing'); }
      expect(e0[0]).toBe('a');
      expect(e1[0]).toBe('b');
      expect(e2[0]).toBe('c');
    });

    it('sorts dots within entries', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer2', 1);
      const dot2 = createDot('writer1', 1);

      set.add('element1', dot1);
      set.add('element1', dot2);

      const serialized = set.serialize();

      // writer1:1 < writer2:1 (lexicographic by writerId)
      const entry0 = serialized.entries[0]; if (entry0 === undefined) { throw new Error('missing'); }
      expect(entry0[1]).toEqual(['writer1:1', 'writer2:1']);
    });

    it('sorts tombstones', () => {
      const set = ORSet.empty();
      const dot1 = createDot('writer2', 1);
      const dot2 = createDot('writer1', 1);

      set.remove(new Set([encodeDot(dot1), encodeDot(dot2)]));

      const serialized = set.serialize();

      expect(serialized.tombstones).toEqual(['writer1:1', 'writer2:1']);
    });

    it('deserializes back to equivalent set', () => {
      const original = ORSet.empty();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      original.add('element1', dot1);
      original.add('element2', dot2);
      original.remove(new Set([encodeDot(dot1)]));

      const serialized = original.serialize();
      const deserialized = ORSet.deserialize(serialized);

      // Check equivalence
      expect(deserialized.contains('element1')).toBe(false);
      expect(deserialized.contains('element2')).toBe(true);
      expect(deserialized.tombstones.has(encodeDot(dot1))).toBe(true);
    });

    it('deserializes empty object gracefully', () => {
      const deserialized = ORSet.deserialize({});

      expect(deserialized.entries.size).toBe(0);
      expect(deserialized.tombstones.size).toBe(0);
    });

    it('round-trip serialization preserves structure', () => {
      const original = ORSet.empty();
      const dot1 = createDot('alice', 1);
      const dot2 = createDot('alice', 2);
      const dot3 = createDot('bob', 1);

      original.add('x', dot1);
      original.add('x', dot2);
      original.add('y', dot3);
      original.remove(new Set([encodeDot(dot1)]));

      const serialized = original.serialize();
      const deserialized = ORSet.deserialize(serialized);
      const reserialized = deserialized.serialize();

      // Serialized forms should be identical
      expect(reserialized).toEqual(serialized);
    });
  });

  describe('edge cases', () => {
    it('works with numeric elements', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      // @ts-expect-error — testing ORSet with non-string elements
      set.add(42, dot);

      // @ts-expect-error — testing ORSet with non-string elements
      expect(set.contains(42)).toBe(true);
      expect(set.elements()).toContain(42);
    });

    it('works with object elements (by reference)', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);
      const obj = { id: 1 };

      // @ts-expect-error — testing ORSet with non-string elements
      set.add(obj, dot);

      // @ts-expect-error — testing ORSet with non-string elements
      expect(set.contains(obj)).toBe(true);
      // @ts-expect-error — Different object with same content won't match
      expect(set.contains({ id: 1 })).toBe(false);
    });

    it('handles empty join', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();

      const result = a.join(b);

      expect(result.entries.size).toBe(0);
      expect(result.tombstones.size).toBe(0);
    });

    it('handles join with one empty set', () => {
      const a = ORSet.empty();
      const b = ORSet.empty();
      const dot = createDot('writer1', 1);

      a.add('element1', dot);

      const result = a.join(b);

      expect(result.contains('element1')).toBe(true);
    });

    it('compaction with empty vv does nothing', () => {
      const set = ORSet.empty();
      const dot = createDot('writer1', 1);

      set.add('element1', dot);
      set.remove(new Set([encodeDot(dot)]));

      const emptyVV = VersionVector.empty();

      set.compact(emptyVV);

      // Nothing compacted because vv doesn't contain any writer
      expect(set.entries.has('element1')).toBe(true);
      expect(set.tombstones.has(encodeDot(dot))).toBe(true);
    });
  });
});
