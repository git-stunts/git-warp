import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for trie branch validation.
 *
 * Raised when `TrieBranch` construction or `set` rejects its
 * inputs. Callers `instanceof`-dispatch on the class and branch on
 * `err.code`; never parse `err.message`.
 *
 * ## Error codes
 *
 * | Code                            | Meaning                                                |
 * |---------------------------------|--------------------------------------------------------|
 * | `E_TRIE_BRANCH_NIBBLE_RANGE`    | A nibble index is outside `[0, fanout)`.              |
 * | `E_TRIE_BRANCH_NIBBLE_SHAPE`    | A nibble index is not a non-negative integer.         |
 * | `E_TRIE_BRANCH_CHILD_OID`       | A child OID is not a non-empty string.                |
 *
 * The default code is `E_TRIE_BRANCH_NIBBLE_RANGE` because range
 * violations are the most common reason construction fails.
 */
export default class TrieBranchError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_TRIE_BRANCH_NIBBLE_RANGE", options);
  }
}
