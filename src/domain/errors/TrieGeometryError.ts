import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for trie geometry configuration failures.
 *
 * Raised when a `TrieGeometry` constructor rejects its inputs
 * (unsupported fanout, mismatched nibbleBits, non-positive capacity,
 * negative floor, floor that meets or exceeds capacity). Callers
 * `instanceof`-dispatch on the class and branch on `err.code` for
 * specific outcomes — never on `err.message`.
 *
 * ## Error codes
 *
 * | Code                             | Meaning                                                |
 * |----------------------------------|--------------------------------------------------------|
 * | `E_TRIE_GEOMETRY_FANOUT`         | fanout is not one of the v1 supported values.          |
 * | `E_TRIE_GEOMETRY_NIBBLE_BITS`    | nibbleBits does not match `log2(fanout)`.              |
 * | `E_TRIE_GEOMETRY_LEAF_CAPACITY`  | leafCapacity is not a positive integer.                |
 * | `E_TRIE_GEOMETRY_LEAF_FLOOR`     | leafFloor is negative or is greater than / equal to    |
 * |                                  | leafCapacity.                                          |
 *
 * The default code is `E_TRIE_GEOMETRY_FANOUT` because fanout is
 * the first value validated; a bare `new TrieGeometryError(message)`
 * still yields a useful code.
 */
export default class TrieGeometryError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_TRIE_GEOMETRY_FANOUT", options);
  }
}
