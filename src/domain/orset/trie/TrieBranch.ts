import TrieBranchError from "../../errors/TrieBranchError.ts";

import type { TrieBranchEntries } from "./TrieBranchEntries.ts";
import type TrieGeometry from "./TrieGeometry.ts";

/**
 * Runtime-backed branch node of the shadow trie.
 *
 * A branch maps nibble indices in `[0, fanout)` to child OIDs
 * (children are themselves either branches or leaves; this class
 * does not distinguish the two at its level). The class wraps a
 * `TrieBranchEntries` map and enforces the fanout range in the
 * constructor.
 *
 * ## Immutability
 *
 * `set(nibble, oid)` returns a NEW `TrieBranch` instance. The
 * original is unchanged. This matches the copy-on-write flavor of
 * the downstream cursor/flush pipeline without requiring the
 * caller to juggle a mutable map.
 *
 * ## Adapter naming convention
 *
 * The Git-tree adapter (`INFRA_git-trie-store-adapter`, a later
 * cycle) names branch-tree entries after `nibble.toString(16)`
 * when it writes the entries to a real Git tree. For v1's 4-bit
 * nibbles that produces `"0".."f"`; for 8-bit nibbles it would
 * produce `"0".."ff"`. The codec itself does NOT write Git trees —
 * that is the adapter's job — but the naming convention is
 * documented here so consumers know where the hex-string entry
 * names come from when they read Git's object store directly.
 *
 * ## Geometry
 *
 * The geometry the branch was constructed under is held on the
 * instance and used to validate every mutation. A `set` call with
 * a nibble index outside `[0, fanout)` raises
 * `TrieBranchError` with code `E_TRIE_BRANCH_NIBBLE_RANGE`.
 */
export default class TrieBranch {
  readonly geometry: TrieGeometry;
  private readonly children: ReadonlyMap<number, string>;

  constructor(children: TrieBranchEntries, geometry: TrieGeometry) {
    validateChildren(children, geometry);
    this.children = new Map(children);
    this.geometry = geometry;
    Object.freeze(this);
  }

  /**
   * Return the child OID at the given nibble index, or `undefined`
   * if the slot is empty.
   */
  get(nibble: number): string | undefined {
    return this.children.get(nibble);
  }

  /**
   * Return a new `TrieBranch` with the given child OID set at
   * `nibble`. The original instance is unchanged.
   */
  set(nibble: number, oid: string): TrieBranch {
    validateChild(nibble, oid, this.geometry);
    const next = new Map(this.children);
    next.set(nibble, oid);
    return new TrieBranch(next, this.geometry);
  }

  /**
   * Return the storage-facing `TrieBranchEntries` map ready to hand
   * to `TrieStorePort.writeBranch`. A fresh map is returned so the
   * caller cannot mutate the branch's internal state.
   */
  entries(): TrieBranchEntries {
    return new Map(this.children);
  }

  /**
   * Number of populated slots.
   */
  childCount(): number {
    return this.children.size;
  }
}

function validateChildren(
  children: TrieBranchEntries,
  geometry: TrieGeometry,
): void {
  for (const [nibble, oid] of children) {
    validateChild(nibble, oid, geometry);
  }
}

function validateChild(
  nibble: number,
  oid: string,
  geometry: TrieGeometry,
): void {
  validateNibble(nibble, geometry);
  validateOid(oid);
}

function validateNibble(nibble: number, geometry: TrieGeometry): void {
  if (!Number.isInteger(nibble) || nibble < 0) {
    throw new TrieBranchError(
      `TrieBranch nibble index must be a non-negative integer; received ${String(nibble)}`,
      { code: "E_TRIE_BRANCH_NIBBLE_SHAPE" },
    );
  }
  if (nibble >= geometry.fanout) {
    throw new TrieBranchError(
      `TrieBranch nibble index ${String(nibble)} is out of range for fanout=${String(geometry.fanout)}`,
      { code: "E_TRIE_BRANCH_NIBBLE_RANGE" },
    );
  }
}

function validateOid(oid: string): void {
  if (typeof oid !== "string" || oid.length === 0) {
    throw new TrieBranchError(
      `TrieBranch child OID must be a non-empty string; received ${String(oid)}`,
      { code: "E_TRIE_BRANCH_CHILD_OID" },
    );
  }
}
