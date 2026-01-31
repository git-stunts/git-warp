import { describe, it, expect } from 'vitest';
import {
  createORSet,
  orsetAdd,
  orsetRemove,
  orsetContains,
  orsetElements,
  orsetGetDots,
  orsetJoin,
  orsetCompact,
  orsetSerialize,
  orsetDeserialize,
} from '../../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';

describe('ORSet', () => {
  describe('createORSet', () => {
    it('creates empty ORSet', () => {
      const set = createORSet();

      expect(set.entries).toBeInstanceOf(Map);
      expect(set.entries.size).toBe(0);
      expect(set.tombstones).toBeInstanceOf(Set);
      expect(set.tombstones.size).toBe(0);
    });
  });

  describe('orsetAdd', () => {
    it('adds element with dot', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);

      expect(set.entries.has('element1')).toBe(true);
      expect(set.entries.get('element1').has(encodeDot(dot))).toBe(true);
    });

    it('adds multiple dots to same element', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);

      expect(set.entries.get('element1').size).toBe(2);
      expect(set.entries.get('element1').has(encodeDot(dot1))).toBe(true);
      expect(set.entries.get('element1').has(encodeDot(dot2))).toBe(true);
    });

    it('adds same dot twice (idempotent)', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetAdd(set, 'element1', dot);

      expect(set.entries.get('element1').size).toBe(1);
    });

    it('adds different elements', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element2', dot2);

      expect(set.entries.size).toBe(2);
    });
  });

  describe('orsetRemove', () => {
    it('adds observed dots to tombstones', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);
      const encodedDot = encodeDot(dot);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodedDot]));

      expect(set.tombstones.has(encodedDot)).toBe(true);
    });

    it('adds multiple dots to tombstones', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);
      orsetRemove(set, new Set([encodeDot(dot1), encodeDot(dot2)]));

      expect(set.tombstones.size).toBe(2);
    });

    it('removes with empty observedDots does nothing', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set());

      expect(set.tombstones.size).toBe(0);
    });
  });

  describe('orsetContains', () => {
    it('returns true for element with non-tombstoned dot', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);

      expect(orsetContains(set, 'element1')).toBe(true);
    });

    it('returns false for element with all dots tombstoned', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      expect(orsetContains(set, 'element1')).toBe(false);
    });

    it('returns true if at least one dot is not tombstoned', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);
      orsetRemove(set, new Set([encodeDot(dot1)]));

      expect(orsetContains(set, 'element1')).toBe(true);
    });

    it('returns false for non-existent element', () => {
      const set = createORSet();

      expect(orsetContains(set, 'nonexistent')).toBe(false);
    });
  });

  describe('orsetElements', () => {
    it('returns empty array for empty set', () => {
      const set = createORSet();

      expect(orsetElements(set)).toEqual([]);
    });

    it('returns only present elements', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element2', dot2);
      orsetRemove(set, new Set([encodeDot(dot1)]));

      const elements = orsetElements(set);
      expect(elements).toContain('element2');
      expect(elements).not.toContain('element1');
      expect(elements.length).toBe(1);
    });

    it('returns all present elements', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);
      const dot3 = createDot('writer1', 3);

      orsetAdd(set, 'a', dot1);
      orsetAdd(set, 'b', dot2);
      orsetAdd(set, 'c', dot3);

      const elements = orsetElements(set);
      expect(elements.length).toBe(3);
      expect(elements).toContain('a');
      expect(elements).toContain('b');
      expect(elements).toContain('c');
    });
  });

  describe('orsetGetDots', () => {
    it('returns non-tombstoned dots for element', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);
      orsetRemove(set, new Set([encodeDot(dot1)]));

      const dots = orsetGetDots(set, 'element1');
      expect(dots.size).toBe(1);
      expect(dots.has(encodeDot(dot2))).toBe(true);
      expect(dots.has(encodeDot(dot1))).toBe(false);
    });

    it('returns empty set for non-existent element', () => {
      const set = createORSet();

      const dots = orsetGetDots(set, 'nonexistent');
      expect(dots.size).toBe(0);
    });

    it('returns empty set if all dots tombstoned', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      const dots = orsetGetDots(set, 'element1');
      expect(dots.size).toBe(0);
    });
  });

  describe('orsetJoin - Lattice Properties', () => {
    it('commutativity: orsetJoin(a, b) equals orsetJoin(b, a)', () => {
      const a = createORSet();
      const b = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(b, 'element2', dot2);
      orsetRemove(a, new Set([encodeDot(dot1)]));

      const ab = orsetJoin(a, b);
      const ba = orsetJoin(b, a);

      // Same elements
      expect(orsetElements(ab).sort()).toEqual(orsetElements(ba).sort());

      // Same tombstones
      expect([...ab.tombstones].sort()).toEqual([...ba.tombstones].sort());

      // Same entries structure
      expect(ab.entries.size).toBe(ba.entries.size);
      for (const [element, dots] of ab.entries) {
        expect(ba.entries.has(element)).toBe(true);
        expect([...dots].sort()).toEqual([...ba.entries.get(element)].sort());
      }
    });

    it('associativity: orsetJoin(orsetJoin(a, b), c) equals orsetJoin(a, orsetJoin(b, c))', () => {
      const a = createORSet();
      const b = createORSet();
      const c = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);
      const dot3 = createDot('writer3', 1);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(b, 'element2', dot2);
      orsetAdd(c, 'element3', dot3);
      orsetRemove(b, new Set([encodeDot(dot2)]));

      const left = orsetJoin(orsetJoin(a, b), c);
      const right = orsetJoin(a, orsetJoin(b, c));

      // Same elements
      expect(orsetElements(left).sort()).toEqual(orsetElements(right).sort());

      // Same tombstones
      expect([...left.tombstones].sort()).toEqual([...right.tombstones].sort());

      // Same entries structure
      expect(left.entries.size).toBe(right.entries.size);
      for (const [element, dots] of left.entries) {
        expect(right.entries.has(element)).toBe(true);
        expect([...dots].sort()).toEqual([...right.entries.get(element)].sort());
      }
    });

    it('idempotence: orsetJoin(a, a) equals a', () => {
      const a = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(a, 'element2', dot2);
      orsetRemove(a, new Set([encodeDot(dot1)]));

      const result = orsetJoin(a, a);

      // Same elements
      expect(orsetElements(result).sort()).toEqual(orsetElements(a).sort());

      // Same tombstones
      expect([...result.tombstones].sort()).toEqual([...a.tombstones].sort());

      // Same entries structure
      expect(result.entries.size).toBe(a.entries.size);
      for (const [element, dots] of result.entries) {
        expect(a.entries.has(element)).toBe(true);
        expect([...dots].sort()).toEqual([...a.entries.get(element)].sort());
      }
    });
  });

  describe('orsetJoin - Union Semantics', () => {
    it('unions entries from both sets', () => {
      const a = createORSet();
      const b = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(b, 'element2', dot2);

      const result = orsetJoin(a, b);

      expect(orsetContains(result, 'element1')).toBe(true);
      expect(orsetContains(result, 'element2')).toBe(true);
    });

    it('unions dots for same element', () => {
      const a = createORSet();
      const b = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(b, 'element1', dot2);

      const result = orsetJoin(a, b);

      expect(result.entries.get('element1').size).toBe(2);
    });

    it('unions tombstones', () => {
      const a = createORSet();
      const b = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(b, 'element2', dot2);
      orsetRemove(a, new Set([encodeDot(dot1)]));
      orsetRemove(b, new Set([encodeDot(dot2)]));

      const result = orsetJoin(a, b);

      expect(result.tombstones.size).toBe(2);
      expect(result.tombstones.has(encodeDot(dot1))).toBe(true);
      expect(result.tombstones.has(encodeDot(dot2))).toBe(true);
    });

    it('does not mutate input sets', () => {
      const a = createORSet();
      const b = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(a, 'element1', dot1);
      orsetAdd(b, 'element2', dot2);

      const aEntriesBefore = a.entries.size;
      const bEntriesBefore = b.entries.size;

      orsetJoin(a, b);

      expect(a.entries.size).toBe(aEntriesBefore);
      expect(b.entries.size).toBe(bEntriesBefore);
    });
  });

  describe('OR-Set Semantics', () => {
    it('add then remove = removed', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      expect(orsetContains(set, 'element1')).toBe(true);

      orsetRemove(set, new Set([encodeDot(dot)]));
      expect(orsetContains(set, 'element1')).toBe(false);
    });

    it('concurrent add + remove with empty observedDots = add wins', () => {
      // Scenario: Writer A adds element, Writer B removes (but hasn't seen the add)
      const setA = createORSet();
      const setB = createORSet();
      const dot = createDot('writerA', 1);

      // Writer A adds
      orsetAdd(setA, 'element1', dot);

      // Writer B removes with empty observed dots (hasn't seen A's add)
      orsetRemove(setB, new Set());

      // Join the sets
      const result = orsetJoin(setA, setB);

      // Add wins because removal didn't observe any dots
      expect(orsetContains(result, 'element1')).toBe(true);
    });

    it('remove only removes observed dots', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);

      // Only remove dot1, not dot2
      orsetRemove(set, new Set([encodeDot(dot1)]));

      // Element still present due to dot2
      expect(orsetContains(set, 'element1')).toBe(true);

      // dot1 is tombstoned, dot2 is not
      const dots = orsetGetDots(set, 'element1');
      expect(dots.has(encodeDot(dot1))).toBe(false);
      expect(dots.has(encodeDot(dot2))).toBe(true);
    });

    it('concurrent add after remove = element present (add-wins)', () => {
      // Scenario: A removes, then B adds concurrently (different dot)
      const setA = createORSet();
      const setB = createORSet();
      const dot1 = createDot('writerA', 1);
      const dot2 = createDot('writerB', 1);

      // Initial state: element exists with dot1
      orsetAdd(setA, 'element1', dot1);
      orsetAdd(setB, 'element1', dot1);

      // A removes the element (tombstones dot1)
      orsetRemove(setA, new Set([encodeDot(dot1)]));

      // B concurrently adds with a new dot
      orsetAdd(setB, 'element1', dot2);

      // Join
      const result = orsetJoin(setA, setB);

      // Element is present because dot2 is not tombstoned
      expect(orsetContains(result, 'element1')).toBe(true);
      expect(orsetGetDots(result, 'element1').has(encodeDot(dot2))).toBe(true);
    });
  });

  describe('orsetCompact', () => {
    it('removes tombstoned dots that are <= includedVV', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      const vv = createVersionVector();
      vv.set('writer1', 1);

      orsetCompact(set, vv);

      // Both the dot and tombstone should be removed
      expect(set.entries.has('element1')).toBe(false);
      expect(set.tombstones.has(encodeDot(dot))).toBe(false);
    });

    it('does NOT remove live (non-tombstoned) dots even if <= vv', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      // No tombstone!

      const vv = createVersionVector();
      vv.set('writer1', 1);

      orsetCompact(set, vv);

      // Dot should still be there (CRITICAL: never remove live dots)
      expect(set.entries.has('element1')).toBe(true);
      expect(set.entries.get('element1').has(encodeDot(dot))).toBe(true);
    });

    it('does NOT remove tombstoned dots that are > includedVV', () => {
      const set = createORSet();
      const dot = createDot('writer1', 5);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      const vv = createVersionVector();
      vv.set('writer1', 3); // vv only includes up to counter 3

      orsetCompact(set, vv);

      // Dot and tombstone should still be there
      expect(set.entries.has('element1')).toBe(true);
      expect(set.tombstones.has(encodeDot(dot))).toBe(true);
    });

    it('removes entry when all dots are compacted', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);
      orsetRemove(set, new Set([encodeDot(dot1), encodeDot(dot2)]));

      const vv = createVersionVector();
      vv.set('writer1', 2);

      orsetCompact(set, vv);

      expect(set.entries.has('element1')).toBe(false);
    });

    it('partially compacts when some dots are beyond vv', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 5);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);
      orsetRemove(set, new Set([encodeDot(dot1), encodeDot(dot2)]));

      const vv = createVersionVector();
      vv.set('writer1', 3);

      orsetCompact(set, vv);

      // dot1 compacted, dot2 still there
      expect(set.entries.has('element1')).toBe(true);
      expect(set.entries.get('element1').has(encodeDot(dot1))).toBe(false);
      expect(set.entries.get('element1').has(encodeDot(dot2))).toBe(true);
      expect(set.tombstones.has(encodeDot(dot1))).toBe(false);
      expect(set.tombstones.has(encodeDot(dot2))).toBe(true);
    });

    it('compacts multiple elements', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element2', dot2);
      orsetRemove(set, new Set([encodeDot(dot1), encodeDot(dot2)]));

      const vv = createVersionVector();
      vv.set('writer1', 2);

      orsetCompact(set, vv);

      expect(set.entries.size).toBe(0);
      expect(set.tombstones.size).toBe(0);
    });
  });

  describe('orsetSerialize / orsetDeserialize', () => {
    it('serializes empty set', () => {
      const set = createORSet();
      const serialized = orsetSerialize(set);

      expect(serialized).toEqual({
        entries: [],
        tombstones: [],
      });
    });

    it('serializes set with entries', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      const serialized = orsetSerialize(set);

      expect(serialized.entries).toEqual([['element1', ['writer1:1']]]);
      expect(serialized.tombstones).toEqual([]);
    });

    it('serializes set with tombstones', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));
      const serialized = orsetSerialize(set);

      expect(serialized.tombstones).toEqual(['writer1:1']);
    });

    it('sorts entries by element', () => {
      const set = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer1', 2);
      const dot3 = createDot('writer1', 3);

      orsetAdd(set, 'c', dot1);
      orsetAdd(set, 'a', dot2);
      orsetAdd(set, 'b', dot3);

      const serialized = orsetSerialize(set);

      expect(serialized.entries[0][0]).toBe('a');
      expect(serialized.entries[1][0]).toBe('b');
      expect(serialized.entries[2][0]).toBe('c');
    });

    it('sorts dots within entries', () => {
      const set = createORSet();
      const dot1 = createDot('writer2', 1);
      const dot2 = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot1);
      orsetAdd(set, 'element1', dot2);

      const serialized = orsetSerialize(set);

      // writer1:1 < writer2:1 (lexicographic by writerId)
      expect(serialized.entries[0][1]).toEqual(['writer1:1', 'writer2:1']);
    });

    it('sorts tombstones', () => {
      const set = createORSet();
      const dot1 = createDot('writer2', 1);
      const dot2 = createDot('writer1', 1);

      orsetRemove(set, new Set([encodeDot(dot1), encodeDot(dot2)]));

      const serialized = orsetSerialize(set);

      expect(serialized.tombstones).toEqual(['writer1:1', 'writer2:1']);
    });

    it('deserializes back to equivalent set', () => {
      const original = createORSet();
      const dot1 = createDot('writer1', 1);
      const dot2 = createDot('writer2', 1);

      orsetAdd(original, 'element1', dot1);
      orsetAdd(original, 'element2', dot2);
      orsetRemove(original, new Set([encodeDot(dot1)]));

      const serialized = orsetSerialize(original);
      const deserialized = orsetDeserialize(serialized);

      // Check equivalence
      expect(orsetContains(deserialized, 'element1')).toBe(false);
      expect(orsetContains(deserialized, 'element2')).toBe(true);
      expect(deserialized.tombstones.has(encodeDot(dot1))).toBe(true);
    });

    it('deserializes empty object gracefully', () => {
      const deserialized = orsetDeserialize({});

      expect(deserialized.entries.size).toBe(0);
      expect(deserialized.tombstones.size).toBe(0);
    });

    it('round-trip serialization preserves structure', () => {
      const original = createORSet();
      const dot1 = createDot('alice', 1);
      const dot2 = createDot('alice', 2);
      const dot3 = createDot('bob', 1);

      orsetAdd(original, 'x', dot1);
      orsetAdd(original, 'x', dot2);
      orsetAdd(original, 'y', dot3);
      orsetRemove(original, new Set([encodeDot(dot1)]));

      const serialized = orsetSerialize(original);
      const deserialized = orsetDeserialize(serialized);
      const reserialized = orsetSerialize(deserialized);

      // Serialized forms should be identical
      expect(reserialized).toEqual(serialized);
    });
  });

  describe('edge cases', () => {
    it('works with numeric elements', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 42, dot);

      expect(orsetContains(set, 42)).toBe(true);
      expect(orsetElements(set)).toContain(42);
    });

    it('works with object elements (by reference)', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);
      const obj = { id: 1 };

      orsetAdd(set, obj, dot);

      expect(orsetContains(set, obj)).toBe(true);
      // Different object with same content won't match
      expect(orsetContains(set, { id: 1 })).toBe(false);
    });

    it('handles empty join', () => {
      const a = createORSet();
      const b = createORSet();

      const result = orsetJoin(a, b);

      expect(result.entries.size).toBe(0);
      expect(result.tombstones.size).toBe(0);
    });

    it('handles join with one empty set', () => {
      const a = createORSet();
      const b = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(a, 'element1', dot);

      const result = orsetJoin(a, b);

      expect(orsetContains(result, 'element1')).toBe(true);
    });

    it('compaction with empty vv does nothing', () => {
      const set = createORSet();
      const dot = createDot('writer1', 1);

      orsetAdd(set, 'element1', dot);
      orsetRemove(set, new Set([encodeDot(dot)]));

      const emptyVV = createVersionVector();

      orsetCompact(set, emptyVV);

      // Nothing compacted because vv doesn't contain any writer
      expect(set.entries.has('element1')).toBe(true);
      expect(set.tombstones.has(encodeDot(dot))).toBe(true);
    });
  });
});
