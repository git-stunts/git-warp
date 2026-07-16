import type { TrieBranchEntries } from "./TrieBranchEntries.ts";

/**
 * Storage port for the shadow-trie ORSet's Git-native backing.
 *
 * The shadow trie stores its structure as native Git objects: branch
 * nodes are Git trees, leaf nodes are Git blobs. This port is the
 * minimum contract required for the trie cursor, codec, and session
 * layers to exchange those two kinds of object with a concrete
 * backend without knowing anything about Git transports, packfiles,
 * or reference plumbing.
 *
 * ## Four methods, nothing more
 *
 * - `readLeaf(oid)` — read a leaf blob's raw bytes.
 * - `readBranch(oid)` — read a branch tree as its nibble-indexed
 *   child map.
 * - `writeLeaf(data)` — write a leaf blob and return its OID.
 * - `writeBranch(children)` — write a branch tree and return its OID.
 *
 * That is the entire port. No batch reads, no batch writes, no
 * page caching, no geometry configuration, no checkpoint envelope
 * publication. Those concerns live in other modules (and other
 * backlog items):
 *
 * | Concern                         | Owner                                      |
 * |---------------------------------|--------------------------------------------|
 * | LRU cache over deserialized pages | `PERF_lru-page-cache`                    |
 * | Branch tree codec / geometry    | `PROTO_trie-codec-and-geometry`            |
 * | Cursor + flush lifecycle        | `PROTO_trie-cursor`, `PROTO_trie-flush`    |
 * | Checkpoint envelope publication | `PROTO_checkpoint-envelope-publication`    |
 * | Concrete adapter                | `INFRA_git-trie-store-adapter`             |
 *
 * ## Geometry-agnostic
 *
 * The branch collaborator type `TrieBranchEntries` is
 * `ReadonlyMap<number, string>`. The default geometry populates indices `0..15` for
 * 4-bit nibbles (16-way fanout), but the port signature supports
 * any fanout the geometry benchmark picks — up to the 256-way
 * ceiling set by `RouteKey`. Nothing in this port hardcodes 16.
 *
 * ## Domain bytes
 *
 * Inputs and outputs use `Uint8Array`, never `Buffer`. Adapters
 * that talk to Node's `Buffer` convert at the adapter boundary and
 * never leak `Buffer` into the domain.
 *
 * ## Failure model
 *
 * Implementations throw `TrieStoreError` (see
 * `src/domain/errors/TrieStoreError.ts`) with one of the documented
 * codes. Raw `Error` is banned per anti-sludge policy. Domain
 * consumers `instanceof`-dispatch on the error class and branch on
 * `err.code` for specific outcomes — never on `err.message`.
 */
export default interface TrieStorePort {
  /**
   * Read a leaf page's raw bytes by opaque root handle.
   *
   * Throws `TrieStoreError` with code `E_TRIE_STORE_MISSING` if the
   * root does not exist, or `E_TRIE_STORE_READ` if the backing store
   * fails for any other reason.
   */
  readLeaf(root: string): Promise<Uint8Array>;

  /**
   * Read a branch bundle's nibble-indexed child map by opaque root handle.
   *
   * Throws `TrieStoreError` with code `E_TRIE_STORE_MISSING` if the
   * root does not exist, `E_TRIE_STORE_CORRUPT` if the stored bundle
   * fails branch decoding, or `E_TRIE_STORE_READ` otherwise.
   */
  readBranch(root: string): Promise<TrieBranchEntries>;

  /**
   * Write a leaf page and return its content-addressed root handle.
   *
   * Throws `TrieStoreError` with code `E_TRIE_STORE_WRITE` if the
   * backing store rejects the write.
   */
  writeLeaf(data: Uint8Array): Promise<string>;

  /**
   * Write a branch bundle from its nibble-indexed child map and return
   * its content-addressed root handle.
   *
   * Throws `TrieStoreError` with code `E_TRIE_STORE_WRITE` if the
   * backing store rejects the write.
   */
  writeBranch(children: TrieBranchEntries): Promise<string>;
}
