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
