import { Dot } from './Dot.js';
import CrdtError from '../errors/CrdtError.js';

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
 *   Order of merge doesn't matter
 *
 * - **Associative**: a.merge(b).merge(c) equals a.merge(b.merge(c))
 *   Grouping of merges doesn't matter
 *
 * - **Idempotent**: a.merge(a) equals a
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
 * Version vectors are partially ordered by descends (componentwise <=):
 * - vv_a <= vv_b iff for all writerIds w: vv_a[w] <= vv_b[w]
 *
 * This forms a **causal order** where vv_a <= vv_b means "a causally precedes b"
 * or "b has observed all of a's history." Incomparable vectors represent
 * concurrent states.
 *
 * @module crdt/VersionVector
 */

/**
 * Checks if writerId is a non-empty string.
 * @param {string} writerId
 * @returns {boolean}
 */
function _isValidWriterId(writerId) {
  return typeof writerId === 'string' && writerId.length > 0;
}

/**
 * Checks if counter is a non-negative integer.
 * @param {number} counter
 * @returns {boolean}
 */
function _isValidCounter(counter) {
  return typeof counter === 'number' && Number.isInteger(counter) && counter >= 0;
}

/**
 * Validates a (writerId, counter) entry.
 *
 * @param {string} writerId
 * @param {number} counter
 * @throws {CrdtError}
 */
function _validateEntry(writerId, counter) {
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
  /** @type {Map<string, number>} */
  #entries;

  /**
   * Internal constructor — takes a pre-validated Map.
   *
   * External callers should use {@link VersionVector.empty} or
   * {@link VersionVector.from}.
   *
   * @param {Map<string, number>} entries - Pre-validated entries
   */
  constructor(entries) {
    this.#entries = entries;
  }

  /**
   * Creates an empty VersionVector.
   *
   * @returns {VersionVector}
   */
  static empty() {
    return new VersionVector(new Map());
  }

  /**
   * Creates a VersionVector from a source.
   *
   * Accepts:
   * - Another VersionVector (clones it)
   * - A Map<string, number> (validates and copies)
   * - A plain object {writerId: counter} (boundary parse — skips zero counters)
   *
   * @param {VersionVector | Map<string, number> | Record<string, number>} source
   * @returns {VersionVector}
   * @throws {CrdtError} If any entry is invalid
   */
  static from(source) {
    if (source instanceof VersionVector) {
      return source.clone();
    }
    if (source instanceof Map) {
      return VersionVector._fromMap(source);
    }
    return VersionVector._fromPlainObject(source);
  }

  /**
   * Validates and wraps a Map as a VersionVector.
   * @param {Map<string, number>} source
   * @returns {VersionVector}
   */
  static _fromMap(source) {
    for (const [writerId, counter] of source) {
      _validateEntry(writerId, counter);
    }
    return new VersionVector(new Map(source));
  }

  /**
   * Boundary deserialization from a plain object.
   * Zero counters are elided: a counter of 0 carries no causal
   * information and wastes space.
   *
   * @param {Record<string, number>} source
   * @returns {VersionVector}
   */
  static _fromPlainObject(source) {
    const map = new Map();
    for (const [writerId, counter] of Object.entries(source)) {
      _validateEntry(writerId, counter);
      if (counter > 0) {
        map.set(writerId, counter);
      }
    }
    return new VersionVector(map);
  }

  // ---------------------------------------------------------------------------
  // Map-compatible accessors
  // ---------------------------------------------------------------------------

  /**
   * Returns the counter for a writer, or undefined if not present.
   *
   * @param {string} writerId
   * @returns {number | undefined}
   */
  get(writerId) {
    return this.#entries.get(writerId);
  }

  /**
   * Sets the counter for a writer. Validates the entry.
   *
   * @param {string} writerId
   * @param {number} counter - Must be a non-negative integer
   * @returns {this}
   */
  set(writerId, counter) {
    _validateEntry(writerId, counter);
    this.#entries.set(writerId, counter);
    return this;
  }

  /**
   * Returns true if the writer has an entry.
   *
   * @param {string} writerId
   * @returns {boolean}
   */
  has(writerId) {
    return this.#entries.has(writerId);
  }

  /**
   * The number of writer entries.
   *
   * @returns {number}
   */
  get size() {
    return this.#entries.size;
  }

  /**
   * Iterates over [writerId, counter] entries.
   *
   * @returns {IterableIterator<[string, number]>}
   */
  [Symbol.iterator]() {
    return this.#entries[Symbol.iterator]();
  }

  /**
   * Returns an iterator over writer IDs.
   *
   * @returns {IterableIterator<string>}
   */
  keys() {
    return this.#entries.keys();
  }

  /**
   * Returns an iterator over counter values.
   *
   * @returns {IterableIterator<number>}
   */
  values() {
    return this.#entries.values();
  }

  /**
   * Returns an iterator over [writerId, counter] entries.
   *
   * @returns {IterableIterator<[string, number]>}
   */
  entries() {
    return this.#entries.entries();
  }

  // ---------------------------------------------------------------------------
  // CRDT operations
  // ---------------------------------------------------------------------------

  /**
   * Increments the counter for a writer and returns the new Dot.
   * This mutates the VersionVector.
   *
   * @param {string} writerId - The writer to increment
   * @returns {Dot} The new dot representing this operation
   */
  increment(writerId) {
    const current = this.#entries.get(writerId) ?? 0;
    const newCounter = current + 1;
    this.#entries.set(writerId, newCounter);
    return new Dot(writerId, newCounter);
  }

  /**
   * Merges with another VersionVector by taking the pointwise maximum.
   * Returns a new VersionVector; does not mutate either input.
   *
   * Properties:
   * - Commutative: a.merge(b).equals(b.merge(a))
   * - Associative: a.merge(b).merge(c).equals(a.merge(b.merge(c)))
   * - Idempotent: a.merge(a).equals(a)
   *
   * @param {VersionVector} other
   * @returns {VersionVector}
   */
  merge(other) {
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
   *
   * @param {VersionVector} other - The potential ancestor vector
   * @returns {boolean} True if this >= other componentwise
   */
  descends(other) {
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
   *
   * @param {Dot} dot
   * @returns {boolean}
   */
  contains(dot) {
    const counter = this.#entries.get(dot.writerId) ?? 0;
    return dot.counter <= counter;
  }

  /**
   * Creates a deep clone.
   *
   * @returns {VersionVector}
   */
  clone() {
    return new VersionVector(new Map(this.#entries));
  }

  /**
   * Checks equality with another VersionVector.
   *
   * @param {VersionVector} other
   * @returns {boolean}
   */
  equals(other) {
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

// =============================================================================
// Backward-compatibility shims
//
// These free functions delegate to the VersionVector class. They exist so that
// existing callers (and the extensive test suite) continue to work without
// modification. New code should use the class API directly.
// =============================================================================

/**
 * Creates an empty VersionVector.
 *
 * @deprecated Use {@link VersionVector.empty}
 * @returns {VersionVector}
 */
export function createVersionVector() {
  return VersionVector.empty();
}

/**
 * Coerces a value to a VersionVector. If already a VersionVector, returns
 * as-is. If a Map, wraps it. This handles legacy code that passes raw Maps
 * where VersionVectors are expected.
 *
 * @param {VersionVector | Map<string, number>} vv
 * @returns {VersionVector}
 */
function _coerce(vv) {
  if (vv instanceof VersionVector) {
    return vv;
  }
  return VersionVector.from(vv);
}

/**
 * Increments the counter for a writer and returns the new Dot.
 *
 * @deprecated Use {@link VersionVector#increment}
 * @param {VersionVector | Map<string, number>} vv
 * @param {string} writerId
 * @returns {Dot}
 */
export function vvIncrement(vv, writerId) {
  return _coerce(vv).increment(writerId);
}

/**
 * Merges two VersionVectors by taking the pointwise maximum.
 *
 * @deprecated Use {@link VersionVector#merge}
 * @param {VersionVector | Map<string, number>} a
 * @param {VersionVector | Map<string, number>} b
 * @returns {VersionVector}
 */
export function vvMerge(a, b) {
  return _coerce(a).merge(_coerce(b));
}

/**
 * Checks if VersionVector a descends from (is >= than) VersionVector b.
 *
 * @deprecated Use {@link VersionVector#descends}
 * @param {VersionVector | Map<string, number>} a
 * @param {VersionVector | Map<string, number>} b
 * @returns {boolean}
 */
export function vvDescends(a, b) {
  return _coerce(a).descends(_coerce(b));
}

/**
 * Checks if a dot is contained within (observed by) the VersionVector.
 *
 * @deprecated Use {@link VersionVector#contains}
 * @param {VersionVector | Map<string, number>} vv
 * @param {Dot} dot
 * @returns {boolean}
 */
export function vvContains(vv, dot) {
  return _coerce(vv).contains(dot);
}

/**
 * Converts a VersionVector to a plain object with sorted keys for
 * deterministic encoding. This is a codec-layer concern — the domain
 * type provides iteration, the codec decides the wire format.
 *
 * @param {VersionVector | Map<string, number>} vv
 * @returns {Record<string, number>}
 * @throws {CrdtError} If any counter is zero (invariant violation)
 */
export function vvSerialize(vv) {
  const coerced = _coerce(vv);
  /** @type {Record<string, number>} */
  const obj = {};
  const sortedKeys = [...coerced.keys()].sort();

  for (const key of sortedKeys) {
    const val = /** @type {number} */ (coerced.get(key));
    if (val === 0) {
      throw new CrdtError(`vvSerialize: zero counter for writerId "${key}" — VersionVector must not contain zero counters`, {
        code: 'E_CRDT_ZERO_COUNTER',
        context: { writerId: key },
      });
    }
    obj[key] = val;
  }

  return obj;
}

/**
 * Deserializes a plain object to a VersionVector.
 *
 * @deprecated Use {@link VersionVector.from}
 * @param {Record<string, number>} obj
 * @returns {VersionVector}
 */
export function vvDeserialize(obj) {
  return VersionVector.from(obj);
}

/**
 * Clones a VersionVector.
 *
 * @deprecated Use {@link VersionVector#clone}
 * @param {VersionVector | Map<string, number>} vv
 * @returns {VersionVector}
 */
export function vvClone(vv) {
  return _coerce(vv).clone();
}

/**
 * Checks if two VersionVectors are equal.
 *
 * @deprecated Use {@link VersionVector#equals}
 * @param {VersionVector | Map<string, number>} a
 * @param {VersionVector | Map<string, number>} b
 * @returns {boolean}
 */
export function vvEqual(a, b) {
  return _coerce(a).equals(_coerce(b));
}
