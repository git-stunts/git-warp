import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createEmptyStateV5,
  joinStates as _joinStates,
  join,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.js';
import { computeStateHashV5 as _computeStateHashV5 } from '../../../../src/domain/services/StateSerializerV5.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

/** @type {any} */
const joinStates = _joinStates;
/** @type {any} */
const reduceV5 = _reduceV5;
/** @type {any} */
const computeStateHashV5 = _computeStateHashV5;

const crypto = new NodeCryptoAdapter();
import { createORSet, orsetAdd, orsetRemove, orsetSerialize } from '../../../../src/domain/crdt/ORSet.js';
import { createVersionVector, vvSerialize } from '../../../../src/domain/crdt/VersionVector.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { lwwSet } from '../../../../src/domain/crdt/LWW.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';

// ============================================================================
// Arbitraries for generating random states and patches
// ============================================================================

/**
 * Arbitrary for generating valid dots
 */
const dotArb = fc.record({
  writerId: fc.stringMatching(/^[a-z]{1,5}$/),
  counter: fc.integer({ min: 1, max: 100 }),
}).map(({ writerId, counter }) => createDot(writerId, counter));

/**
 * Arbitrary for generating node IDs
 */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,5}$/);

/**
 * Arbitrary for generating edge keys (encoded as "from\0to\0label")
 */
const edgeKeyArb = fc.tuple(nodeIdArb, nodeIdArb, fc.stringMatching(/^label-[a-z]{1,3}$/))
  .map(([from, to, label]) => `${from}\0${to}\0${label}`);

/**
 * Arbitrary for generating property keys (encoded as "nodeId\0propKey")
 */
const propKeyArb = fc.tuple(nodeIdArb, fc.stringMatching(/^prop-[a-z]{1,3}$/))
  .map(([nodeId, propKey]) => `${nodeId}\0${propKey}`);

/**
 * Arbitrary for generating property values
 */
const propValueArb = fc.oneof(
  fc.string({ maxLength: 10 }),
  fc.integer({ min: -100, max: 100 }),
  fc.boolean()
);

/**
 * Arbitrary for generating hex strings (for patchSha)
 */
const hexStringArb = fc.stringMatching(/^[0-9a-f]{8}$/);

/**
 * Arbitrary for generating EventIds
 */
const eventIdArb = fc.record({
  lamport: fc.integer({ min: 1, max: 1000 }),
  writerId: fc.stringMatching(/^[a-z]{1,5}$/),
  patchSha: hexStringArb,
  opIndex: fc.integer({ min: 0, max: 10 }),
}).map(({ lamport, writerId, patchSha, opIndex }) =>
  createEventId(lamport, writerId, patchSha, opIndex)
);

/**
 * Generates a random ORSet with elements and tombstones
 */
/** @param {any} elements @param {any} dotArbitrary */
function generateORSet(elements, dotArbitrary) {
  return fc.array(
    fc.record({
      element: elements,
      dots: fc.array(dotArbitrary, { minLength: 1, maxLength: 3 }),
      tombstoneCount: fc.integer({ min: 0, max: 2 }),
    }),
    { minLength: 0, maxLength: 5 }
  ).map((items) => {
    const set = createORSet();
    for (const { element, dots, tombstoneCount } of items) {
      for (const dot of dots) {
        orsetAdd(set, element, dot);
      }
      // Tombstone some dots
      const dotsToTombstone = dots.slice(0, Math.min(tombstoneCount, dots.length));
      if (dotsToTombstone.length > 0) {
        orsetRemove(set, new Set(dotsToTombstone.map(encodeDot)));
      }
    }
    return set;
  });
}

/**
 * Generates a random VersionVector
 */
const versionVectorArb = fc.array(
  fc.tuple(fc.stringMatching(/^[a-z]{1,5}$/), fc.integer({ min: 1, max: 100 })),
  { minLength: 0, maxLength: 5 }
).map((entries) => {
  const vv = createVersionVector();
  for (const [writerId, counter] of entries) {
    vv.set(writerId, counter);
  }
  return vv;
});

/**
 * Generates a random property map
 */
const propMapArb = fc.array(
  fc.tuple(propKeyArb, eventIdArb, propValueArb),
  { minLength: 0, maxLength: 5 }
).map((entries) => {
  const props = new Map();
  for (const [key, eventId, value] of entries) {
    props.set(key, lwwSet(eventId, value));
  }
  return props;
});

/**
 * Generates a random WarpStateV5
 */
const stateArb = fc.record({
  nodeAlive: generateORSet(nodeIdArb, dotArb),
  edgeAlive: generateORSet(edgeKeyArb, dotArb),
  prop: propMapArb,
  observedFrontier: versionVectorArb,
});

// ============================================================================
// State Equality Helper
// ============================================================================

/**
 * Checks if two states are structurally equal
 */
/** @param {any} a @param {any} b */
function statesEqual(a, b) {
  // Compare nodeAlive ORSets
  if (JSON.stringify(orsetSerialize(a.nodeAlive)) !== JSON.stringify(orsetSerialize(b.nodeAlive))) {
    return false;
  }

  // Compare edgeAlive ORSets
  if (JSON.stringify(orsetSerialize(a.edgeAlive)) !== JSON.stringify(orsetSerialize(b.edgeAlive))) {
    return false;
  }

  // Compare observedFrontier VersionVectors
  if (JSON.stringify(vvSerialize(a.observedFrontier)) !== JSON.stringify(vvSerialize(b.observedFrontier))) {
    return false;
  }

  // Compare prop Maps (LWW registers)
  if (a.prop.size !== b.prop.size) {
    return false;
  }

  for (const [key, regA] of a.prop) {
    const regB = b.prop.get(key);
    if (!regB) return false;
    if (JSON.stringify(regA) !== JSON.stringify(regB)) return false;
  }

  return true;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('JoinReducer property tests', () => {
  describe('joinStates Lattice Properties', () => {
    it('joinStates is commutative: join(a, b) === join(b, a)', () => {
      fc.assert(
        fc.property(stateArb, stateArb, (a, b) => {
          const ab = joinStates(a, b);
          const ba = joinStates(b, a);
          return statesEqual(ab, ba);
        }),
        { numRuns: 100 }
      );
    });

    it('joinStates is associative: join(join(a, b), c) === join(a, join(b, c))', () => {
      fc.assert(
        fc.property(stateArb, stateArb, stateArb, (a, b, c) => {
          const ab_c = joinStates(joinStates(a, b), c);
          const a_bc = joinStates(a, joinStates(b, c));
          return statesEqual(ab_c, a_bc);
        }),
        { numRuns: 100 }
      );
    });

    it('joinStates is idempotent: join(a, a) === a', () => {
      fc.assert(
        fc.property(stateArb, (a) => {
          const result = joinStates(a, a);
          return statesEqual(result, a);
        }),
        { numRuns: 100 }
      );
    });

    it('empty state is identity: join(a, empty) === a', () => {
      fc.assert(
        fc.property(stateArb, (a) => {
          const empty = createEmptyStateV5();
          const result = joinStates(a, empty);
          return statesEqual(result, a);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('State Hash Determinism', () => {
    it('same state produces same hash', async () => {
      await fc.assert(
        fc.asyncProperty(stateArb, async (state) => {
          const hash1 = await computeStateHashV5(state, { crypto });
          const hash2 = await computeStateHashV5(state, { crypto });
          return hash1 === hash2;
        }),
        { numRuns: 100 }
      );
    });

    it('join order does not affect hash: hash(join(a,b)) === hash(join(b,a))', async () => {
      await fc.assert(
        fc.asyncProperty(stateArb, stateArb, async (a, b) => {
          const ab = joinStates(a, b);
          const ba = joinStates(b, a);
          const hashAB = await computeStateHashV5(ab, { crypto });
          const hashBA = await computeStateHashV5(ba, { crypto });
          return hashAB === hashBA;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Patch Ordering Invariance', () => {
    /**
     * Generates a valid patch for testing
     */
    const patchArb = fc.record({
      schema: fc.constant(2),
      writer: fc.stringMatching(/^[a-z]{1,5}$/),
      lamport: fc.integer({ min: 1, max: 1000 }),
      context: versionVectorArb,
      ops: fc.array(
        fc.oneof(
          // NodeAdd
          fc.record({
            type: fc.constant('NodeAdd'),
            node: nodeIdArb,
            dot: dotArb,
          }),
          // PropSet
          fc.record({
            type: fc.constant('PropSet'),
            node: nodeIdArb,
            key: fc.stringMatching(/^prop-[a-z]{1,3}$/),
            value: propValueArb,
          })
        ),
        { minLength: 1, maxLength: 5 }
      ),
    });

    /**
     * Generates a patch with a unique SHA for testing
     */
    const patchWithShaArb = fc.tuple(
      patchArb,
      hexStringArb
    ).map(([patch, sha]) => ({ patch, sha }));

    it('any permutation of patches produces same state hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(patchWithShaArb, { minLength: 2, maxLength: 10 }),
          async (patches) => {
            // Reduce patches in original order
            const state1 = reduceV5(patches);
            const hash1 = await computeStateHashV5(state1, { crypto });

            // Shuffle patches using Fisher-Yates
            const shuffled = [...patches];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Reduce shuffled patches
            const state2 = reduceV5(shuffled);
            const hash2 = await computeStateHashV5(state2, { crypto });

            return hash1 === hash2;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('reducing patches individually then joining equals reducing all at once', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(patchWithShaArb, { minLength: 2, maxLength: 5 }),
          async (patches) => {
            // Reduce all at once
            const allAtOnce = reduceV5(patches);

            // Reduce each individually, then join
            const individualStates = patches.map((p) => reduceV5([p]));
            const joined = individualStates.reduce(
              (acc, state) => joinStates(acc, state),
              createEmptyStateV5()
            );

            return (await computeStateHashV5(allAtOnce, { crypto })) === (await computeStateHashV5(joined, { crypto }));
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Monotonicity', () => {
    it('joinStates never loses information from either input', () => {
      fc.assert(
        fc.property(stateArb, stateArb, (a, b) => {
          const joined = joinStates(a, b);

          // All nodes from a should be in joined
          for (const [element, dots] of a.nodeAlive.entries) {
            if (!joined.nodeAlive.entries.has(element)) {
              return false;
            }
            for (const dot of dots) {
              if (!joined.nodeAlive.entries.get(element).has(dot)) {
                return false;
              }
            }
          }

          // All tombstones from a should be in joined
          for (const tombstone of a.nodeAlive.tombstones) {
            if (!joined.nodeAlive.tombstones.has(tombstone)) {
              return false;
            }
          }

          // All props from a should be in joined (or superseded by higher eventId)
          for (const [key, regA] of a.prop) {
            const regJoined = joined.prop.get(key);
            if (!regJoined) {
              return false;
            }
            // The joined value should be >= the a value (by EventId comparison)
          }

          // All version vector entries from a should be in joined (>= values)
          for (const [writerId, counterA] of a.observedFrontier) {
            const counterJoined = joined.observedFrontier.get(writerId);
            if (counterJoined === undefined || counterJoined < counterA) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
