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
 * join() forms a join-semilattice:
 * - **Commutative**: a.join(b) equals b.join(a)
 * - **Associative**: a.join(b).join(c) equals a.join(b.join(c))
 * - **Idempotent**: a.join(a) equals a
 *
 * The join takes the union of both entries and tombstones. This ensures:
 * - All adds from all replicas are preserved
 * - All removes from all replicas are preserved
 * - Convergence regardless of merge order
 *
 * ## Garbage Collection Safety
 *
 * The compact() method removes tombstoned dots to reclaim memory, but
 * must do so safely to avoid "zombie" resurrections:
 *
 * **GC Safety Invariant**: A tombstoned dot may only be compacted if ALL
 * replicas have observed it. This is tracked via the version vector: if
 * includedVV.contains(dot) is true for the "included" frontier, then
 * all replicas have seen this dot and its tombstone.
 *
 * **What happens if violated**: If we compact (A,5) before replica B has seen
 * it, and B later sends an add with dot (A,5), we'd have no tombstone to
 * suppress it, causing a resurrection.
 *
 * @module crdt/ORSet
 */

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
 * ORSet (Observed-Remove Set) — a CRDT set supporting concurrent add
 * and remove operations with add-wins semantics.
 *
 * This is a GLOBAL OR-Set (one per category, not per element). It tracks:
 * - entries: Map<element, Set<encodedDot>> — elements and the dots that added them
 * - tombstones: Set<encodedDot> — global tombstones for removed dots
 *
 * An element is present if it has at least one non-tombstoned dot.
 *
 * Fields are public because JoinReducer (the merge engine) needs direct
 * access for performance-critical operations.
 */
export default class ORSet {
  /**
   * Element → dots that added it.
   * @type {Map<string, Set<string>>}
   */
  entries;

  /**
   * Global tombstones for removed dots.
   * @type {Set<string>}
   */
  tombstones;

  /**
   * Creates an ORSet from existing data structures.
   *
   * @param {Map<string, Set<string>>} entries
   * @param {Set<string>} tombstones
   */
  constructor(entries, tombstones) {
    this.entries = entries;
    this.tombstones = tombstones;
  }

  /**
   * Creates an empty ORSet.
   *
   * @returns {ORSet}
   */
  static empty() {
    return new ORSet(new Map(), new Set());
  }

  /**
   * Deserializes a plain object back to an ORSet.
   *
   * @param {{entries?: Array<[string, string[]]>, tombstones?: string[]}} obj
   * @returns {ORSet}
   */
  static deserialize(obj) {
    const set = ORSet.empty();
    _deserializeEntriesInto(obj.entries, set.entries);
    _deserializeTombstonesInto(obj.tombstones, set.tombstones);
    return set;
  }

  // ---------------------------------------------------------------------------
  // Mutation operations
  // ---------------------------------------------------------------------------

  /**
   * Adds an element with the given dot.
   * Mutates the set.
   *
   * @param {string} element - The element to add
   * @param {import('./Dot.js').Dot} dot - The dot representing this add operation
   */
  add(element, dot) {
    assertValidDot(dot);
    const encoded = encodeDot(dot);

    let dots = this.entries.get(element);
    if (!dots) {
      dots = new Set();
      this.entries.set(element, dots);
    }

    dots.add(encoded);
  }

  /**
   * Removes an element by adding its observed dots to the tombstones.
   * Mutates the set.
   *
   * @param {Set<string>} observedDots - The encoded dots to tombstone
   */
  remove(observedDots) {
    for (const encodedDot of observedDots) {
      this.tombstones.add(encodedDot);
    }
  }

  // ---------------------------------------------------------------------------
  // Query operations
  // ---------------------------------------------------------------------------

  /**
   * Checks if an element is present.
   * An element is present if it has at least one non-tombstoned dot.
   *
   * @param {string} element
   * @returns {boolean}
   */
  contains(element) {
    const dots = this.entries.get(element);
    if (!dots) {
      return false;
    }

    for (const encodedDot of dots) {
      if (!this.tombstones.has(encodedDot)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns all present elements.
   * Only returns elements that have at least one non-tombstoned dot.
   *
   * @returns {string[]}
   */
  elements() {
    const result = [];
    for (const element of this.entries.keys()) {
      if (this.contains(element)) {
        result.push(element);
      }
    }
    return result;
  }

  /**
   * Returns the non-tombstoned dots for an element.
   *
   * @param {string} element
   * @returns {Set<string>} Set of encoded dots that are not tombstoned
   */
  getDots(element) {
    const dots = this.entries.get(element);
    if (!dots) {
      return /** @type {Set<string>} */ (new Set());
    }

    /** @type {Set<string>} */
    const result = new Set();
    for (const encodedDot of dots) {
      if (!this.tombstones.has(encodedDot)) {
        result.add(encodedDot);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // CRDT operations
  // ---------------------------------------------------------------------------

  /**
   * Joins with another ORSet by taking the union of entries and tombstones.
   * Returns a new ORSet; does not mutate either input.
   *
   * Properties:
   * - Commutative: a.join(b) equals b.join(a)
   * - Associative: a.join(b).join(c) equals a.join(b.join(c))
   * - Idempotent: a.join(a) equals a
   *
   * @param {ORSet} other
   * @returns {ORSet}
   */
  join(other) {
    const result = ORSet.empty();
    _copyEntries(this.entries, result.entries);
    _mergeEntries(other.entries, result.entries);
    _unionSets(this.tombstones, result.tombstones);
    _unionSets(other.tombstones, result.tombstones);
    return result;
  }

  /**
   * Compacts the ORSet by removing tombstoned dots that are <= includedVV.
   * Mutates the set.
   *
   * ## GC Safety Invariant
   *
   * Only compact dots that ALL replicas have observed. The `includedVV`
   * parameter represents the "stable frontier" — the version vector that
   * all known replicas have reached.
   *
   * @param {import('./VersionVector.js').default} includedVV - The stable frontier.
   */
  compact(includedVV) {
    const toDelete = _collectCompactableDots(this, includedVV);
    _applyCompaction(this, toDelete);
  }

  /**
   * Creates a deep clone.
   *
   * @returns {ORSet}
   */
  clone() {
    const result = ORSet.empty();
    for (const [element, dots] of this.entries) {
      result.entries.set(element, new Set(dots));
    }
    for (const dot of this.tombstones) {
      result.tombstones.add(dot);
    }
    return result;
  }

  /**
   * Serializes to a plain object for CBOR encoding.
   * Entries are sorted by element; dots within entries are sorted.
   * Tombstones are sorted.
   *
   * @returns {{entries: Array<[string, string[]]>, tombstones: string[]}}
   */
  serialize() {
    return {
      entries: _serializeEntries(this.entries),
      tombstones: _sortEncodedDots(this.tombstones),
    };
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Copies all entries by cloning each dot set into the target map.
 *
 * @param {Map<string, Set<string>>} source
 * @param {Map<string, Set<string>>} target
 */
function _copyEntries(source, target) {
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
function _mergeEntries(source, target) {
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
function _unionSets(source, target) {
  for (const item of source) {
    target.add(item);
  }
}

/**
 * Identifies dots eligible for compaction: tombstoned AND within the stable frontier.
 *
 * @param {ORSet} set
 * @param {import('./VersionVector.js').default} includedVV
 * @returns {Array<{element: string, dot: string}>}
 */
function _collectCompactableDots(set, includedVV) {
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
function _applyCompaction(set, toDelete) {
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
 * Sorts encoded dots by their decoded (writerId, counter) order.
 *
 * @param {Set<string>|Iterable<string>} encodedDots
 * @returns {string[]}
 */
function _sortEncodedDots(encodedDots) {
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
function _serializeEntries(entries) {
  /** @type {Array<[string, string[]]>} */
  const result = [];
  for (const [element, dots] of entries) {
    result.push([element, _sortEncodedDots(dots)]);
  }
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}

/**
 * Populates an entries map from a serialized entries array.
 *
 * @param {Array<[string, string[]]>|undefined} entries
 * @param {Map<string, Set<string>>} target
 */
function _deserializeEntriesInto(entries, target) {
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
function _deserializeTombstonesInto(tombstones, target) {
  if (!Array.isArray(tombstones)) {
    return;
  }
  for (const dot of tombstones) {
    target.add(dot);
  }
}

// =============================================================================
// Backward-compatibility shims
//
// These free functions delegate to the ORSet class. They exist so that
// existing callers (and the extensive test suite) continue to work without
// modification. New code should use the class API directly.
// =============================================================================

/**
 * Coerces a value to an ORSet. If already an ORSet, returns as-is.
 * If a plain object with entries/tombstones, wraps it.
 *
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @returns {ORSet}
 */
function _coerce(set) {
  if (set instanceof ORSet) {
    return set;
  }
  return new ORSet(set.entries, set.tombstones);
}

/**
 * Creates an empty ORSet.
 *
 * @deprecated Use {@link ORSet.empty}
 * @returns {ORSet}
 */
export function createORSet() {
  return ORSet.empty();
}

/**
 * Adds an element to the ORSet with the given dot.
 *
 * @deprecated Use {@link ORSet#add}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @param {string} element
 * @param {import('./Dot.js').Dot} dot
 */
export function orsetAdd(set, element, dot) {
  _coerce(set).add(element, dot);
}

/**
 * Removes an element by adding its observed dots to the tombstones.
 *
 * @deprecated Use {@link ORSet#remove}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @param {Set<string>} observedDots
 */
export function orsetRemove(set, observedDots) {
  _coerce(set).remove(observedDots);
}

/**
 * Checks if an element is present in the ORSet.
 *
 * @deprecated Use {@link ORSet#contains}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @param {string} element
 * @returns {boolean}
 */
export function orsetContains(set, element) {
  return _coerce(set).contains(element);
}

/**
 * Returns all present elements in the ORSet.
 *
 * @deprecated Use {@link ORSet#elements}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @returns {string[]}
 */
export function orsetElements(set) {
  return _coerce(set).elements();
}

/**
 * Returns the non-tombstoned dots for an element.
 *
 * @deprecated Use {@link ORSet#getDots}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @param {string} element
 * @returns {Set<string>}
 */
export function orsetGetDots(set, element) {
  return _coerce(set).getDots(element);
}

/**
 * Joins two ORSets by taking the union of entries and tombstones.
 *
 * @deprecated Use {@link ORSet#join}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} a
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} b
 * @returns {ORSet}
 */
export function orsetJoin(a, b) {
  return _coerce(a).join(_coerce(b));
}

/**
 * Compacts the ORSet by removing tombstoned dots <= includedVV.
 *
 * @deprecated Use {@link ORSet#compact}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @param {import('./VersionVector.js').default} includedVV
 */
export function orsetCompact(set, includedVV) {
  _coerce(set).compact(includedVV);
}

/**
 * Creates a deep clone of an ORSet.
 *
 * @deprecated Use {@link ORSet#clone}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @returns {ORSet}
 */
export function orsetClone(set) {
  return _coerce(set).clone();
}

/**
 * Serializes an ORSet to a plain object.
 *
 * @deprecated Use {@link ORSet#serialize}
 * @param {ORSet | {entries: Map<string, Set<string>>, tombstones: Set<string>}} set
 * @returns {{entries: Array<[string, string[]]>, tombstones: string[]}}
 */
export function orsetSerialize(set) {
  return _coerce(set).serialize();
}

/**
 * Deserializes a plain object back to an ORSet.
 *
 * @deprecated Use {@link ORSet.deserialize}
 * @param {{entries?: Array<[string, string[]]>, tombstones?: string[]}} obj
 * @returns {ORSet}
 */
export function orsetDeserialize(obj) {
  return ORSet.deserialize(obj);
}
