import { createDot } from './Dot.js';

/**
 * @fileoverview VersionVector - Causality Tracking via Join-Semilattice
 *
 * A version vector is a fundamental data structure for tracking causality in
 * distributed systems. It maps each writer ID to the highest operation counter
 * observed from that writer, forming a compact summary of "what has been seen."
 *
 * ## Semilattice Structure
 *
 * Version vectors form a **join-semilattice** under the pointwise maximum
 * operation (vvMerge). A join-semilattice is a partially ordered set where
 * every pair of elements has a least upper bound (join).
 *
 * The semilattice properties of vvMerge:
 *
 * - **Commutative**: vvMerge(a, b) = vvMerge(b, a)
 *   Order of merge doesn't matter
 *
 * - **Associative**: vvMerge(vvMerge(a, b), c) = vvMerge(a, vvMerge(b, c))
 *   Grouping of merges doesn't matter
 *
 * - **Idempotent**: vvMerge(a, a) = a
 *   Merging with self is a no-op
 *
 * These properties guarantee that any replica can merge updates from any other
 * replica in any order, and all will converge to the same state. This is the
 * foundation of conflict-free replicated data types (CRDTs).
 *
 * ## Concurrent Conflict-Free Merges
 *
 * Version vectors enable concurrent merges without coordination:
 *
 * 1. **No locks needed**: Any replica can accept updates at any time
 * 2. **Eventual consistency**: All replicas converge given sufficient communication
 * 3. **Order independence**: Updates can arrive in any order
 *
 * When two writers concurrently create patches, each has a version vector that
 * doesn't include the other's patch. When merged, the result includes both,
 * and the semilattice properties ensure consistency.
 *
 * ## Relationship to Patch Causality
 *
 * In git-warp, each patch carries a version vector representing its causal
 * context - all patches it has observed. This enables:
 *
 * - **Happens-before detection**: If vv_a <= vv_b, then a happens-before b
 * - **Concurrency detection**: If neither vv_a <= vv_b nor vv_b <= vv_a, they're concurrent
 * - **Dot containment**: A dot (writerId, counter) is "observed" if vv[writerId] >= counter
 *
 * The version vector grows monotonically: each patch advances at least its own
 * writer's counter, and may advance others via merge.
 *
 * ## Partial Order
 *
 * Version vectors are partially ordered by vvDescends (componentwise <=):
 * - vv_a <= vv_b iff for all writerIds w: vv_a[w] <= vv_b[w]
 *
 * This forms a **causal order** where vv_a <= vv_b means "a causally precedes b"
 * or "b has observed all of a's history." Incomparable vectors represent
 * concurrent states.
 *
 * @module crdt/VersionVector
 */

/**
 * VersionVector - A map from writerId to counter representing observed operations.
 * Used to track causality and determine what operations a writer has observed.
 *
 * @typedef {Map<string, number>} VersionVector
 */

/**
 * Creates an empty VersionVector.
 *
 * @returns {VersionVector}
 */
export function createVersionVector() {
  return new Map();
}

/**
 * Increments the counter for a writer and returns the new Dot.
 * This mutates the VersionVector.
 *
 * @param {VersionVector} vv - The version vector to mutate
 * @param {string} writerId - The writer to increment
 * @returns {import('./Dot.js').Dot} The new dot representing this operation
 */
export function vvIncrement(vv, writerId) {
  const current = vv.get(writerId) || 0;
  const newCounter = current + 1;
  vv.set(writerId, newCounter);
  return createDot(writerId, newCounter);
}

/**
 * Merges two VersionVectors by taking the pointwise maximum.
 * Returns a new VersionVector; does not mutate inputs.
 *
 * Properties:
 * - Commutative: vvMerge(a, b) === vvMerge(b, a)
 * - Associative: vvMerge(vvMerge(a, b), c) === vvMerge(a, vvMerge(b, c))
 * - Idempotent: vvMerge(a, a) === a
 *
 * @param {VersionVector} a
 * @param {VersionVector} b
 * @returns {VersionVector}
 */
export function vvMerge(a, b) {
  const result = new Map(a);

  for (const [writerId, counter] of b) {
    const existing = result.get(writerId) || 0;
    result.set(writerId, Math.max(existing, counter));
  }

  return result;
}

/**
 * Checks if VersionVector a descends from (is >= than) VersionVector b.
 * a >= b means for every entry in b, a has an equal or greater counter.
 *
 * @param {VersionVector} a - The potentially descending vector
 * @param {VersionVector} b - The potential ancestor vector
 * @returns {boolean} True if a >= b componentwise
 */
export function vvDescends(a, b) {
  for (const [writerId, counter] of b) {
    const aCounter = a.get(writerId) || 0;
    if (aCounter < counter) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if a dot is contained within (observed by) the VersionVector.
 * A dot is contained if dot.counter <= vv[dot.writerId].
 *
 * @param {VersionVector} vv
 * @param {import('./Dot.js').Dot} dot
 * @returns {boolean}
 */
export function vvContains(vv, dot) {
  const counter = vv.get(dot.writerId) || 0;
  return dot.counter <= counter;
}

/**
 * Serializes a VersionVector to a plain object for CBOR encoding.
 * Keys are sorted for deterministic serialization.
 *
 * @param {VersionVector} vv
 * @returns {Object<string, number>}
 */
export function vvSerialize(vv) {
  const obj = {};
  const sortedKeys = [...vv.keys()].sort();

  for (const key of sortedKeys) {
    obj[key] = vv.get(key);
  }

  return obj;
}

/**
 * Deserializes a plain object back to a VersionVector.
 *
 * @param {Object<string, number>} obj
 * @returns {VersionVector}
 * @throws {Error} If any counter value is not a non-negative integer
 */
export function vvDeserialize(obj) {
  const vv = new Map();

  for (const [writerId, counter] of Object.entries(obj)) {
    if (typeof counter !== 'number' || !Number.isInteger(counter) || counter < 0) {
      throw new Error(`Invalid counter for writerId "${writerId}": ${counter}`);
    }
    if (counter > 0) {
      vv.set(writerId, counter);
    }
  }

  return vv;
}

/**
 * Clones a VersionVector.
 *
 * @param {VersionVector} vv
 * @returns {VersionVector}
 */
export function vvClone(vv) {
  return new Map(vv);
}

/**
 * Checks if two VersionVectors are equal.
 *
 * @param {VersionVector} a
 * @param {VersionVector} b
 * @returns {boolean}
 */
export function vvEqual(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  for (const [writerId, counter] of a) {
    if (b.get(writerId) !== counter) {
      return false;
    }
  }

  return true;
}
