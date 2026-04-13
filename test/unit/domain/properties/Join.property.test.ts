import { describe, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../../../helpers/seededRng.js';
import {
  createEmptyState,
  joinStates as _joinStates,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.ts';
import { computeStateHash as _computeStateHash } from '../../../../src/domain/services/state/StateSerializer.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const joinStates = (_joinStates) as any;
const reduceV5 = (_reduceV5) as any;
const computeStateHash = (_computeStateHash) as any;

const crypto = new NodeCryptoAdapter();
const PROPERTY_TEST_SEED = 42;
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { lwwSet } from '../../../../src/domain/crdt/LWW.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

// ============================================================================
// Arbitraries for generating random states and patches
// ============================================================================

/**
 * Arbitrary for generating valid dots
 */
const dotArb = fc.record({
  writerId: fc.stringMatching(/^[a-z]{1,5}$/),
  counter: fc.integer({ min: 1, max: 100 }),
}).map(({ writerId, counter }) => Dot.create(writerId, counter));

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
  new EventId(lamport, writerId, patchSha, opIndex)
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
    const set = ORSet.empty();
    for (const { element, dots, tombstoneCount } of items) {
      for (const dot of dots) {
        set.add((element as any), (dot as any));
      }
      // Tombstone some dots
      const dotsToTombstone = dots.slice(0, Math.min(tombstoneCount, dots.length));
      if (dotsToTombstone.length > 0) {
        set.remove(new Set(dotsToTombstone.map((dot: any) => encodeDot(dot))));
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
  const vv = VersionVector.empty();
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
 * Generates a random WarpState (real class instance).
 */
const stateArb = fc.record({
  nodeAlive: generateORSet(nodeIdArb, dotArb),
  edgeAlive: generateORSet(edgeKeyArb, dotArb),
  prop: propMapArb,
  observedFrontier: versionVectorArb,
}).map((fields) => new WarpState(fields));

// ============================================================================
// State Equality Helper
// ============================================================================

/**
 * Checks if two states are structurally equal
 */
/** @param {any} a @param {any} b */
function statesEqual(a, b) {
  // Compare nodeAlive ORSets
  if (JSON.stringify(a.nodeAlive.serialize()) !== JSON.stringify(b.nodeAlive.serialize())) {
    return false;
  }

  // Compare edgeAlive ORSets
  if (JSON.stringify(a.edgeAlive.serialize()) !== JSON.stringify(b.edgeAlive.serialize())) {
    return false;
  }

  // Compare observedFrontier VersionVectors
  if (JSON.stringify(VersionVector.serialize(a.observedFrontier)) !== JSON.stringify(VersionVector.serialize(b.observedFrontier))) {
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
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
      );
    });

    it('joinStates is associative: join(join(a, b), c) === join(a, join(b, c))', () => {
      fc.assert(
        fc.property(stateArb, stateArb, stateArb, (a, b, c) => {
          const ab_c = joinStates(joinStates(a, b), c);
          const a_bc = joinStates(a, joinStates(b, c));
          return statesEqual(ab_c, a_bc);
        }),
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
      );
    });

    it('joinStates is idempotent: join(a, a) === a', () => {
      fc.assert(
        fc.property(stateArb, (a) => {
          const result = joinStates(a, a);
          return statesEqual(result, a);
        }),
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
      );
    });

    it('empty state is identity: join(a, empty) === a', () => {
      fc.assert(
        fc.property(stateArb, (a) => {
          const empty = createEmptyState();
          const result = joinStates(a, empty);
          return statesEqual(result, a);
        }),
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
      );
    });
  });

  describe('State Hash Determinism', () => {
    it('same state produces same hash', async () => {
      await fc.assert(
        fc.asyncProperty(stateArb, async (state) => {
          const hash1 = await computeStateHash(state, { crypto });
          const hash2 = await computeStateHash(state, { crypto });
          return hash1 === hash2;
        }),
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
      );
    });

    it('join order does not affect hash: hash(join(a,b)) === hash(join(b,a))', async () => {
      await fc.assert(
        fc.asyncProperty(stateArb, stateArb, async (a, b) => {
          const ab = joinStates(a, b);
          const ba = joinStates(b, a);
          const hashAB = await computeStateHash(ab, { crypto });
          const hashBA = await computeStateHash(ba, { crypto });
          return hashAB === hashBA;
        }),
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
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
            const hash1 = await computeStateHash(state1, { crypto });

            // Shuffle patches using seeded RNG helper
            const shuffled = createRng(PROPERTY_TEST_SEED).shuffle(patches);

            // Reduce shuffled patches
            const state2 = reduceV5(shuffled);
            const hash2 = await computeStateHash(state2, { crypto });

            return hash1 === hash2;
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_SEED }
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
              createEmptyState()
            );

            return (await computeStateHash(allAtOnce, { crypto })) === (await computeStateHash(joined, { crypto }));
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_SEED }
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
          for (const [key] of a.prop) {
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
        { numRuns: 100, seed: PROPERTY_TEST_SEED }
      );
    });
  });
});
