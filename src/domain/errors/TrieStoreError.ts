import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for trie storage reads and writes.
 *
 * Carries a typed `code` so consumers can `instanceof`-dispatch on
 * `TrieStoreError` first, then branch on `code` for fine-grained
 * handling. Never parse `err.message`.
 *
 * ## Error codes
 *
 * | Code                    | Meaning                                               |
 * |-------------------------|-------------------------------------------------------|
 * | `E_TRIE_STORE_READ`     | A read call failed against the backing Git store.     |
 * | `E_TRIE_STORE_WRITE`    | A write call failed against the backing Git store.    |
 * | `E_TRIE_STORE_MISSING`  | The requested OID does not exist.                     |
 * | `E_TRIE_STORE_CORRUPT`  | The OID resolved but its bytes failed trie decoding.  |
 *
 * The default code is `E_TRIE_STORE_READ` because the most common
 * trie-store failure in practice is a read miss or a transport
 * error on read. Callers should pass an explicit code for the other
 * three outcomes.
 */
export default class TrieStoreError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_TRIE_STORE_READ", options);
  }
}
