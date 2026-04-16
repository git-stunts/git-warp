import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for trie flush failures.
 *
 * Raised by `TrieFlusher` when persisting a `DirtyPageSet` hits
 * a store fault, an encode fault, or a structural violation the
 * cursor handed down. Callers `instanceof`-dispatch on the
 * class and branch on `err.code`; never parse `err.message`.
 *
 * ## Error codes
 *
 * | Code                            | Meaning                                                |
 * |---------------------------------|--------------------------------------------------------|
 * | `E_TRIE_FLUSH_STORE`            | A read or write against `TrieStorePort` failed.        |
 * | `E_TRIE_FLUSH_ENCODE`           | A leaf could not be serialized through the codec.      |
 * | `E_TRIE_FLUSH_UNRESOLVED`       | A pending child OID could not be replaced with a real  |
 * |                                 | OID after walking the dirty set — a cursor/flusher     |
 * |                                 | handshake violation.                                   |
 * | `E_TRIE_FLUSH_STRUCTURE`        | The dirty set has a shape the flusher does not         |
 * |                                 | recognise (e.g. a dirty path references a missing      |
 * |                                 | child at write time).                                  |
 *
 * The default code is `E_TRIE_FLUSH_STORE` because store faults
 * are the most common flush failure in practice.
 */
export default class TrieFlushError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_TRIE_FLUSH_STORE", options);
  }
}
