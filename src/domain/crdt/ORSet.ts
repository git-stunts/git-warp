import { Dot } from './Dot.ts';
import CrdtError from '../errors/CrdtError.ts';

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
 * ## Global Tombstones
 *
 * This implementation uses a **global tombstone set** rather than per-element
 * tombstones. This is an optimization for space efficiency.
 *
 * ## Semilattice Properties
 *
 * join() forms a join-semilattice:
 * - **Commutative**: a.join(b) equals b.join(a)
 * - **Associative**: a.join(b).join(c) equals a.join(b.join(c))
 * - **Idempotent**: a.join(a) equals a
 *
 * @module crdt/ORSet
 */

import type VersionVector from './VersionVector.ts';

/** Serialized form of an ORSet for CBOR encoding. */
interface SerializedORSet {
  entries: Array<[string, string[]]>;
  tombstones: string[];
}

/** Input for deserialization — entries and tombstones may be absent. */
interface DeserializeInput {
  entries?: Array<[string, string[]]>;
  tombstones?: string[];
}

/**
 * Throws if the dot is not a well-formed {writerId: string, counter: integer}.
 */
function _assertValidDot(dot: Dot): void {
  if (dot === null || dot === undefined || typeof dot.writerId !== 'string' || !Number.isInteger(dot.counter)) {
    throw new CrdtError(`ORSet.add: invalid dot -- expected {writerId: string, counter: integer}, got ${JSON.stringify(dot)}`, { // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      code: 'E_CRDT_MALFORMED',
      context: { dot },
    });
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
  /** Element to dots that added it. */
  entries: Map<string, Set<string>>;

  /** Global tombstones for removed dots. */
  tombstones: Set<string>;

  /**
   * Creates an ORSet from existing data structures.
   */
  constructor(entries: Map<string, Set<string>>, tombstones: Set<string>) {
    this.entries = entries;
    this.tombstones = tombstones;
  }

  /** Creates an empty ORSet. */
  static empty(): ORSet {
    return new ORSet(new Map(), new Set());
  }

  /** Deserializes a plain object back to an ORSet. */
  static deserialize(obj: DeserializeInput): ORSet {
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
   */
  add(element: string, dot: Dot): void {
    _assertValidDot(dot);
    const encoded = Dot.encode(dot);

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
   */
  remove(observedDots: Set<string>): void {
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
   */
  contains(element: string): boolean {
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
   */
  elements(): string[] {
    const result: string[] = [];
    for (const element of this.entries.keys()) {
      if (this.contains(element)) {
        result.push(element);
      }
    }
    return result;
  }

  /**
   * Counts the total number of dot entries across all elements
   * (tombstoned and live alike).
   */
  countEntries(): number {
    let count = 0;
    for (const dots of this.entries.values()) {
      count += dots.size;
    }
    return count;
  }

  /**
   * Counts live (non-tombstoned) dots across all elements.
   */
  countLiveDots(): number {
    let count = 0;
    for (const dots of this.entries.values()) {
      for (const dot of dots) {
        if (!this.tombstones.has(dot)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Counts tombstones that reference entry dots. Only counts tombstones
   * that actually correspond to dots in `entries` — floating tombstones
   * (for dots the replica has never observed as live) are ignored.
   */
  countTombstones(): number {
    let count = 0;
    for (const dots of this.entries.values()) {
      for (const dot of dots) {
        if (this.tombstones.has(dot)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Returns the non-tombstoned dots for an element.
   */
  getDots(element: string): Set<string> {
    const dots = this.entries.get(element);
    if (!dots) {
      return new Set<string>();
    }

    const result = new Set<string>();
    for (const encodedDot of dots) {
      if (!this.tombstones.has(encodedDot)) {
        result.add(encodedDot);
      }
    }

    return result;
  }

  /**
   * Returns true iff the element is tagged by the given encoded dot.
   * Tombstone status is ignored — this tests raw entry membership.
   */
  hasDot(element: string, encodedDot: string): boolean {
    const dots = this.entries.get(element);
    return dots !== undefined && dots.has(encodedDot);
  }

  /**
   * Returns true iff the given encoded dot has been tombstoned.
   */
  isTombstoned(encodedDot: string): boolean {
    return this.tombstones.has(encodedDot);
  }

  /**
   * Iterates `[element, dots]` pairs across all entries. The yielded
   * `dots` set includes tombstoned and live dots alike.
   */
  entriesIter(): IterableIterator<[string, ReadonlySet<string>]> {
    return this.entries.entries();
  }

  /**
   * Iterates every encoded dot across all entries, tombstoned or not.
   */
  *entryDotsIter(): IterableIterator<string> {
    for (const dots of this.entries.values()) {
      for (const encodedDot of dots) {
        yield encodedDot;
      }
    }
  }

  /**
   * Iterates every tombstoned encoded dot, including floating
   * tombstones that have no corresponding entry.
   */
  tombstonesIter(): IterableIterator<string> {
    return this.tombstones.values();
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
   */
  join(other: ORSet): ORSet {
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
   */
  compact(includedVV: VersionVector): void {
    const toDelete = _collectCompactableDots(this, includedVV);
    _applyCompaction(this, toDelete);
  }

  /** Creates a deep clone. */
  clone(): ORSet {
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
   * Returns a clone that retains only entries whose element matches
   * the predicate. All tombstones are copied verbatim, regardless of
   * whether their owning element survives the filter.
   */
  scopedClone(includeElement: (element: string) => boolean): ORSet {
    const result = ORSet.empty();
    for (const [element, dots] of this.entries) {
      if (includeElement(element)) {
        result.entries.set(element, new Set(dots));
      }
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
   */
  serialize(): SerializedORSet {
    return {
      entries: _serializeEntries(this.entries),
      tombstones: _sortEncodedDots(this.tombstones),
    };
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Copies all entries by cloning each dot set into the target map. */
function _copyEntries(source: Map<string, Set<string>>, target: Map<string, Set<string>>): void {
  for (const [element, dots] of source) {
    target.set(element, new Set(dots));
  }
}

/** Merges entries from source into target, unioning dot sets for existing elements. */
function _mergeEntries(source: Map<string, Set<string>>, target: Map<string, Set<string>>): void {
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

/** Adds all values from source into target set. */
function _unionSets(source: Set<string>, target: Set<string>): void {
  for (const item of source) {
    target.add(item);
  }
}

/** Identifies dots eligible for compaction: tombstoned AND within the stable frontier. */
function _collectCompactableDots(set: ORSet, includedVV: VersionVector): Array<{ element: string; dot: string }> {
  const toDelete: Array<{ element: string; dot: string }> = [];
  for (const [element, dots] of set.entries) {
    for (const encodedDot of dots) {
      const dot = Dot.decode(encodedDot);
      if (set.tombstones.has(encodedDot) && includedVV.contains(dot)) {
        toDelete.push({ element, dot: encodedDot });
      }
    }
  }
  return toDelete;
}

/** Applies compaction by removing identified dots from entries and tombstones. */
function _applyCompaction(set: ORSet, toDelete: Array<{ element: string; dot: string }>): void {
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

/** Sorts encoded dots by their decoded (writerId, counter) order. */
function _sortEncodedDots(encodedDots: Set<string> | Iterable<string>): string[] {
  const pairs: Array<{ encoded: string; decoded: Dot }> = [];
  for (const encoded of encodedDots) {
    pairs.push({ encoded, decoded: Dot.decode(encoded) });
  }
  pairs.sort((a, b) => Dot.compare(a.decoded, b.decoded));
  return pairs.map((p) => p.encoded);
}

/** Serializes OR-Set entries as sorted [element, sortedDots[]] pairs. */
function _serializeEntries(entries: Map<string, Set<string>>): Array<[string, string[]]> {
  const result: Array<[string, string[]]> = [];
  for (const [element, dots] of entries) {
    result.push([element, _sortEncodedDots(dots)]);
  }
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}

/** Populates an entries map from a serialized entries array. */
function _deserializeEntriesInto(entries: Array<[string, string[]]> | undefined, target: Map<string, Set<string>>): void {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const [element, dots] of entries) {
    if (Array.isArray(dots)) {
      target.set(element, new Set(dots));
    }
  }
}

/** Populates a tombstone set from a serialized tombstones array. */
function _deserializeTombstonesInto(tombstones: string[] | undefined, target: Set<string>): void {
  if (!Array.isArray(tombstones)) {
    return;
  }
  for (const dot of tombstones) {
    target.add(dot);
  }
}
