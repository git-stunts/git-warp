import TrieCursorError from "../../errors/TrieCursorError.ts";

import type TrieBranch from "./TrieBranch.ts";
import type TrieLeaf from "./TrieLeaf.ts";

/**
 * Path-key encoding used throughout the dirty snapshot.
 *
 * Each path is the sequence of nibble indices taken from the root.
 * The canonical string form is the hex of each nibble joined by
 * `/`; the empty path (the root) encodes as the empty string.
 *
 * Examples:
 * - `[]`       -> `''`
 * - `[0]`      -> `'0'`
 * - `[15, 3]`  -> `'f/3'`
 * - `[0, 10, 255]` -> `'0/a/ff'`
 *
 * The encoding is load-bearing across the cursor/flush handoff:
 * the flusher retrieves dirty leaves and branches by the exact
 * same key the cursor stored them under.
 */
export function encodeDirtyPath(path: readonly number[]): string {
  let out = "";
  for (let i = 0; i < path.length; i += 1) {
    if (i > 0) {
      out += "/";
    }
    const nibble = path[i] ?? 0;
    out += nibble.toString(16);
  }
  return out;
}

/**
 * Initializer for {@link DirtyPageSet}.
 *
 * Fields mirror the class surface 1:1 so construction is a single
 * assignment with no parsing.
 */
export interface DirtyPageSetInit {
  readonly rootOid: string | null;
  readonly dirtyLeaves: ReadonlyMap<string, TrieLeaf>;
  readonly dirtyBranches: ReadonlyMap<string, TrieBranch>;
  readonly cleanChildren: ReadonlyMap<string, string>;
}

/**
 * Entry yielded by {@link DirtyPageSet.enumerateBottomUp}.
 *
 * Named so consumers of the iterator can destructure `path` and
 * `node` without re-inventing the tuple shape per call site.
 */
export interface DirtyPageEntry {
  readonly path: readonly number[];
  readonly node: TrieLeaf | TrieBranch;
}

/**
 * Immutable snapshot of the cursor's working state.
 *
 * A `DirtyPageSet` captures everything the flusher needs to turn
 * in-memory mutations into a fresh Git root OID:
 *
 * - `rootOid` — the OID the cursor was opened against, or `null`
 *   if it started from an empty trie. The flusher returns this
 *   value unchanged when the snapshot is empty.
 * - `dirtyLeaves` — leaves the cursor modified, keyed by
 *   {@link encodeDirtyPath} of their trie path.
 * - `dirtyBranches` — branches the cursor modified (or created,
 *   in the case of splits), keyed the same way.
 * - `cleanChildren` — subtrees the cursor touched during descent
 *   but did not modify. Their OIDs are remembered so the flusher
 *   can place them back into the parent's child map without
 *   re-writing them.
 *
 * Construction freezes the instance and validates that no path
 * appears as both a dirty leaf and a dirty branch. It does NOT
 * deep-freeze the underlying maps — callers must not mutate the
 * maps they pass in.
 *
 * There are no mutation methods on the class. Creating a modified
 * snapshot means constructing a new `DirtyPageSet` with fresh
 * maps. This is deliberate: the snapshot is the handoff contract
 * between `TrieCursor` and `TrieFlusher`, and "mutation after
 * snapshot" would violate that contract.
 */
export default class DirtyPageSet {
  readonly #rootOid: string | null;
  readonly #dirtyLeaves: ReadonlyMap<string, TrieLeaf>;
  readonly #dirtyBranches: ReadonlyMap<string, TrieBranch>;
  readonly #cleanChildren: ReadonlyMap<string, string>;

  constructor(init: DirtyPageSetInit) {
    validateNoPathOverlap(init.dirtyLeaves, init.dirtyBranches);
    this.#rootOid = init.rootOid;
    this.#dirtyLeaves = init.dirtyLeaves;
    this.#dirtyBranches = init.dirtyBranches;
    this.#cleanChildren = init.cleanChildren;
    Object.freeze(this);
  }

  /**
   * OID the snapshot was opened against, or `null` for an empty
   * trie. The flusher returns this value when the snapshot is
   * empty.
   */
  rootOid(): string | null {
    return this.#rootOid;
  }

  /**
   * Returns the dirty leaf at `path`, or `null` if no dirty leaf
   * is recorded at that path.
   */
  dirtyLeafAt(path: readonly number[]): TrieLeaf | null {
    return this.#dirtyLeaves.get(encodeDirtyPath(path)) ?? null;
  }

  /**
   * Returns the dirty branch at `path`, or `null` if no dirty
   * branch is recorded at that path.
   */
  dirtyBranchAt(path: readonly number[]): TrieBranch | null {
    return this.#dirtyBranches.get(encodeDirtyPath(path)) ?? null;
  }

  /**
   * Returns the clean (unmodified) child OID at `path`, or `null`
   * if none is recorded. The flusher uses this to preserve
   * structural sharing for subtrees the cursor never touched.
   */
  cleanChildOidAt(path: readonly number[]): string | null {
    return this.#cleanChildren.get(encodeDirtyPath(path)) ?? null;
  }

  /**
   * Iterate every dirty page in deterministic bottom-up order:
   * deepest path first, ties broken by nibble-order ascending.
   *
   * This ordering is the flusher's contract: leaves and branches
   * are visited in an order that guarantees a parent's children
   * are all persisted before the parent itself.
   */
  *enumerateBottomUp(): IterableIterator<DirtyPageEntry> {
    const entries = collectAllEntries(
      this.#dirtyLeaves,
      this.#dirtyBranches,
    );
    entries.sort(compareByDepthDescendingThenNibbleAscending);
    for (const entry of entries) {
      yield entry;
    }
  }

  /**
   * Returns true when the snapshot contains no dirty leaves and
   * no dirty branches.
   */
  isEmpty(): boolean {
    return this.#dirtyLeaves.size === 0 && this.#dirtyBranches.size === 0;
  }

  /**
   * An empty snapshot holding a fixed root OID. Convenience for
   * opening a cursor against an empty trie and immediately taking
   * a snapshot that records no work.
   */
  static emptyForRoot(rootOid: string | null): DirtyPageSet {
    return new DirtyPageSet({
      rootOid,
      dirtyLeaves: new Map<string, TrieLeaf>(),
      dirtyBranches: new Map<string, TrieBranch>(),
      cleanChildren: new Map<string, string>(),
    });
  }
}

function validateNoPathOverlap(
  dirtyLeaves: ReadonlyMap<string, TrieLeaf>,
  dirtyBranches: ReadonlyMap<string, TrieBranch>,
): void {
  for (const key of dirtyLeaves.keys()) {
    if (dirtyBranches.has(key)) {
      throw new TrieCursorError(
        `DirtyPageSet path ${key} is both a dirty leaf and a dirty branch`,
        {
          code: "E_TRIE_CURSOR_STRUCTURE",
          context: { pathKey: key },
        },
      );
    }
  }
}

function collectAllEntries(
  dirtyLeaves: ReadonlyMap<string, TrieLeaf>,
  dirtyBranches: ReadonlyMap<string, TrieBranch>,
): DirtyPageEntry[] {
  const out: DirtyPageEntry[] = [];
  for (const [key, leaf] of dirtyLeaves) {
    out.push({ path: decodeDirtyPath(key), node: leaf });
  }
  for (const [key, branch] of dirtyBranches) {
    out.push({ path: decodeDirtyPath(key), node: branch });
  }
  return out;
}

function decodeDirtyPath(key: string): readonly number[] {
  if (key.length === 0) {
    return [];
  }
  const parts = key.split("/");
  const out: number[] = [];
  for (const part of parts) {
    out.push(parseInt(part, 16));
  }
  return out;
}

function compareByDepthDescendingThenNibbleAscending(
  left: DirtyPageEntry,
  right: DirtyPageEntry,
): number {
  if (left.path.length !== right.path.length) {
    return right.path.length - left.path.length;
  }
  return comparePathsLexicographically(left.path, right.path);
}

function comparePathsLexicographically(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) {
      return a - b;
    }
  }
  return 0;
}
