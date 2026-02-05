import { encodeDot, decodeDot, compareDots } from './Dot.js';
import { vvContains } from './VersionVector.js';

/**
 * @fileoverview ORSet - Observed-Remove Set with Add-Wins Semantics
 *
 * An ORSet (Observed-Remove Set) is a CRDT that allows concurrent add and
 * remove operations on a set while guaranteeing convergence. This implementation
 * uses "add-wins" semantics: when an add and remove happen concurrently, the
 * add wins.
 *
 * ## Add-Wins Semantics
 *
 * The key insight of OR-Sets is that removals only affect adds they have
 * *observed*. When you remove an element, you're really saying "remove all
 * the add operations I've seen for this element." Any concurrent add (one
 * you haven't seen) survives.
 *
 * This is implemented via dots:
 * - Each add operation is tagged with a unique dot (writerId, counter)
 * - Remove records which dots it has observed (the "observed set")
 * - The element is present if ANY of its dots is not tombstoned
 *
 * Example of add-wins:
 * ```
 * Writer A: add("x") with dot (A,1)
 * Writer B: (concurrently) remove("x") with observed dots {}
 * Result: "x" is present (dot (A,1) was not observed by B's remove)
 * ```
 *
 * Example of remove-wins (when add was observed):
 * ```
 * Writer A: add("x") with dot (A,1)
 * Writer B: (after sync) remove("x") with observed dots {(A,1)}
 * Result: "x" is absent (all its dots are tombstoned)
 * ```
 *
 * ## Global Tombstones
 *
 * This implementation uses a **global tombstone set** rather than per-element
 * tombstones. This is an optimization for space efficiency:
 *
 * - **Global tombstones**: A single Set<encodedDot> holds all tombstoned dots
 *   across all elements. When checking if an element is present, we check if
 *   ANY of its dots is NOT in the global tombstone set.
 *
 * - **Why global**: In a graph database, nodes and edges may be added/removed
 *   many times. Per-element tombstone tracking would require storing removed
 *   dots with each element forever. Global tombstones allow efficient compaction.
 *
 * - **Correctness**: Tombstones are dots, not elements. A dot uniquely identifies
 *   one add operation. Tombstoning dot (A,5) only affects that specific add,
 *   not any other add of the same element with a different dot.
 *
 * ## Semilattice Properties
 *
 * orsetJoin forms a join-semilattice:
 * - **Commutative**: orsetJoin(a, b) equals orsetJoin(b, a)
 * - **Associative**: orsetJoin(orsetJoin(a, b), c) equals orsetJoin(a, orsetJoin(b, c))
 * - **Idempotent**: orsetJoin(a, a) equals a
 *
 * The join takes the union of both entries and tombstones. This ensures:
 * - All adds from all replicas are preserved
 * - All removes from all replicas are preserved
 * - Convergence regardless of merge order
 *
 * ## Garbage Collection Safety
 *
 * The orsetCompact function removes tombstoned dots to reclaim memory, but
 * must do so safely to avoid "zombie" resurrections:
 *
 * **GC Safety Invariant**: A tombstoned dot may only be compacted if ALL
 * replicas have observed it. This is tracked via the version vector: if
 * vvContains(includedVV, dot) is true for the "included" frontier, then
 * all replicas have seen this dot and its tombstone.
 *
 * **What happens if violated**: If we compact (A,5) before replica B has seen
 * it, and B later sends an add with dot (A,5), we'd have no tombstone to
 * suppress it, causing a resurrection.
 *
 * @module crdt/ORSet
 */

/**
 * ORSet (Observed-Remove Set) - A CRDT set that supports add and remove operations.
 *
 * This is a GLOBAL OR-Set (one per category, not per element). It tracks:
 * - entries: Map<element, Set<encodedDot>> - elements and the dots that added them
 * - tombstones: Set<encodedDot> - global tombstones for removed dots
 *
 * An element is present if it has at least one non-tombstoned dot.
 *
 * @typedef {Object} ORSet
 * @property {Map<*, Set<string>>} entries - element -> dots that added it
 * @property {Set<string>} tombstones - global tombstones
 */

/**
 * Creates an empty ORSet.
 *
 * @returns {ORSet}
 */
export function createORSet() {
  return {
    entries: new Map(),
    tombstones: new Set(),
  };
}

/**
 * Adds an element to the ORSet with the given dot.
 * Mutates the set.
 *
 * @param {ORSet} set - The ORSet to mutate
 * @param {*} element - The element to add
 * @param {import('./Dot.js').Dot} dot - The dot representing this add operation
 */
export function orsetAdd(set, element, dot) {
  const encoded = encodeDot(dot);

  if (!set.entries.has(element)) {
    set.entries.set(element, new Set());
  }

  set.entries.get(element).add(encoded);
}

/**
 * Removes an element by adding its observed dots to the tombstones.
 * Mutates the set.
 *
 * @param {ORSet} set - The ORSet to mutate
 * @param {Set<string>} observedDots - The encoded dots to tombstone
 */
export function orsetRemove(set, observedDots) {
  for (const encodedDot of observedDots) {
    set.tombstones.add(encodedDot);
  }
}

/**
 * Checks if an element is present in the ORSet.
 * An element is present if it has at least one non-tombstoned dot.
 *
 * @param {ORSet} set - The ORSet to check
 * @param {*} element - The element to check
 * @returns {boolean}
 */
export function orsetContains(set, element) {
  const dots = set.entries.get(element);
  if (!dots) {
    return false;
  }

  for (const encodedDot of dots) {
    if (!set.tombstones.has(encodedDot)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns all present elements in the ORSet.
 * Only returns elements that have at least one non-tombstoned dot.
 *
 * @param {ORSet} set - The ORSet
 * @returns {Array<*>} Array of present elements
 */
export function orsetElements(set) {
  const result = [];

  for (const element of set.entries.keys()) {
    if (orsetContains(set, element)) {
      result.push(element);
    }
  }

  return result;
}

/**
 * Returns the non-tombstoned dots for an element.
 *
 * @param {ORSet} set - The ORSet
 * @param {*} element - The element
 * @returns {Set<string>} Set of encoded dots that are not tombstoned
 */
export function orsetGetDots(set, element) {
  const dots = set.entries.get(element);
  if (!dots) {
    return new Set();
  }

  const result = new Set();
  for (const encodedDot of dots) {
    if (!set.tombstones.has(encodedDot)) {
      result.add(encodedDot);
    }
  }

  return result;
}

/**
 * Joins two ORSets by taking the union of entries and tombstones.
 * Returns a new ORSet; does not mutate inputs.
 *
 * Properties:
 * - Commutative: orsetJoin(a, b) equals orsetJoin(b, a)
 * - Associative: orsetJoin(orsetJoin(a, b), c) equals orsetJoin(a, orsetJoin(b, c))
 * - Idempotent: orsetJoin(a, a) equals a
 *
 * @param {ORSet} a
 * @param {ORSet} b
 * @returns {ORSet}
 */
export function orsetJoin(a, b) {
  const result = createORSet();

  // Union entries from a
  for (const [element, dots] of a.entries) {
    result.entries.set(element, new Set(dots));
  }

  // Union entries from b
  for (const [element, dots] of b.entries) {
    if (!result.entries.has(element)) {
      result.entries.set(element, new Set());
    }
    const resultDots = result.entries.get(element);
    for (const dot of dots) {
      resultDots.add(dot);
    }
  }

  // Union tombstones
  for (const dot of a.tombstones) {
    result.tombstones.add(dot);
  }
  for (const dot of b.tombstones) {
    result.tombstones.add(dot);
  }

  return result;
}

/**
 * Compacts the ORSet by removing tombstoned dots that are <= includedVV.
 * Mutates the set.
 *
 * ## GC Safety Invariant
 *
 * This function implements safe garbage collection for OR-Set tombstones.
 * The invariant is: **only compact dots that ALL replicas have observed**.
 *
 * The `includedVV` parameter represents the "stable frontier" - the version
 * vector that all known replicas have reached. A dot (writerId, counter) is
 * safe to compact if:
 *
 * 1. The dot is TOMBSTONED (it was removed)
 * 2. The dot is <= includedVV (all replicas have seen it)
 *
 * ### Why both conditions?
 *
 * - **Condition 1 (tombstoned)**: Live dots must never be compacted. Removing
 *   a live dot would make the element disappear incorrectly.
 *
 * - **Condition 2 (<= includedVV)**: If a replica hasn't seen this dot yet,
 *   it might send it later. Without the tombstone, we'd have no record that
 *   it was deleted, causing resurrection.
 *
 * ### Correctness Proof Sketch
 *
 * After compaction of dot D:
 * - D is removed from entries (if present)
 * - D is removed from tombstones
 *
 * If replica B later sends D:
 * - Since D <= includedVV, B has already observed D
 * - B's state must also have D tombstoned (or never had it)
 * - Therefore B cannot send D as a live add
 *
 * @param {ORSet} set - The ORSet to compact
 * @param {import('./VersionVector.js').VersionVector} includedVV - The stable frontier version vector.
 *   All replicas are known to have observed at least this causal context.
 */
export function orsetCompact(set, includedVV) {
  for (const [element, dots] of set.entries) {
    for (const encodedDot of dots) {
      const dot = decodeDot(encodedDot);
      // Only compact if: (1) dot is tombstoned AND (2) dot <= includedVV
      if (set.tombstones.has(encodedDot) && vvContains(includedVV, dot)) {
        dots.delete(encodedDot);
        set.tombstones.delete(encodedDot);
      }
    }
    if (dots.size === 0) {
      set.entries.delete(element);
    }
  }
}

/**
 * Serializes an ORSet to a plain object for CBOR encoding.
 * Entries are sorted by element (stringified), dots within entries are sorted.
 * Tombstones are sorted.
 *
 * @param {ORSet} set
 * @returns {{entries: Array<[*, string[]]>, tombstones: string[]}}
 */
export function orsetSerialize(set) {
  // Serialize entries: convert Map to array of [element, sortedDots]
  const entriesArray = [];
  for (const [element, dots] of set.entries) {
    const sortedDots = [...dots].sort((a, b) => {
      const dotA = decodeDot(a);
      const dotB = decodeDot(b);
      return compareDots(dotA, dotB);
    });
    entriesArray.push([element, sortedDots]);
  }

  // Sort entries by element (stringified for consistency)
  entriesArray.sort((a, b) => {
    const keyA = String(a[0]);
    const keyB = String(b[0]);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  // Serialize tombstones: sorted array
  const sortedTombstones = [...set.tombstones].sort((a, b) => {
    const dotA = decodeDot(a);
    const dotB = decodeDot(b);
    return compareDots(dotA, dotB);
  });

  return {
    entries: entriesArray,
    tombstones: sortedTombstones,
  };
}

/**
 * Deserializes a plain object back to an ORSet.
 *
 * @param {{entries?: Array<[*, string[]]>, tombstones?: string[]}} obj
 * @returns {ORSet}
 */
export function orsetDeserialize(obj) {
  const set = createORSet();

  // Deserialize entries
  if (obj.entries && Array.isArray(obj.entries)) {
    for (const [element, dots] of obj.entries) {
      if (Array.isArray(dots)) {
        set.entries.set(element, new Set(dots));
      }
    }
  }

  // Deserialize tombstones
  if (obj.tombstones && Array.isArray(obj.tombstones)) {
    for (const dot of obj.tombstones) {
      set.tombstones.add(dot);
    }
  }

  return set;
}
