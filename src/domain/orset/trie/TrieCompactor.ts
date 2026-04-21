import { Dot } from "../../crdt/Dot.ts";
import type VersionVector from "../../crdt/VersionVector.ts";

import TrieBranch from "./TrieBranch.ts";
import type TrieGeometry from "./TrieGeometry.ts";
import TrieLeaf, { type TrieLeafEntry } from "./TrieLeaf.ts";
import { compareBytes, pendingChildOid } from "./trieCursorHelpers.ts";

type LoadChildKind = "leaf" | "branch" | null;

export type TrieCompactorInit = {
  readonly geometry: TrieGeometry;
  readonly nibbleBits: 1 | 2 | 4 | 8;
  readonly loadRootIfNeeded: () => Promise<void>;
  readonly hasRoot: () => boolean;
  readonly leafAt: (path: readonly number[]) => TrieLeaf | null;
  readonly branchAt: (path: readonly number[]) => TrieBranch | null;
  readonly ensureChildLoaded: (
    parentPath: readonly number[],
    nibble: number,
    childOid: string,
  ) => Promise<LoadChildKind>;
  readonly markLeafDirty: (
    path: readonly number[],
    leaf: TrieLeaf,
  ) => void;
  readonly markBranchDirty: (
    path: readonly number[],
    branch: TrieBranch,
  ) => void;
  readonly clearLeafAt: (path: readonly number[]) => void;
  readonly clearBranchAt: (path: readonly number[]) => void;
};

type NodeState =
  | { readonly kind: "absent"; readonly changed: boolean }
  | { readonly kind: "leaf"; readonly changed: boolean; readonly leaf: TrieLeaf }
  | {
      readonly kind: "branch";
      readonly changed: boolean;
      readonly branch: TrieBranch;
    };

type MergeCandidate = {
  readonly keepNibble: number;
  readonly dropNibble: number;
  readonly mergedLeaf: TrieLeaf;
};

export default class TrieCompactor {
  readonly #geometry: TrieGeometry;
  readonly #nibbleBits: 1 | 2 | 4 | 8;
  readonly #loadRootIfNeeded: () => Promise<void>;
  readonly #hasRoot: () => boolean;
  readonly #leafAt: (path: readonly number[]) => TrieLeaf | null;
  readonly #branchAt: (path: readonly number[]) => TrieBranch | null;
  readonly #ensureChildLoaded: (
    parentPath: readonly number[],
    nibble: number,
    childOid: string,
  ) => Promise<LoadChildKind>;
  readonly #markLeafDirty: (path: readonly number[], leaf: TrieLeaf) => void;
  readonly #markBranchDirty: (
    path: readonly number[],
    branch: TrieBranch,
  ) => void;
  readonly #clearLeafAt: (path: readonly number[]) => void;
  readonly #clearBranchAt: (path: readonly number[]) => void;

  constructor(init: TrieCompactorInit) {
    this.#geometry = init.geometry;
    this.#nibbleBits = init.nibbleBits;
    this.#loadRootIfNeeded = init.loadRootIfNeeded;
    this.#hasRoot = init.hasRoot;
    this.#leafAt = init.leafAt;
    this.#branchAt = init.branchAt;
    this.#ensureChildLoaded = init.ensureChildLoaded;
    this.#markLeafDirty = init.markLeafDirty;
    this.#markBranchDirty = init.markBranchDirty;
    this.#clearLeafAt = init.clearLeafAt;
    this.#clearBranchAt = init.clearBranchAt;
    Object.freeze(this);
  }

  async compact(includedVV: VersionVector): Promise<void> {
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return;
    }
    await this.#compactBelow([], includedVV);
  }

  async #compactBelow(
    path: readonly number[],
    includedVV: VersionVector,
  ): Promise<NodeState> {
    const leaf = this.#leafAt(path);
    if (leaf !== null) {
      return this.#compactLeaf(path, leaf, includedVV);
    }
    const branch = this.#branchAt(path);
    if (branch === null) {
      return { kind: "absent", changed: false };
    }
    return await this.#compactBranch(path, branch, includedVV);
  }

  #compactLeaf(
    path: readonly number[],
    leaf: TrieLeaf,
    includedVV: VersionVector,
  ): NodeState {
    const result = compactLeafEntries(leaf.entries(), includedVV);
    if (!result.changed) {
      return { kind: "leaf", changed: false, leaf };
    }
    if (result.entries.length === 0) {
      this.#clearLeafAt(path);
      return { kind: "absent", changed: true };
    }
    const nextLeaf = new TrieLeaf(result.entries, this.#geometry);
    this.#markLeafDirty(path, nextLeaf);
    return { kind: "leaf", changed: true, leaf: nextLeaf };
  }

  async #compactBranch(
    path: readonly number[],
    branch: TrieBranch,
    includedVV: VersionVector,
  ): Promise<NodeState> {
    const childStates = new Map<number, NodeState>();
    for (const [childNibble, childOid] of branch.entries()) {
      await this.#ensureChildLoaded(path, childNibble, childOid);
      childStates.set(
        childNibble,
        await this.#compactBelow([...path, childNibble], includedVV),
      );
    }
    let changed = false;
    for (const state of childStates.values()) {
      if (state.changed || state.kind === "absent") {
        changed = true;
      }
    }
    if (this.#mergeSiblingLeaves(path, childStates)) {
      changed = true;
    }
    return this.#rewriteBranch(path, branch, childStates, changed);
  }

  #mergeSiblingLeaves(
    path: readonly number[],
    childStates: Map<number, NodeState>,
  ): boolean {
    let merged = false;
    while (true) {
      const candidate = this.#findMergeCandidate(childStates);
      if (candidate === null) {
        return merged;
      }
      this.#markLeafDirty(
        [...path, candidate.keepNibble],
        candidate.mergedLeaf,
      );
      this.#clearLeafAt([...path, candidate.dropNibble]);
      childStates.set(candidate.keepNibble, {
        kind: "leaf",
        changed: true,
        leaf: candidate.mergedLeaf,
      });
      childStates.delete(candidate.dropNibble);
      merged = true;
    }
  }

  #findMergeCandidate(
    childStates: ReadonlyMap<number, NodeState>,
  ): MergeCandidate | null {
    const nibbles = [...childStates.keys()].sort((a, b) => a - b);
    for (const nibble of nibbles) {
      const state = childStates.get(nibble);
      if (state?.kind !== "leaf") {
        continue;
      }
      if (!state.leaf.requiresMerge(this.#geometry)) {
        continue;
      }
      for (const siblingNibble of nibbles) {
        if (siblingNibble === nibble) {
          continue;
        }
        const sibling = childStates.get(siblingNibble);
        if (sibling?.kind !== "leaf") {
          continue;
        }
        const combinedSize = state.leaf.size() + sibling.leaf.size();
        if (combinedSize > this.#geometry.leafCapacity) {
          continue;
        }
        const keepNibble = Math.min(nibble, siblingNibble);
        const dropNibble = Math.max(nibble, siblingNibble);
        const leftLeaf = childStates.get(keepNibble);
        const rightLeaf = childStates.get(dropNibble);
        if (leftLeaf?.kind !== "leaf" || rightLeaf?.kind !== "leaf") {
          continue;
        }
        return {
          keepNibble,
          dropNibble,
          mergedLeaf: mergeLeaves(leftLeaf.leaf, rightLeaf.leaf, this.#geometry),
        };
      }
    }
    return null;
  }

  #rewriteBranch(
    path: readonly number[],
    branch: TrieBranch,
    childStates: ReadonlyMap<number, NodeState>,
    childChanged: boolean,
  ): NodeState {
    const nextChildren = new Map<number, string>();
    let changed = childChanged;
    for (const [childNibble, childOid] of branch.entries()) {
      const state = childStates.get(childNibble);
      if (state === undefined || state.kind === "absent") {
        changed = true;
        continue;
      }
      if (state.changed) {
        nextChildren.set(childNibble, pendingChildOid(path, childNibble));
        changed = true;
        continue;
      }
      nextChildren.set(childNibble, childOid);
    }
    if (nextChildren.size === 0) {
      if (path.length === 0) {
        const emptyRoot = new TrieBranch(new Map<number, string>(), this.#geometry);
        this.#markBranchDirty([], emptyRoot);
        return { kind: "branch", changed: true, branch: emptyRoot };
      }
      this.#clearBranchAt(path);
      return { kind: "absent", changed: true };
    }
    if (nextChildren.size === 1 && path.length > 0) {
      const [onlyNibble] = nextChildren.keys();
      if (onlyNibble === undefined) {
        return { kind: "branch", changed, branch };
      }
      const state = childStates.get(onlyNibble);
      if (state?.kind === "leaf") {
        this.#clearLeafAt([...path, onlyNibble]);
        this.#clearBranchAt(path);
        const collapsedLeaf = collapseLeafUp(
          state.leaf,
          onlyNibble,
          path.length + 1,
          this.#nibbleBits,
          this.#geometry,
        );
        this.#markLeafDirty(path, collapsedLeaf);
        return { kind: "leaf", changed: true, leaf: collapsedLeaf };
      }
    }
    if (!changed) {
      return { kind: "branch", changed: false, branch };
    }
    const nextBranch = new TrieBranch(nextChildren, this.#geometry);
    this.#markBranchDirty(path, nextBranch);
    return { kind: "branch", changed: true, branch: nextBranch };
  }
}

function compactLeafEntries(
  entries: ReadonlyArray<TrieLeafEntry>,
  includedVV: VersionVector,
): { readonly changed: boolean; readonly entries: readonly TrieLeafEntry[] } {
  let changed = false;
  const compacted: TrieLeafEntry[] = [];
  for (const entry of entries) {
    const nextLive = new Set<string>();
    const nextTombstoned = new Set<string>();
    let entryChanged = false;
    for (const dot of entry.dots) {
      if (entry.tombstonedDots.has(dot) && includedVV.contains(Dot.decode(dot))) {
        entryChanged = true;
        continue;
      }
      nextLive.add(dot);
    }
    for (const dot of entry.tombstonedDots) {
      if (includedVV.contains(Dot.decode(dot))) {
        entryChanged = true;
        continue;
      }
      nextTombstoned.add(dot);
    }
    if (nextLive.size === 0 && nextTombstoned.size === 0) {
      changed = true;
      continue;
    }
    changed = changed || entryChanged;
    compacted.push({
      routeKeySuffix: entry.routeKeySuffix,
      element: entry.element,
      dots: nextLive,
      tombstonedDots: nextTombstoned,
    });
  }
  return { changed, entries: compacted };
}

function mergeLeaves(
  left: TrieLeaf,
  right: TrieLeaf,
  geometry: TrieGeometry,
): TrieLeaf {
  const merged = [...left.entries(), ...right.entries()];
  merged.sort((a, b) => compareBytes(a.routeKeySuffix, b.routeKeySuffix));
  return new TrieLeaf(merged, geometry);
}

function collapseLeafUp(
  leaf: TrieLeaf,
  childNibble: number,
  childDepth: number,
  nibbleBits: 1 | 2 | 4 | 8,
  geometry: TrieGeometry,
): TrieLeaf {
  const lengthened = leaf.entries().map((entry) => ({
    routeKeySuffix: prependNibbleToSuffix({
      suffix: entry.routeKeySuffix,
      nibble: childNibble,
      depth: childDepth,
      nibbleBits,
    }),
    element: entry.element,
    dots: entry.dots,
    tombstonedDots: entry.tombstonedDots,
  }));
  lengthened.sort((a, b) => compareBytes(a.routeKeySuffix, b.routeKeySuffix));
  return new TrieLeaf(lengthened, geometry);
}

function prependNibbleToSuffix(args: {
  readonly suffix: Uint8Array;
  readonly nibble: number;
  readonly depth: number;
  readonly nibbleBits: 1 | 2 | 4 | 8;
}): Uint8Array {
  const oldSlots = (256 - args.depth * args.nibbleBits) / args.nibbleBits;
  const totalSlots = oldSlots + 1;
  const totalBits = totalSlots * args.nibbleBits;
  const out = new Uint8Array(Math.ceil(totalBits / 8));
  writeSlot(out, 0, args.nibbleBits, args.nibble);
  for (let i = 0; i < oldSlots; i += 1) {
    writeSlot(out, i + 1, args.nibbleBits, readSlot(args.suffix, i, args.nibbleBits));
  }
  return out;
}

function readSlot(
  suffix: Uint8Array,
  slot: number,
  nibbleBits: 1 | 2 | 4 | 8,
): number {
  const bitOffset = slot * nibbleBits;
  const byteIndex = Math.floor(bitOffset / 8);
  const bitInByte = bitOffset % 8;
  const shift = 8 - nibbleBits - bitInByte;
  const mask = (1 << nibbleBits) - 1;
  return ((suffix[byteIndex] ?? 0) >>> shift) & mask;
}

function writeSlot(
  out: Uint8Array,
  slot: number,
  nibbleBits: 1 | 2 | 4 | 8,
  value: number,
): void {
  const bitOffset = slot * nibbleBits;
  const byteIndex = Math.floor(bitOffset / 8);
  const bitInByte = bitOffset % 8;
  const shift = 8 - nibbleBits - bitInByte;
  const prev = out[byteIndex] ?? 0;
  out[byteIndex] = (prev | (value << shift)) & 0xff;
}
