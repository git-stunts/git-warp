import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for trie cursor navigation and mutation failures.
 *
 * Raised when a `TrieCursor` rejects its inputs, encounters a
 * store failure it cannot classify internally, or detects a state
 * that cannot arise from correct usage. Callers
 * `instanceof`-dispatch on the class and branch on `err.code`;
 * never parse `err.message`.
 *
 * ## Error codes
 *
 * | Code                          | Meaning                                                |
 * |-------------------------------|--------------------------------------------------------|
 * | `E_TRIE_CURSOR_STORE`         | A store read or write failed below the cursor.         |
 * | `E_TRIE_CURSOR_DECODE`        | A page could not be decoded into a `TrieLeaf` or       |
 * |                               | `TrieBranch` (e.g. wire version mismatch).             |
 * | `E_TRIE_CURSOR_STRUCTURE`     | The trie's on-disk structure contradicts the cursor's  |
 * |                               | expectations (e.g. a branch entry's kind cannot be     |
 * |                               | distinguished, or depth exceeds the route key).        |
 * | `E_TRIE_CURSOR_INPUT`         | A public-method argument is invalid (empty element,    |
 * |                               | wrong dot shape, etc.).                                |
 *
 * The default code is `E_TRIE_CURSOR_STORE` because the most
 * common cursor failure in practice is a backing-store fault
 * bubbling through.
 */
export default class TrieCursorError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_TRIE_CURSOR_STORE", options);
  }
}
