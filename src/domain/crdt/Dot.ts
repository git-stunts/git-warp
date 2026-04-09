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

import CrdtError from '../errors/CrdtError.ts';

/**
 * Dot — unique operation identity for CRDT semantics.
 * A (writerId, counter) pair that serves as a "birth certificate"
 * for each CRDT operation.
 */
export class Dot {
  /** Writer identifier (non-empty string) */
  readonly writerId: string;

  /** Monotonic counter (positive integer) */
  readonly counter: number;

  /**
   * Creates a validated Dot.
   *
   * @param writerId - Must be non-empty string
   * @param counter - Must be positive integer (> 0)
   */
  constructor(writerId: string, counter: number) {
    if (typeof writerId !== 'string' || writerId.length === 0) {
      throw new CrdtError('writerId must be a non-empty string', {
        code: 'E_CRDT_INVALID_WRITER_ID',
        context: { writerId },
      });
    }

    if (!Number.isInteger(counter) || counter <= 0) {
      throw new CrdtError('counter must be a positive integer', {
        code: 'E_CRDT_INVALID_COUNTER',
        context: { writerId, counter },
      });
    }

    this.writerId = writerId;
    this.counter = counter;
    Object.freeze(this);
  }

  /**
   * Creates a validated Dot (factory method).
   */
  static create(writerId: string, counter: number): Dot {
    return new Dot(writerId, counter);
  }

  /**
   * Checks if two dots are equal.
   */
  static equals(a: Dot, b: Dot): boolean {
    return a.writerId === b.writerId && a.counter === b.counter;
  }

  /**
   * Encodes a dot as a string for use as Set/Map keys.
   * Format: "writerId:counter"
   */
  static encode(dot: Dot): string {
    return `${dot.writerId}:${dot.counter}`;
  }

  /**
   * Decodes an encoded dot string back to a Dot object.
   *
   * Writer IDs are parsed using lastIndexOf(':') as separator. Writer IDs
   * containing colons are supported because the counter (after the last colon)
   * is always numeric. However, empty writer IDs or IDs ending with a colon
   * may produce unexpected results.
   *
   * @param encoded - Format: "writerId:counter"
   */
  static decode(encoded: string): Dot {
    const lastColonIndex = encoded.lastIndexOf(':');
    if (lastColonIndex === -1) {
      throw new CrdtError('Invalid encoded dot format: missing colon', {
        code: 'E_CRDT_MALFORMED',
        context: { encoded },
      });
    }

    const writerId = encoded.slice(0, lastColonIndex);
    const counterStr = encoded.slice(lastColonIndex + 1);
    const counter = parseInt(counterStr, 10);

    if (writerId.length === 0) {
      throw new CrdtError('Invalid encoded dot format: empty writerId', {
        code: 'E_CRDT_INVALID_WRITER_ID',
        context: { encoded },
      });
    }

    if (isNaN(counter) || counter <= 0) {
      throw new CrdtError('Invalid encoded dot format: invalid counter', {
        code: 'E_CRDT_INVALID_COUNTER',
        context: { encoded },
      });
    }

    return new Dot(writerId, counter);
  }

  /**
   * Compares two dots lexicographically.
   * Order: writerId -> counter
   *
   * NOTE: This is ONLY for deterministic serialization ordering,
   * NOT for "newest wins" semantics. Dots are identity, not timestamps.
   *
   * @returns -1 if a < b, 0 if equal, 1 if a > b
   */
  static compare(a: Dot, b: Dot): number {
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
}

// ── Backward-compat re-exports ────────────────────────────────────────
// Free-function aliases that delegate to static methods.
// Existing callers import these; new code should use Dot.* directly.

/** @deprecated Use {@link Dot.create} */
export function createDot(writerId: string, counter: number): Dot {
  return Dot.create(writerId, counter);
}

/** @deprecated Use {@link Dot.equals} */
export function dotsEqual(a: Dot, b: Dot): boolean {
  return Dot.equals(a, b);
}

/** @deprecated Use {@link Dot.encode} */
export function encodeDot(dot: Dot): string {
  return Dot.encode(dot);
}

/** @deprecated Use {@link Dot.decode} */
export function decodeDot(encoded: string): Dot {
  return Dot.decode(encoded);
}

/** @deprecated Use {@link Dot.compare} */
export function compareDots(a: Dot, b: Dot): number {
  return Dot.compare(a, b);
}
