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

/**
 * Throws if the dot is not a well-formed {writerId: string, counter: integer}.
 */
function _assertValidDot(dot: Dot): void {
  if (dot === null || dot === undefined || typeof dot.writerId !== 'string' || !Number.isInteger(dot.counter)) {
    throw new CrdtError('ORSet.add: invalid dot -- expected {writerId: string, counter: integer}', {
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
   * Validates and copies both levels of entry storage and every tombstone.
   * Floating tombstones and empty string elements remain valid.
   */
  constructor(entries: Map<string, Set<string>>, tombstones: Set<string>) {
    if (!(entries instanceof Map)) {
      throw new CrdtError('ORSet entries must be a Map', { code: 'E_CRDT_INVALID_ENTRIES' });
    }
    this.entries = new Map();
    for (const [element, dots] of entries) {
      if (typeof element !== 'string') { throw new CrdtError('ORSet element must be a string'); }
      this.entries.set(element, validatedDots(dots));
    }
    this.tombstones = validatedDots(tombstones);
  }

  /** Creates an empty ORSet. */
  static empty(): ORSet {
    return new ORSet(new Map(), new Set());
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
   * Returns true while the set still holds any dot for the element,
   * tombstoned or live. Compaction retains these entries as removal evidence.
   */
  hasEntries(element: string): boolean {
    return this.entries.has(element);
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
   * Retains all membership evidence; retires no entries or tombstones.
   * The supplied vector alone cannot establish removal stability or exclude
   * stale replay/joins. Keeping the signature preserves existing callers.
   * This no-op does not establish a bound on retained metadata (#911).
   */
  compact(_includedVV: VersionVector): void {
    // Membership retirement requires a separate enforceable stability contract.
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

/** Admit canonical identity keys while taking ownership of a caller's set. */
function validatedDots(dots: Set<string>): Set<string> {
  if (!(dots instanceof Set)) { throw new CrdtError('ORSet dots must be a Set'); }
  const copied = new Set<string>();
  for (const dot of dots) {
    if (typeof dot !== 'string') { throw new CrdtError('ORSet encoded dot must be a string'); }
    Dot.decode(dot);
    copied.add(dot);
  }
  return copied;
}
