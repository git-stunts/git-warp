/**
 * ProvenancePayload - Transferable Provenance as a Monoid
 *
 * Implements the provenance payload from Paper III (Computational Holography):
 * P = (mu_0, ..., mu_{n-1}) - an ordered sequence of tick patches.
 *
 * The payload monoid (Payload, ., epsilon):
 * - Composition is concatenation
 * - Identity is empty sequence
 *
 * Monoid laws hold:
 * - identity.concat(p) === p (left identity)
 * - p.concat(identity) === p (right identity)
 * - (a.concat(b)).concat(c) === a.concat(b.concat(c)) (associativity)
 *
 * @module domain/services/ProvenancePayload
 */

import { reduceV5, createEmptyStateV5, cloneStateV5 } from './JoinReducer.js';

/**
 * A single patch entry in the provenance payload.
 *
 * @typedef {Object} PatchEntry
 * @property {Object} patch - The decoded patch object (writer, lamport, ops, context)
 * @property {string} sha - The Git SHA of the patch commit
 */

/**
 * ProvenancePayload - Immutable sequence of patches forming a monoid.
 *
 * This class packages an ordered sequence of patches as a transferable
 * provenance payload. Combined with an initial state (boundary encoding),
 * it enables deterministic replay (computational holography).
 *
 * ## Monoid Structure
 *
 * ProvenancePayload forms a monoid under concatenation:
 * - **Identity**: `ProvenancePayload.identity()` returns the empty payload
 * - **Composition**: `a.concat(b)` concatenates two payloads
 *
 * ## Computational Holography
 *
 * Given a boundary encoding B = (U_0, P) where:
 * - U_0 is the initial state
 * - P is the provenance payload
 *
 * The `replay(U_0)` method uniquely determines the interior worldline,
 * producing the final materialized state.
 *
 * @example
 * ```javascript
 * // Create payload from patches
 * const payload = new ProvenancePayload([
 *   { patch: patch1, sha: 'abc123' },
 *   { patch: patch2, sha: 'def456' },
 * ]);
 *
 * // Monoid operations
 * const empty = ProvenancePayload.identity();
 * const combined = payload1.concat(payload2);
 *
 * // Replay to materialize state
 * const state = payload.replay();
 * ```
 */
class ProvenancePayload {
  /**
   * The internal array of patch entries. Frozen after construction.
   * @type {ReadonlyArray<PatchEntry>}
   */
  #patches;

  /**
   * Creates a new ProvenancePayload from an ordered sequence of patches.
   *
   * The payload is immutable after construction - the patches array is
   * frozen to prevent modification.
   *
   * @param {Array<PatchEntry>} patches - Ordered sequence of patch entries.
   *   Each entry must have { patch, sha } where patch is the decoded patch
   *   object and sha is the Git commit SHA.
   * @throws {TypeError} If patches is not an array
   */
  constructor(patches = []) {
    if (!Array.isArray(patches)) {
      throw new TypeError('ProvenancePayload requires an array of patches');
    }

    // Shallow copy and freeze to ensure immutability
    this.#patches = Object.freeze([...patches]);

    // Freeze the instance itself
    Object.freeze(this);
  }

  /**
   * Returns the identity element of the payload monoid.
   *
   * The identity payload contains no patches. It satisfies:
   * - `identity.concat(p)` equals `p` for any payload `p`
   * - `p.concat(identity)` equals `p` for any payload `p`
   *
   * @returns {ProvenancePayload} The empty/identity payload
   */
  static identity() {
    return new ProvenancePayload([]);
  }

  /**
   * Returns the number of patches in this payload.
   *
   * @returns {number} The patch count
   */
  get length() {
    return this.#patches.length;
  }

  /**
   * Concatenates this payload with another, forming a new payload.
   *
   * This is the monoid composition operation. The resulting payload
   * contains all patches from this payload followed by all patches
   * from the other payload.
   *
   * Monoid laws:
   * - `identity.concat(p) === p` (left identity)
   * - `p.concat(identity) === p` (right identity)
   * - `(a.concat(b)).concat(c) === a.concat(b.concat(c))` (associativity)
   *
   * @param {ProvenancePayload} other - The payload to append
   * @returns {ProvenancePayload} A new payload with combined patches
   * @throws {TypeError} If other is not a ProvenancePayload
   */
  concat(other) {
    if (!(other instanceof ProvenancePayload)) {
      throw new TypeError('concat requires a ProvenancePayload');
    }

    // Optimization: avoid array allocation for identity cases
    if (this.#patches.length === 0) {
      return other;
    }
    if (other.#patches.length === 0) {
      return this;
    }

    return new ProvenancePayload([...this.#patches, ...other.#patches]);
  }

  /**
   * Replays the payload to produce a materialized state.
   *
   * This implements the computational holography theorem (Paper III):
   * Given a boundary encoding B = (U_0, P), Replay(B) uniquely
   * determines the interior worldline.
   *
   * The replay applies patches in order using CRDT merge semantics:
   * - Nodes/edges use OR-Set (add-wins)
   * - Properties use LWW (Last-Write-Wins)
   *
   * @param {import('./JoinReducer.js').WarpStateV5} [initialState] - The initial
   *   state U_0 to replay from. If omitted, starts from empty state.
   * @returns {import('./JoinReducer.js').WarpStateV5} The final materialized state
   */
  replay(initialState) {
    // Handle empty payload - return clone of initial or fresh empty state
    if (this.#patches.length === 0) {
      return initialState ? cloneStateV5(initialState) : createEmptyStateV5();
    }

    // Use JoinReducer's reduceV5 for deterministic materialization.
    // Note: reduceV5 returns { state, receipts } when options.receipts is truthy,
    // but returns bare WarpStateV5 when no options passed (as here).
    return /** @type {import('./JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ ([...this.#patches]), initialState));
  }

  /**
   * Returns an iterator over the patch entries.
   *
   * This allows using the payload in for...of loops and spread syntax.
   *
   * @returns {Iterator<PatchEntry>} Iterator over patch entries
   */
  [Symbol.iterator]() {
    return this.#patches[Symbol.iterator]();
  }

  /**
   * Returns the patch entry at the given index.
   *
   * Supports negative indices like Array.prototype.at() (e.g., -1 for last element).
   *
   * @param {number} index - The index (negative indices count from end)
   * @returns {PatchEntry|undefined} The patch entry, or undefined if out of bounds
   */
  at(index) {
    return this.#patches.at(index);
  }

  /**
   * Returns a new payload containing a slice of this payload's patches.
   *
   * This enables the slicing operation from Paper III: materializing
   * only the causal cone for a target value.
   *
   * @param {number} [start=0] - Start index (inclusive)
   * @param {number} [end] - End index (exclusive), defaults to length
   * @returns {ProvenancePayload} A new payload with the sliced patches
   */
  slice(start = 0, end = this.#patches.length) {
    const sliced = this.#patches.slice(start, end);
    return new ProvenancePayload(sliced);
  }

  /**
   * Returns a JSON-serializable representation of this payload.
   *
   * The serialized form is an array of patch entries, suitable for
   * transmission as a Boundary Transition Record (BTR).
   *
   * @returns {Array<PatchEntry>} Array of patch entries
   */
  toJSON() {
    return [...this.#patches];
  }

  /**
   * Creates a ProvenancePayload from a JSON-serialized array.
   *
   * @param {Array<PatchEntry>} json - Array of patch entries
   * @returns {ProvenancePayload} The deserialized payload
   * @throws {TypeError} If json is not an array
   */
  static fromJSON(json) {
    return new ProvenancePayload(json);
  }
}

export default ProvenancePayload;
export { ProvenancePayload };
