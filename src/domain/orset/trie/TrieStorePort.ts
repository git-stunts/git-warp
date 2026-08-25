import type { TrieBranchEntries } from "./TrieBranchEntries.ts";
import type ArtifactStagingPort from "../../../ports/ArtifactStagingPort.ts";

/**
 * Storage port for the shadow-trie ORSet's content-addressed backing.
 *
 * Branch nodes are immutable bundles and leaf nodes are immutable pages.
 * This port is the minimum contract required for the trie cursor, codec,
 * and session layers to exchange those two artifact kinds with a concrete
 * backend without knowing anything about its object model or retention
 * plumbing. Writes may join an existing staging scope so a complete trie
 * remains reachable until its final owner is installed.
 *
 * ## Core methods plus optional write waves
 *
 * - `readLeaf(root)` — read a leaf page's raw bytes.
 * - `readBranch(root)` — read a branch bundle as its nibble-indexed
 *   child map.
 * - `writeLeaf(data, staging?)` — write or stage a page and return its handle.
 * - `writeBranch(children, staging?)` — write or stage a bundle and return its handle.
 * - `writeLeaves(...)` — optionally write one bounded ordered leaf wave.
 * - `writeBranches(...)` — optionally write one bounded dependency-depth wave.
 *
 * There are no batch reads, page caching, geometry configuration, or
 * checkpoint-envelope publication concerns here. Those live in other modules.
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
  writeLeaf(data: Uint8Array, staging?: ArtifactStagingPort): Promise<string>;

  /**
   * Optionally write an input-ordered leaf wave through one bounded storage
   * operation. Implementations must return one root per input in the same
   * order. Callers fall back to {@link writeLeaf} when this method is absent.
   */
  writeLeaves?(
    leaves: readonly Uint8Array[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]>;

  /**
   * Write a branch bundle from its nibble-indexed child map and return
   * its content-addressed root handle.
   *
   * Throws `TrieStoreError` with code `E_TRIE_STORE_WRITE` if the
   * backing store rejects the write.
   */
  writeBranch(children: TrieBranchEntries, staging?: ArtifactStagingPort): Promise<string>;

  /**
   * Optionally write one input-ordered branch dependency wave. Every child
   * root in the wave must already exist. Callers fall back to
   * {@link writeBranch} when this method is absent.
   */
  writeBranches?(
    branches: readonly TrieBranchEntries[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]>;
}
