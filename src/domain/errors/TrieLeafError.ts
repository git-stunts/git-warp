import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for trie leaf validation and codec failures.
 *
 * Raised when `TrieLeaf` construction or deserialization rejects
 * its inputs. Callers `instanceof`-dispatch on the class and branch
 * on `err.code`; never parse `err.message`.
 *
 * ## Error codes
 *
 * | Code                           | Meaning                                             |
 * |--------------------------------|-----------------------------------------------------|
 * | `E_TRIE_LEAF_ENTRY_SHAPE`      | An entry's runtime shape is invalid (missing or    |
 * |                                | wrongly-typed field).                               |
 * | `E_TRIE_LEAF_UNSORTED`         | Entries are not sorted by `routeKeySuffix`.         |
 * | `E_TRIE_LEAF_VERSION`          | CBOR envelope carries an unrecognized or missing    |
 * |                                | version value.                                      |
 * | `E_TRIE_LEAF_WIRE_SHAPE`       | Decoded wire bytes do not match the expected        |
 * |                                | leaf envelope shape.                                |
 *
 * The default code is `E_TRIE_LEAF_ENTRY_SHAPE` because it is the
 * most common construction failure.
 */
export default class TrieLeafError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_TRIE_LEAF_ENTRY_SHAPE", options);
  }
}
