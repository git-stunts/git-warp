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
 * @property {Map<string, Set<string>>} entries - element -> dots that added it
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
 * @param {string} element - The element to add
 * @param {import('./Dot.js').Dot} dot - The dot representing this add operation
 */
export function orsetAdd(set, element, dot) {
  assertValidDot(dot);
  const encoded = encodeDot(dot);

  let dots = set.entries.get(element);
  if (!dots) {
    dots = new Set();
    set.entries.set(element, dots);
  }

  dots.add(encoded);
}

/**
 * Throws if the dot is not a well-formed {writerId: string, counter: integer}.
 *
 * @param {import('./Dot.js').Dot} dot
 * @throws {Error} If the dot is null, undefined, or structurally invalid
 */
function assertValidDot(dot) {
  if (dot === null || dot === undefined || typeof dot.writerId !== 'string' || !Number.isInteger(dot.counter)) {
    throw new Error(`orsetAdd: invalid dot -- expected {writerId: string, counter: integer}, got ${JSON.stringify(dot)}`);
  }
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
 * @param {string} element - The element to check
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
 * @returns {string[]} Array of present elements
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
 * @param {string} element - The element
 * @returns {Set<string>} Set of encoded dots that are not tombstoned
 */
export function orsetGetDots(set, element) {
  const dots = set.entries.get(element);
  if (!dots) {
    return /** @type {Set<string>} */ (new Set());
  }

  /** @type {Set<string>} */
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
  copyEntries(a.entries, result.entries);
  mergeEntries(b.entries, result.entries);
  unionSets(a.tombstones, result.tombstones);
  unionSets(b.tombstones, result.tombstones);
  return result;
}

/**
 * Copies all entries by cloning each dot set into the target map.
 *
 * @param {Map<string, Set<string>>} source
 * @param {Map<string, Set<string>>} target
 */
function copyEntries(source, target) {
  for (const [element, dots] of source) {
    target.set(element, new Set(dots));
  }
}

/**
 * Merges entries from source into target, unioning dot sets for existing elements.
 *
 * @param {Map<string, Set<string>>} source
 * @param {Map<string, Set<string>>} target
 */
function mergeEntries(source, target) {
  for (const [element, dots] of source) {
    const existing = target.get(element);
    if (existing !== undefined) {
      for (const dot of dots) {
        existing.add(dot);
      }
    } else {
      target.set(element, new Set(dots));
    }
  }
}

/**
 * Adds all values from source into target set.
 *
 * @param {Set<string>} source
 * @param {Set<string>} target
 */
function unionSets(source, target) {
  for (const item of source) {
    target.add(item);
  }
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
  const toDelete = collectCompactableDots(set, includedVV);
  applyCompaction(set, toDelete);
}

/**
 * Identifies dots eligible for compaction: tombstoned AND within the stable frontier.
 *
 * @param {ORSet} set
 * @param {import('./VersionVector.js').VersionVector} includedVV
 * @returns {Array<{element: string, dot: string}>}
 */
function collectCompactableDots(set, includedVV) {
  /** @type {Array<{element: string, dot: string}>} */
  const toDelete = [];
  for (const [element, dots] of set.entries) {
    for (const encodedDot of dots) {
      const dot = decodeDot(encodedDot);
      if (set.tombstones.has(encodedDot) && vvContains(includedVV, dot)) {
        toDelete.push({ element, dot: encodedDot });
      }
    }
  }
  return toDelete;
}

/**
 * Applies compaction by removing identified dots from entries and tombstones.
 *
 * @param {ORSet} set
 * @param {Array<{element: string, dot: string}>} toDelete
 */
function applyCompaction(set, toDelete) {
  for (const { element, dot: encodedDot } of toDelete) {
    const dots = set.entries.get(element);
    if (dots !== undefined) {
      dots.delete(encodedDot);
      if (dots.size === 0) {
        set.entries.delete(element);
      }
    }
    set.tombstones.delete(encodedDot);
  }
}

/**
 * Creates a deep clone of an ORSet.
 *
 * @param {ORSet} set - The ORSet to clone
 * @returns {ORSet} A new ORSet with independent data structures
 */
export function orsetClone(set) {
  const result = createORSet();
  for (const [element, dots] of set.entries) {
    result.entries.set(element, new Set(dots));
  }
  for (const dot of set.tombstones) {
    result.tombstones.add(dot);
  }
  return result;
}

/**
 * Serializes an ORSet to a plain object for CBOR encoding.
 * Entries are sorted by element (stringified), dots within entries are sorted.
 * Tombstones are sorted.
 *
 * @param {ORSet} set
 * @returns {{entries: Array<[string, string[]]>, tombstones: string[]}}
 */
export function orsetSerialize(set) {
  return {
    entries: serializeEntries(set.entries),
    tombstones: sortEncodedDots(set.tombstones),
  };
}

/**
 * Sorts encoded dots by their decoded (writerId, counter) order.
 *
 * @param {Set<string>|Iterable<string>} encodedDots
 * @returns {string[]} Sorted encoded dot strings
 */
function sortEncodedDots(encodedDots) {
  /** @type {Array<{encoded: string, decoded: import('./Dot.js').Dot}>} */
  const pairs = [];
  for (const encoded of encodedDots) {
    pairs.push({ encoded, decoded: decodeDot(encoded) });
  }
  pairs.sort((a, b) => compareDots(a.decoded, b.decoded));
  return pairs.map((p) => p.encoded);
}

/**
 * Serializes OR-Set entries as sorted [element, sortedDots[]] pairs.
 *
 * @param {Map<string, Set<string>>} entries
 * @returns {Array<[string, string[]]>}
 */
function serializeEntries(entries) {
  /** @type {Array<[string, string[]]>} */
  const result = [];
  for (const [element, dots] of entries) {
    result.push([element, sortEncodedDots(dots)]);
  }
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}

/**
 * Deserializes a plain object back to an ORSet.
 *
 * @param {{entries?: Array<[string, string[]]>, tombstones?: string[]}} obj
 * @returns {ORSet}
 */
export function orsetDeserialize(obj) {
  const set = createORSet();
  deserializeEntriesInto(obj.entries, set.entries);
  deserializeTombstonesInto(obj.tombstones, set.tombstones);
  return set;
}

/**
 * Populates an entries map from a serialized entries array.
 *
 * @param {Array<[string, string[]]>|undefined} entries
 * @param {Map<string, Set<string>>} target
 */
function deserializeEntriesInto(entries, target) {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const [element, dots] of entries) {
    if (Array.isArray(dots)) {
      target.set(element, new Set(dots));
    }
  }
}

/**
 * Populates a tombstone set from a serialized tombstones array.
 *
 * @param {string[]|undefined} tombstones
 * @param {Set<string>} target
 */
function deserializeTombstonesInto(tombstones, target) {
  if (!Array.isArray(tombstones)) {
    return;
  }
  for (const dot of tombstones) {
    target.add(dot);
  }
}
