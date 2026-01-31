import { encodeDot, decodeDot, compareDots } from './Dot.js';
import { vvContains } from './VersionVector.js';

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
 * CRITICAL for GC safety:
 * - Only remove TOMBSTONED dots that are <= includedVV
 * - NEVER remove live (non-tombstoned) dots just because they're <= vv
 *
 * @param {ORSet} set - The ORSet to compact
 * @param {import('./VersionVector.js').VersionVector} includedVV - The version vector for compaction
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
 * @returns {Object}
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
 * @param {Object} obj
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
