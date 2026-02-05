/**
 * @fileoverview Dot - Unique Operation Identity for CRDT Semantics
 *
 * In distributed systems, concurrent operations can arrive in any order and may
 * conflict. To resolve conflicts deterministically without coordination, each
 * operation must carry a unique, globally recognizable identity. This is the
 * role of a "dot."
 *
 * ## What is a Dot?
 *
 * A dot is a (writerId, counter) pair that uniquely identifies a single CRDT
 * operation. Think of it as a "birth certificate" for an operation:
 *
 * - **writerId**: Identifies which writer created this operation. Each writer
 *   in the system has a unique ID (e.g., "alice", "bob", or a UUID).
 *
 * - **counter**: A monotonically increasing integer for this writer. Each time
 *   a writer creates an operation, it increments its counter. The first
 *   operation is counter=1, the second is counter=2, and so on.
 *
 * Together, (writerId, counter) forms a globally unique identifier because:
 * 1. No two writers share the same writerId
 * 2. No single writer uses the same counter twice
 *
 * ## Why Dots Matter for CRDTs
 *
 * Dots enable "add-wins" semantics in OR-Sets. When an element is added, the
 * add operation's dot is recorded. When an element is removed, only the dots
 * that the remover has *observed* are tombstoned. This means:
 *
 * - Concurrent add + remove: The add wins (its dot wasn't observed by the remove)
 * - Sequential add then remove: The remove wins (it observed the add's dot)
 * - Re-add after remove: The new add wins (new dot wasn't observed by old remove)
 *
 * Without dots, you cannot distinguish "concurrent add" from "re-add after
 * remove," leading to either lost updates or zombie elements.
 *
 * ## Dots and Causality
 *
 * Dots relate to causality through version vectors. A version vector is a map
 * from writerId to the highest counter seen from that writer. If vv[writerId]
 * >= dot.counter, then the dot has been "observed" or "included" in that causal
 * context.
 *
 * This enables:
 * - **Causality tracking**: Know which operations have been seen
 * - **Safe garbage collection**: Only compact dots that all replicas have seen
 * - **Conflict detection**: Concurrent operations have dots not in each other's context
 *
 * ## Encoding
 *
 * Dots are encoded as strings "writerId:counter" for use as Map/Set keys. The
 * lastIndexOf(':') parsing handles writerIds that contain colons.
 *
 * @module crdt/Dot
 */

/**
 * Dot - Unique operation identifier for CRDT operations.
 * A dot is a (writerId, counter) pair that uniquely identifies an operation.
 *
 * @typedef {Object} Dot
 * @property {string} writerId - Writer identifier (non-empty string)
 * @property {number} counter - Monotonic counter (positive integer)
 */

/**
 * Creates a validated Dot.
 *
 * @param {string} writerId - Must be non-empty string
 * @param {number} counter - Must be positive integer (> 0)
 * @returns {Dot}
 * @throws {Error} If validation fails
 */
export function createDot(writerId, counter) {
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new Error('writerId must be a non-empty string');
  }

  if (!Number.isInteger(counter) || counter <= 0) {
    throw new Error('counter must be a positive integer');
  }

  return { writerId, counter };
}

/**
 * Checks if two dots are equal.
 *
 * @param {Dot} a
 * @param {Dot} b
 * @returns {boolean}
 */
export function dotsEqual(a, b) {
  return a.writerId === b.writerId && a.counter === b.counter;
}

/**
 * Encodes a dot as a string for use as Set/Map keys.
 * Format: "writerId:counter"
 *
 * @param {Dot} dot
 * @returns {string}
 */
export function encodeDot(dot) {
  return `${dot.writerId}:${dot.counter}`;
}

/**
 * Decodes an encoded dot string back to a Dot object.
 *
 * @param {string} encoded - Format: "writerId:counter"
 * @returns {Dot}
 * @throws {Error} If format is invalid
 */
export function decodeDot(encoded) {
  const lastColonIndex = encoded.lastIndexOf(':');
  if (lastColonIndex === -1) {
    throw new Error('Invalid encoded dot format: missing colon');
  }

  const writerId = encoded.slice(0, lastColonIndex);
  const counterStr = encoded.slice(lastColonIndex + 1);
  const counter = parseInt(counterStr, 10);

  if (writerId.length === 0) {
    throw new Error('Invalid encoded dot format: empty writerId');
  }

  if (isNaN(counter) || counter <= 0) {
    throw new Error('Invalid encoded dot format: invalid counter');
  }

  return { writerId, counter };
}

/**
 * Compares two dots lexicographically.
 * Order: writerId -> counter
 *
 * NOTE: This is ONLY for deterministic serialization ordering,
 * NOT for "newest wins" semantics. Dots are identity, not timestamps.
 *
 * @param {Dot} a
 * @param {Dot} b
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDots(a, b) {
  // 1. Compare writerId as string
  if (a.writerId !== b.writerId) {
    return a.writerId < b.writerId ? -1 : 1;
  }

  // 2. Compare counter numerically
  if (a.counter !== b.counter) {
    return a.counter < b.counter ? -1 : 1;
  }

  return 0;
}
