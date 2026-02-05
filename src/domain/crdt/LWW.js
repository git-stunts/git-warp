import { compareEventIds } from '../utils/EventId.js';

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
 * LWW Register - stores value with EventId for conflict resolution
 * @template T
 * @typedef {Object} LWWRegister
 * @property {import('../utils/EventId.js').EventId} eventId
 * @property {T} value
 */

/**
 * Creates an LWW register with the given EventId and value.
 * @template T
 * @param {import('../utils/EventId.js').EventId} eventId
 * @param {T} value
 * @returns {LWWRegister<T>}
 */
export function lwwSet(eventId, value) {
  return { eventId, value };
}

/**
 * Returns the LWW register with the greater EventId.
 * This is the join operation for LWW registers.
 *
 * ## EventId Comparison Logic
 *
 * Comparison proceeds through four levels until a difference is found:
 *
 * 1. **lamport** (number): Higher Lamport timestamp wins. This respects
 *    causality - if A happened-before B, A's Lamport < B's Lamport.
 *
 * 2. **writerId** (string): Lexicographic comparison. Deterministic tie-break
 *    for concurrent operations with the same Lamport clock.
 *
 * 3. **patchSha** (string): Lexicographic comparison of Git commit SHA.
 *    Distinguishes operations in different patches from the same writer.
 *
 * 4. **opIndex** (number): Numeric comparison. Distinguishes multiple
 *    property-set operations within the same patch.
 *
 * ## Deterministic Tie-Break
 *
 * On exactly equal EventIds (cmp === 0), returns the first argument `a`.
 * This is arbitrary but deterministic - all replicas make the same choice.
 * In practice, equal EventIds only occur when merging identical operations.
 *
 * ## Semilattice Properties
 *
 * - **Commutative**: lwwMax(a, b) === lwwMax(b, a) -- both return the one
 *   with greater EventId, or `a` on tie (same value anyway)
 * - **Associative**: lwwMax(lwwMax(a, b), c) === lwwMax(a, lwwMax(b, c))
 * - **Idempotent**: lwwMax(a, a) === a
 *
 * @template T
 * @param {LWWRegister<T> | null | undefined} a - First register (returned on tie)
 * @param {LWWRegister<T> | null | undefined} b - Second register
 * @returns {LWWRegister<T> | null} Register with greater EventId, or null if both null/undefined
 */
export function lwwMax(a, b) {
  // Handle null/undefined cases
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return null;
  }
  if (a === null || a === undefined) {
    return b;
  }
  if (b === null || b === undefined) {
    return a;
  }

  // Compare EventIds - return the one with greater EventId
  // On equal EventIds, return first argument (deterministic)
  const cmp = compareEventIds(a.eventId, b.eventId);
  return cmp >= 0 ? a : b;
}

/**
 * Extracts just the value from an LWW register.
 * @template T
 * @param {LWWRegister<T> | null | undefined} reg
 * @returns {T | undefined}
 */
export function lwwValue(reg) {
  return reg?.value;
}
