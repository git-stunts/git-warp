import { compareEventIds, type EventId } from '../utils/EventId.ts';

/**
 * @fileoverview LWW Register - Last-Write-Wins with Total Ordering
 *
 * An LWW (Last-Write-Wins) register is a CRDT that resolves concurrent writes
 * by keeping the write with the "greatest" timestamp. This implementation uses
 * EventId as the timestamp, providing a deterministic total order.
 *
 * ## Total Ordering Guarantee
 *
 * Unlike wall-clock timestamps which can have ties, EventId provides a **total
 * order** - for any two distinct EventIds, one is definitively greater than
 * the other. This eliminates non-determinism in conflict resolution.
 *
 * The EventId comparison order is:
 *
 * 1. **Lamport timestamp** (numeric, ascending)
 *    Higher Lamport = later in causal order or concurrent with higher clock
 *
 * 2. **writerId** (string, lexicographic)
 *    Tie-breaker when Lamport timestamps match
 *
 * 3. **patchSha** (hex string, lexicographic)
 *    Tie-breaker for same writer, same Lamport (different patches)
 *
 * 4. **opIndex** (numeric, ascending)
 *    Tie-breaker for multiple operations within the same patch
 *
 * This four-level comparison ensures:
 * - Causally-later writes generally win (via Lamport)
 * - Concurrent writes have deterministic winners (via writerId)
 * - All replicas agree on the winner without coordination
 *
 * ## Deterministic Tie-Break Behavior
 *
 * When EventIds are exactly equal (same lamport, writerId, patchSha, opIndex),
 * the lwwMax function returns the first argument. This is deterministic because:
 *
 * - Equal EventIds mean the same operation from the same patch
 * - The values must be identical (same operation)
 * - Returning first argument is an arbitrary but consistent choice
 *
 * In practice, equal EventIds should only occur when merging a register with
 * itself (idempotence).
 *
 * ## Why Lamport First?
 *
 * Lamport timestamps respect causality: if operation A happens-before B, then
 * A's Lamport < B's Lamport. By sorting Lamport first:
 *
 * - Sequential writes are ordered correctly
 * - "Later" concurrent writes tend to win (higher local clock)
 * - The system exhibits intuitive "last write wins" behavior
 *
 * However, Lamport timestamps alone don't provide total order (concurrent
 * operations can have the same Lamport), hence the additional tie-breakers.
 *
 * ## Semilattice Properties
 *
 * lwwMax forms a join-semilattice over LWW registers:
 * - **Commutative**: lwwMax(a, b) === lwwMax(b, a)
 * - **Associative**: lwwMax(lwwMax(a, b), c) === lwwMax(a, lwwMax(b, c))
 * - **Idempotent**: lwwMax(a, a) === a
 *
 * These properties ensure conflict-free merging regardless of operation order.
 *
 * @module crdt/LWW
 */

/**
 * LWW Register — stores value with EventId for conflict resolution.
 */
export class LWWRegister<T> {
  readonly eventId: EventId;
  readonly value: T;

  /**
   * Creates an LWW register.
   */
  constructor(eventId: EventId, value: T) {
    this.eventId = eventId;
    this.value = value;
    Object.freeze(this);
  }

  /**
   * Creates an LWW register with the given EventId and value.
   */
  static set<V>(eventId: EventId, value: V): LWWRegister<V> {
    return new LWWRegister(eventId, value);
  }

  /**
   * Returns the LWW register with the greater EventId.
   * This is the join operation for LWW registers.
   *
   * On exactly equal EventIds (cmp === 0), returns the first argument `a`.
   * This is arbitrary but deterministic - all replicas make the same choice.
   *
   * @returns Register with greater EventId, or null if both null/undefined
   */
  static max<V>(a: LWWRegister<V>, b: LWWRegister<V> | null | undefined): LWWRegister<V>;
  static max<V>(a: LWWRegister<V> | null | undefined, b: LWWRegister<V>): LWWRegister<V>;
  static max<V>(a: LWWRegister<V> | null | undefined, b: LWWRegister<V> | null | undefined): LWWRegister<V> | null;
  static max<V>(a: LWWRegister<V> | null | undefined, b: LWWRegister<V> | null | undefined): LWWRegister<V> | null {
    const resolvedA = _lwwCoalesce(a);
    const resolvedB = _lwwCoalesce(b);

    if (resolvedA === null) {
      return resolvedB;
    }
    if (resolvedB === null) {
      return resolvedA;
    }

    // Compare EventIds - return the one with greater EventId
    // On equal EventIds, return first argument (deterministic)
    const cmp = compareEventIds(resolvedA.eventId, resolvedB.eventId);
    return cmp >= 0 ? resolvedA : resolvedB;
  }

  /**
   * Extracts just the value from an LWW register.
   */
  static value<V>(reg: LWWRegister<V> | null | undefined): V | undefined {
    return reg?.value;
  }
}

/**
 * Normalizes a nullable/undefined register to either a valid register or null.
 */
function _lwwCoalesce<T>(reg: LWWRegister<T> | null | undefined): LWWRegister<T> | null {
  return reg !== null && reg !== undefined ? reg : null;
}

// ── Backward-compat re-exports ────────────────────────────────────────
// Free-function aliases that delegate to static methods.

/** @deprecated Use {@link LWWRegister.set} */
export function lwwSet<T>(eventId: EventId, value: T): LWWRegister<T> {
  return LWWRegister.set(eventId, value);
}

/** @deprecated Use {@link LWWRegister.max} */
export function lwwMax<T>(a: LWWRegister<T>, b: LWWRegister<T> | null | undefined): LWWRegister<T>;
export function lwwMax<T>(a: LWWRegister<T> | null | undefined, b: LWWRegister<T>): LWWRegister<T>;
export function lwwMax<T>(a: LWWRegister<T> | null | undefined, b: LWWRegister<T> | null | undefined): LWWRegister<T> | null;
export function lwwMax<T>(a: LWWRegister<T> | null | undefined, b: LWWRegister<T> | null | undefined): LWWRegister<T> | null {
  return LWWRegister.max(a, b);
}

/** @deprecated Use {@link LWWRegister.value} */
export function lwwValue<T>(reg: LWWRegister<T> | null | undefined): T | undefined {
  return LWWRegister.value(reg);
}
