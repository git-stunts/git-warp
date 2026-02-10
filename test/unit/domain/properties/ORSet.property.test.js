import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createORSet,
  orsetAdd,
  orsetRemove,
  orsetJoin,
  orsetSerialize,
} from '../../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';

// ============================================================================
// Arbitraries for generating random ORSets
// ============================================================================

/**
 * Arbitrary for generating valid dots
 */
const dotArb = fc.record({
  writerId: fc.stringMatching(/^[a-z]{1,5}$/),
  counter: fc.integer({ min: 1, max: 100 }),
}).map(({ writerId, counter }) => createDot(writerId, counter));

/**
 * Arbitrary for generating element identifiers
 */
const elementArb = fc.stringMatching(/^elem-[a-z0-9]{1,5}$/);

/**
 * Arbitrary for generating an operation (add or remove)
 */
const operationArb = fc.oneof(
  fc.record({
    type: fc.constant('add'),
    element: elementArb,
    dot: dotArb,
  }),
  fc.record({
    type: fc.constant('remove'),
    element: elementArb,
    dot: dotArb,
  })
);

/**
 * Generates a random ORSet by applying a sequence of operations
 */
const orsetArb = fc.array(operationArb, { minLength: 0, maxLength: 10 }).map((ops) => {
  const set = createORSet();

  for (const op of ops) {
    if (op.type === 'add') {
      orsetAdd(set, op.element, op.dot);
    } else {
      // For remove, add the dot first then remove it (simulating observed remove)
      orsetAdd(set, op.element, op.dot);
      orsetRemove(set, new Set([encodeDot(op.dot)]));
    }
  }

  return set;
});

// ============================================================================
// Equality helper
// ============================================================================

/**
 * Checks if two ORSets are structurally equal using serialization
 */
/** @param {any} a @param {any} b */
function orsetEqual(a, b) {
  return JSON.stringify(orsetSerialize(a)) === JSON.stringify(orsetSerialize(b));
}

// ============================================================================
// Property Tests
// ============================================================================

describe('ORSet property tests', () => {
  describe('Lattice Properties', () => {
    it('join is commutative: join(a, b) === join(b, a)', () => {
      fc.assert(
        fc.property(orsetArb, orsetArb, (a, b) => {
          const ab = orsetJoin(a, b);
          const ba = orsetJoin(b, a);
          return orsetEqual(ab, ba);
        }),
        { numRuns: 100 }
      );
    });

    it('join is associative: join(join(a, b), c) === join(a, join(b, c))', () => {
      fc.assert(
        fc.property(orsetArb, orsetArb, orsetArb, (a, b, c) => {
          const ab_c = orsetJoin(orsetJoin(a, b), c);
          const a_bc = orsetJoin(a, orsetJoin(b, c));
          return orsetEqual(ab_c, a_bc);
        }),
        { numRuns: 100 }
      );
    });

    it('join is idempotent: join(a, a) === a', () => {
      fc.assert(
        fc.property(orsetArb, (a) => {
          const result = orsetJoin(a, a);
          return orsetEqual(result, a);
        }),
        { numRuns: 100 }
      );
    });

    it('empty set is identity: join(a, empty) === a', () => {
      fc.assert(
        fc.property(orsetArb, (a) => {
          const empty = createORSet();
          const result = orsetJoin(a, empty);
          return orsetEqual(result, a);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Monotonicity Properties', () => {
    it('join always grows or stays same (no shrinking)', () => {
      fc.assert(
        fc.property(orsetArb, orsetArb, (a, b) => {
          const joined = orsetJoin(a, b);

          // All entries from a should be in joined
          for (const [element, dots] of a.entries) {
            if (!joined.entries.has(element)) {
              return false;
            }
            for (const dot of dots) {
              if (!(/** @type {any} */ (joined.entries.get(element))).has(dot)) {
                return false;
              }
            }
          }

          // All tombstones from a should be in joined
          for (const tombstone of a.tombstones) {
            if (!joined.tombstones.has(tombstone)) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Serialization Properties', () => {
    it('serialization is deterministic', () => {
      fc.assert(
        fc.property(orsetArb, (set) => {
          const s1 = JSON.stringify(orsetSerialize(set));
          const s2 = JSON.stringify(orsetSerialize(set));
          return s1 === s2;
        }),
        { numRuns: 100 }
      );
    });

    it('equal sets have equal serialization', () => {
      fc.assert(
        fc.property(orsetArb, orsetArb, (a, b) => {
          // Join both ways to get equivalent sets
          const ab = orsetJoin(a, b);
          const ba = orsetJoin(b, a);

          const sAB = JSON.stringify(orsetSerialize(ab));
          const sBA = JSON.stringify(orsetSerialize(ba));
          return sAB === sBA;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Add-Remove Semantics', () => {
    it('concurrent adds with different dots are all preserved', () => {
      fc.assert(
        fc.property(
          elementArb,
          fc.array(dotArb, { minLength: 2, maxLength: 5 }),
          (element, dots) => {
            // Create separate ORSets for each dot
            const sets = dots.map((dot) => {
              const set = createORSet();
              orsetAdd(set, element, dot);
              return set;
            });

            // Join all sets
            const joined = sets.reduce((acc, set) => orsetJoin(acc, set), createORSet());

            // All dots should be present (minus duplicates)
            const uniqueDots = new Set(dots.map(encodeDot));
            const joinedDots = joined.entries.get(element);

            if (!joinedDots) {
              return false;
            }

            for (const dotStr of uniqueDots) {
              if (!joinedDots.has(dotStr)) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('remove only affects observed dots, not concurrent adds', () => {
      fc.assert(
        fc.property(elementArb, dotArb, dotArb, (element, dot1, dot2) => {
          // Skip if dots are the same
          if (encodeDot(dot1) === encodeDot(dot2)) {
            return true;
          }

          // Set A: add with dot1, then remove dot1
          const setA = createORSet();
          orsetAdd(setA, element, dot1);
          orsetRemove(setA, new Set([encodeDot(dot1)]));

          // Set B: add with dot2 (concurrent add)
          const setB = createORSet();
          orsetAdd(setB, element, dot2);

          // Join
          const joined = orsetJoin(setA, setB);

          // Element should be present (dot2 not tombstoned)
          const dots = joined.entries.get(element);
          if (!dots) {
            return false;
          }

          // dot2 should be present and not tombstoned
          return dots.has(encodeDot(dot2)) && !joined.tombstones.has(encodeDot(dot2));
        }),
        { numRuns: 100 }
      );
    });
  });
});
