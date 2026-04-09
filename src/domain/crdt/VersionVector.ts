import { Dot } from './Dot.ts';
import CrdtError from '../errors/CrdtError.ts';

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
 * operation (merge). A join-semilattice is a partially ordered set where
 * every pair of elements has a least upper bound (join).
 *
 * The semilattice properties of merge:
 *
 * - **Commutative**: a.merge(b) equals b.merge(a)
 * - **Associative**: a.merge(b).merge(c) equals a.merge(b.merge(c))
 * - **Idempotent**: a.merge(a) equals a
 *
 * ## Partial Order
 *
 * Version vectors are partially ordered by descends (componentwise <=):
 * - vv_a <= vv_b iff for all writerIds w: vv_a[w] <= vv_b[w]
 *
 * This forms a **causal order** where vv_a <= vv_b means "a causally precedes b"
 * or "b has observed all of a's history."
 *
 * @module crdt/VersionVector
 */

/** Checks if writerId is a non-empty string. */
function _isValidWriterId(writerId: string): boolean {
  return typeof writerId === 'string' && writerId.length > 0;
}

/** Checks if counter is a non-negative integer. */
function _isValidCounter(counter: number): boolean {
  return typeof counter === 'number' && Number.isInteger(counter) && counter >= 0;
}

/** Validates a (writerId, counter) entry. */
function _validateEntry(writerId: string, counter: number): void {
  if (!_isValidWriterId(writerId)) {
    throw new CrdtError(`Invalid writerId: ${String(writerId)}`, {
      code: 'E_CRDT_INVALID_WRITER_ID',
      context: { writerId },
    });
  }
  if (!_isValidCounter(counter)) {
    throw new CrdtError(`Invalid counter for writerId "${writerId}": ${counter}`, {
      code: 'E_CRDT_INVALID_COUNTER',
      context: { writerId, counter },
    });
  }
}

/**
 * VersionVector — causality tracking for distributed CRDT systems.
 *
 * Maps each writer ID to the highest operation counter observed from
 * that writer. Forms a join-semilattice under pointwise maximum (merge).
 *
 * Instances are mutable during reduce (patch application) for performance.
 * Clone before handing to consumers that expect isolation.
 */
export default class VersionVector {
  #entries: Map<string, number>;

  /**
   * Internal constructor — takes a pre-validated Map.
   *
   * External callers should use {@link VersionVector.empty} or
   * {@link VersionVector.from}.
   */
  constructor(entries: Map<string, number>) {
    this.#entries = entries;
  }

  /** Creates an empty VersionVector. */
  static empty(): VersionVector {
    return new VersionVector(new Map());
  }

  /**
   * Creates a VersionVector from a source.
   *
   * Accepts:
   * - Another VersionVector (clones it)
   * - A Map<string, number> (validates and copies)
   * - A plain object {writerId: counter} (boundary parse — skips zero counters)
   */
  static from(source: VersionVector | Map<string, number> | Record<string, number>): VersionVector {
    if (source instanceof VersionVector) {
      return source.clone();
    }
    if (source instanceof Map) {
      return VersionVector._fromMap(source);
    }
    return VersionVector._fromPlainObject(source);
  }

  /** Validates and wraps a Map as a VersionVector. */
  static _fromMap(source: Map<string, number>): VersionVector {
    const entries = new Map<string, number>();
    for (const [writerId, counter] of source) {
      _validateEntry(writerId, counter);
      if (counter > 0) {
        entries.set(writerId, counter);
      }
    }
    return new VersionVector(entries);
  }

  /**
   * Boundary deserialization from a plain object.
   * Zero counters are elided: a counter of 0 carries no causal
   * information and wastes space.
   */
  static _fromPlainObject(source: Record<string, number>): VersionVector {
    const map = new Map<string, number>();
    for (const [writerId, counter] of Object.entries(source)) {
      _validateEntry(writerId, counter);
      if (counter > 0) {
        map.set(writerId, counter);
      }
    }
    return new VersionVector(map);
  }

  /**
   * Converts a VersionVector to a plain object with sorted keys for
   * deterministic encoding. This is a codec-layer concern — the domain
   * type provides iteration, the codec decides the wire format.
   */
  static serialize(vv: VersionVector): Record<string, number> {
    const obj: Record<string, number> = {};
    const sortedKeys = [...vv.keys()].sort();

    for (const key of sortedKeys) {
      const val = vv.get(key);
      if (val === undefined || val === 0) {
        throw new CrdtError(`vvSerialize: zero counter for writerId "${key}" — VersionVector must not contain zero counters`, {
          code: 'E_CRDT_ZERO_COUNTER',
          context: { writerId: key },
        });
      }
      obj[key] = val;
    }

    return obj;
  }

  // ---------------------------------------------------------------------------
  // Map-compatible accessors
  // ---------------------------------------------------------------------------

  /** Returns the counter for a writer, or undefined if not present. */
  get(writerId: string): number | undefined {
    return this.#entries.get(writerId);
  }

  /**
   * Sets the counter for a writer. Validates the entry.
   */
  set(writerId: string, counter: number): this {
    if (Object.isFrozen(this)) {
      throw new TypeError('Cannot mutate a frozen VersionVector');
    }
    _validateEntry(writerId, counter);
    if (counter === 0) {
      this.#entries.delete(writerId);
    } else {
      this.#entries.set(writerId, counter);
    }
    return this;
  }

  /** Returns true if the writer has an entry. */
  has(writerId: string): boolean {
    return this.#entries.has(writerId);
  }

  /** The number of writer entries. */
  get size(): number {
    return this.#entries.size;
  }

  /** Iterates over [writerId, counter] entries. */
  [Symbol.iterator](): IterableIterator<[string, number]> {
    return this.#entries[Symbol.iterator]();
  }

  /** Returns an iterator over writer IDs. */
  keys(): IterableIterator<string> {
    return this.#entries.keys();
  }

  /** Returns an iterator over counter values. */
  values(): IterableIterator<number> {
    return this.#entries.values();
  }

  /** Returns an iterator over [writerId, counter] entries. */
  entries(): IterableIterator<[string, number]> {
    return this.#entries.entries();
  }

  // ---------------------------------------------------------------------------
  // CRDT operations
  // ---------------------------------------------------------------------------

  /**
   * Increments the counter for a writer and returns the new Dot.
   * This mutates the VersionVector.
   */
  increment(writerId: string): Dot {
    if (Object.isFrozen(this)) {
      throw new TypeError('Cannot mutate a frozen VersionVector');
    }
    // Validate before mutating to avoid partial corruption
    const dot = new Dot(writerId, (this.#entries.get(writerId) ?? 0) + 1);
    this.#entries.set(dot.writerId, dot.counter);
    return dot;
  }

  /**
   * Merges with another VersionVector by taking the pointwise maximum.
   * Returns a new VersionVector; does not mutate either input.
   *
   * Properties:
   * - Commutative: a.merge(b).equals(b.merge(a))
   * - Associative: a.merge(b).merge(c).equals(a.merge(b.merge(c)))
   * - Idempotent: a.merge(a).equals(a)
   */
  merge(other: VersionVector): VersionVector {
    const result = new Map(this.#entries);

    for (const [writerId, counter] of other) {
      const existing = result.get(writerId) ?? 0;
      result.set(writerId, Math.max(existing, counter));
    }

    return new VersionVector(result);
  }

  /**
   * Checks if this VersionVector descends from (is >= than) another.
   * this >= other means for every entry in other, this has an equal
   * or greater counter.
   */
  descends(other: VersionVector): boolean {
    for (const [writerId, counter] of other) {
      const thisCounter = this.#entries.get(writerId) ?? 0;
      if (thisCounter < counter) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if a dot is contained within (observed by) this VersionVector.
   * A dot is contained if dot.counter <= this[dot.writerId].
   */
  contains(dot: Dot): boolean {
    const counter = this.#entries.get(dot.writerId) ?? 0;
    return dot.counter <= counter;
  }

  /** Creates a deep clone. */
  clone(): VersionVector {
    return new VersionVector(new Map(this.#entries));
  }

  /** Checks equality with another VersionVector. */
  equals(other: VersionVector): boolean {
    if (this.#entries.size !== other.size) {
      return false;
    }

    for (const [writerId, counter] of this.#entries) {
      if (other.get(writerId) !== counter) {
        return false;
      }
    }

    return true;
  }
}
