import { Dot as DotClass, type Dot } from "../../crdt/Dot.ts";
import TrieCursorError from "../../errors/TrieCursorError.ts";
import type CodecPort from "../../../ports/CodecPort.ts";
import RouteKey from "../route/RouteKey.ts";

import DirtyPageSet, { encodeDirtyPath } from "./DirtyPageSet.ts";
import TrieBranch from "./TrieBranch.ts";
import type TrieGeometry from "./TrieGeometry.ts";
import TrieLeaf, { type TrieLeafEntry } from "./TrieLeaf.ts";
import type TrieStorePort from "./TrieStorePort.ts";

import {
  findEntryInLeaf,
  upsertIntoLeaf,
  partitionEntriesByNextNibble,
  shortenEntries,
  tombstoneEntry,
  makeEntry,
  suffixOfRouteKey,
  nibbleBitsOf,
  pendingChildOid,
  validateElement,
  validateDot,
  isMissingStoreError,
  wrapStoreError,
  wrapDecodeError,
} from "./trieCursorHelpers.ts";

/**
 * Initializer for {@link TrieCursor}.
 */
export interface TrieCursorInit {
  readonly rootOid: string | null;
  readonly store: TrieStorePort;
  readonly geometry: TrieGeometry;
  readonly codec: CodecPort;
}

interface InsertContext {
  readonly routeKey: RouteKey;
  readonly element: string;
  readonly encodedDot: string;
  readonly depth: number;
  readonly nibbleBits: 1 | 2 | 4 | 8;
  readonly maxDepth: number;
}

interface SplitContext {
  readonly parentPath: readonly number[];
  readonly leafPath: readonly number[];
  readonly nibbleInParent: number;
  readonly leafDepth: number;
  readonly nibbleBits: 1 | 2 | 4 | 8;
  readonly maxDepth: number;
}

/**
 * Path-descending cursor over the shadow trie.
 *
 * See the cycle 0029 design doc at
 * `docs/design/0029-trie-cursor/trie-cursor.md` for the full
 * contract, split semantics, and error codes.
 */
export default class TrieCursor {
  readonly #initialRootOid: string | null;
  readonly #store: TrieStorePort;
  readonly #geometry: TrieGeometry;
  readonly #codec: CodecPort;

  readonly #dirtyLeaves = new Map<string, TrieLeaf>();
  readonly #dirtyBranches = new Map<string, TrieBranch>();
  readonly #cleanChildren = new Map<string, string>();
  readonly #workingLeaves = new Map<string, TrieLeaf>();
  readonly #workingBranches = new Map<string, TrieBranch>();
  #rootLoaded = false;

  constructor(init: TrieCursorInit) {
    this.#initialRootOid = init.rootOid;
    this.#store = init.store;
    this.#geometry = init.geometry;
    this.#codec = init.codec;
  }

  async contains(element: string): Promise<boolean> {
    validateElement(element);
    const entry = await this.#lookupEntry(element);
    return entry !== null && entry.dots.size > 0;
  }

  async getDots(element: string): Promise<ReadonlySet<string>> {
    validateElement(element);
    const entry = await this.#lookupEntry(element);
    if (entry === null) {
      return new Set<string>();
    }
    return new Set(entry.dots);
  }

  async add(element: string, dot: Dot): Promise<void> {
    validateElement(element);
    validateDot(dot);
    const ctx = this.#makeInsertContext(element, dot);
    await this.#loadRootIfNeeded();
    await this.#insertAtRoot(ctx);
  }

  async remove(observedDots: ReadonlySet<string>): Promise<void> {
    if (observedDots.size === 0) {
      return;
    }
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return;
    }
    await this.#tombstoneBelow([], observedDots);
  }

  async elements(): Promise<readonly string[]> {
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return [];
    }
    const out: string[] = [];
    await this.#visitLeaves([], (leaf) => collectLiveElements(leaf, out));
    return out;
  }

  snapshot(): DirtyPageSet {
    return new DirtyPageSet({
      rootOid: this.#initialRootOid,
      dirtyLeaves: new Map(this.#dirtyLeaves),
      dirtyBranches: new Map(this.#dirtyBranches),
      cleanChildren: new Map(this.#cleanChildren),
    });
  }

  // -- construction helpers --------------------------------------------------

  #makeInsertContext(element: string, dot: Dot): InsertContext {
    const routeKey = RouteKey.fromElement(element);
    const encodedDot = DotClass.encode(dot);
    const nibbleBits = nibbleBitsOf(this.#geometry.nibbleBits);
    return {
      routeKey,
      element,
      encodedDot,
      depth: 0,
      nibbleBits,
      maxDepth: 256 / nibbleBits,
    };
  }

  // -- root management -------------------------------------------------------

  #hasRoot(): boolean {
    return this.#workingBranches.has("") || this.#dirtyBranches.has("");
  }

  async #loadRootIfNeeded(): Promise<void> {
    if (this.#rootLoaded) {
      return;
    }
    this.#rootLoaded = true;
    if (this.#initialRootOid === null) {
      return;
    }
    const rootBranch = await this.#readBranchStrict(this.#initialRootOid, []);
    this.#workingBranches.set("", rootBranch);
  }

  // -- working map accessors -------------------------------------------------

  #branchAt(path: readonly number[]): TrieBranch | null {
    const key = encodeDirtyPath(path);
    return (
      this.#dirtyBranches.get(key) ?? this.#workingBranches.get(key) ?? null
    );
  }

  #leafAt(path: readonly number[]): TrieLeaf | null {
    const key = encodeDirtyPath(path);
    return (
      this.#dirtyLeaves.get(key) ?? this.#workingLeaves.get(key) ?? null
    );
  }

  #markBranchDirty(path: readonly number[], branch: TrieBranch): void {
    const key = encodeDirtyPath(path);
    this.#workingBranches.set(key, branch);
    this.#dirtyBranches.set(key, branch);
  }

  #markLeafDirty(path: readonly number[], leaf: TrieLeaf): void {
    const key = encodeDirtyPath(path);
    this.#workingLeaves.set(key, leaf);
    this.#dirtyLeaves.set(key, leaf);
  }

  #clearLeafAt(path: readonly number[]): void {
    const key = encodeDirtyPath(path);
    this.#dirtyLeaves.delete(key);
    this.#workingLeaves.delete(key);
  }

  #rebindParentBranch(parentPath: readonly number[], nibble: number): void {
    const branch = this.#buildBranchWithPendingChild(parentPath, nibble);
    this.#markBranchDirty(parentPath, branch);
  }

  #buildBranchWithPendingChild(
    path: readonly number[],
    mutatedNibble: number,
  ): TrieBranch {
    const existing = this.#branchAt(path);
    const entries = new Map<number, string>(existing?.entries() ?? []);
    entries.set(mutatedNibble, pendingChildOid(path, mutatedNibble));
    return new TrieBranch(entries, this.#geometry);
  }

  // -- child loading ---------------------------------------------------------

  async #ensureChildLoaded(
    parentPath: readonly number[],
    nibble: number,
    childOid: string,
  ): Promise<"leaf" | "branch" | null> {
    const childPath = [...parentPath, nibble];
    if (this.#leafAt(childPath) !== null) {
      return "leaf";
    }
    if (this.#branchAt(childPath) !== null) {
      return "branch";
    }
    return await this.#loadChildFromStore(childPath, childOid);
  }

  async #loadChildFromStore(
    childPath: readonly number[],
    childOid: string,
  ): Promise<"leaf" | "branch" | null> {
    const leaf = await this.#tryReadLeaf(childOid, childPath);
    if (leaf !== null) {
      this.#workingLeaves.set(encodeDirtyPath(childPath), leaf);
      this.#cleanChildren.set(encodeDirtyPath(childPath), childOid);
      return "leaf";
    }
    const branch = await this.#readBranchStrict(childOid, childPath);
    this.#workingBranches.set(encodeDirtyPath(childPath), branch);
    this.#cleanChildren.set(encodeDirtyPath(childPath), childOid);
    return "branch";
  }

  async #tryReadLeaf(
    oid: string,
    path: readonly number[],
  ): Promise<TrieLeaf | null> {
    let bytes;
    try {
      bytes = await this.#store.readLeaf(oid);
    } catch (raw) {
      if (isMissingStoreError(raw)) {
        return null;
      }
      throw wrapStoreError({ raw, op: "readLeaf", path, oid });
    }
    try {
      return TrieLeaf.deserialize(bytes, this.#geometry, this.#codec);
    } catch (raw) {
      throw wrapDecodeError({ raw, op: "readLeaf", path, oid });
    }
  }

  async #readBranchStrict(
    oid: string,
    path: readonly number[],
  ): Promise<TrieBranch> {
    let entries;
    try {
      entries = await this.#store.readBranch(oid);
    } catch (raw) {
      throw wrapStoreError({ raw, op: "readBranch", path, oid });
    }
    try {
      return new TrieBranch(entries, this.#geometry);
    } catch (raw) {
      throw wrapDecodeError({ raw, op: "readBranch", path, oid });
    }
  }

  // -- read path -------------------------------------------------------------

  async #lookupEntry(element: string): Promise<TrieLeafEntry | null> {
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return null;
    }
    const routeKey = RouteKey.fromElement(element);
    const nibbleBits = nibbleBitsOf(this.#geometry.nibbleBits);
    return await this.#descendForLookup(routeKey, element, nibbleBits);
  }

  async #descendForLookup(
    routeKey: RouteKey,
    element: string,
    nibbleBits: 1 | 2 | 4 | 8,
  ): Promise<TrieLeafEntry | null> {
    const maxDepth = 256 / nibbleBits;
    let path: readonly number[] = [];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const step = await this.#stepLookup({ routeKey, path, depth, nibbleBits });
      if (step.kind === "missing") {
        return null;
      }
      if (step.kind === "leaf") {
        return findEntryInLeaf({ leaf: step.leaf, routeKey, depth: depth + 1, nibbleBits, element });
      }
      path = step.nextPath;
    }
    const terminal = this.#leafAt(path);
    return terminal === null
      ? null
      : findEntryInLeaf({ leaf: terminal, routeKey, depth: maxDepth, nibbleBits, element });
  }

  async #stepLookup(args: {
    readonly routeKey: RouteKey;
    readonly path: readonly number[];
    readonly depth: number;
    readonly nibbleBits: 1 | 2 | 4 | 8;
  }): Promise<LookupStep> {
    const branch = this.#branchAt(args.path);
    if (branch === null) {
      return { kind: "missing" };
    }
    const nibble = args.routeKey.nibbleAt(args.depth, args.nibbleBits);
    const childOid = branch.get(nibble);
    if (childOid === undefined) {
      return { kind: "missing" };
    }
    return await this.#stepIntoChild(args.path, nibble, childOid);
  }

  async #stepIntoChild(
    parentPath: readonly number[],
    nibble: number,
    childOid: string,
  ): Promise<LookupStep> {
    const kind = await this.#ensureChildLoaded(parentPath, nibble, childOid);
    if (kind === null) {
      return { kind: "missing" };
    }
    const nextPath = [...parentPath, nibble];
    if (kind === "leaf") {
      const leaf = this.#leafAt(nextPath);
      return leaf === null ? { kind: "missing" } : { kind: "leaf", leaf };
    }
    return { kind: "branch", nextPath };
  }

  // -- write path ------------------------------------------------------------

  async #insertAtRoot(ctx: InsertContext): Promise<void> {
    if (!this.#hasRoot()) {
      this.#createFirstRoot(ctx);
      return;
    }
    await this.#insertBelowBranch([], ctx);
  }

  #createFirstRoot(ctx: InsertContext): void {
    const rootNibble = ctx.routeKey.nibbleAt(0, ctx.nibbleBits);
    const suffix = suffixOfRouteKey(ctx.routeKey, 1, ctx.nibbleBits);
    const entry = makeEntry(suffix, ctx.element, new Set([ctx.encodedDot]));
    const leaf = new TrieLeaf([entry], this.#geometry);
    this.#markLeafDirty([rootNibble], leaf);
    this.#rebindParentBranch([], rootNibble);
  }

  async #insertBelowBranch(
    parentPath: readonly number[],
    ctx: InsertContext,
  ): Promise<void> {
    const branch = this.#requireBranchAt(parentPath);
    const nibble = ctx.routeKey.nibbleAt(ctx.depth, ctx.nibbleBits);
    const childOid = branch.get(nibble);
    if (childOid === undefined) {
      this.#insertFreshLeafChild(parentPath, nibble, ctx);
      return;
    }
    const kind = await this.#ensureChildLoaded(parentPath, nibble, childOid);
    await this.#dispatchChildInsert({ parentPath, nibble, kind, ctx });
  }

  async #dispatchChildInsert(args: {
    readonly parentPath: readonly number[];
    readonly nibble: number;
    readonly kind: "leaf" | "branch" | null;
    readonly ctx: InsertContext;
  }): Promise<void> {
    const childPath = [...args.parentPath, args.nibble];
    if (args.kind === "leaf") {
      await this.#insertIntoLeafAtPath({
        parentPath: args.parentPath,
        childPath,
        nibble: args.nibble,
        ctx: args.ctx,
      });
      return;
    }
    const nextCtx = advanceCtx(args.ctx);
    await this.#insertBelowBranch(childPath, nextCtx);
  }

  #requireBranchAt(path: readonly number[]): TrieBranch {
    const branch = this.#branchAt(path);
    if (branch === null) {
      throw new TrieCursorError(
        `TrieCursor expected branch at path=${encodeDirtyPath(path)}`,
        {
          code: "E_TRIE_CURSOR_STRUCTURE",
          context: { path: encodeDirtyPath(path) },
        },
      );
    }
    return branch;
  }

  #insertFreshLeafChild(
    parentPath: readonly number[],
    nibble: number,
    ctx: InsertContext,
  ): void {
    const childPath = [...parentPath, nibble];
    const leafDepth = ctx.depth + 1;
    const suffix = suffixOfRouteKey(ctx.routeKey, leafDepth, ctx.nibbleBits);
    const entry = makeEntry(suffix, ctx.element, new Set([ctx.encodedDot]));
    const leaf = new TrieLeaf([entry], this.#geometry);
    this.#markLeafDirty(childPath, leaf);
    this.#rebindParentBranch(parentPath, nibble);
  }

  async #insertIntoLeafAtPath(args: {
    readonly parentPath: readonly number[];
    readonly childPath: readonly number[];
    readonly nibble: number;
    readonly ctx: InsertContext;
  }): Promise<void> {
    const leaf = this.#requireLeafAt(args.childPath);
    const nextLeaf = upsertIntoLeaf({
      leaf,
      routeKey: args.ctx.routeKey,
      leafDepth: args.ctx.depth + 1,
      nibbleBits: args.ctx.nibbleBits,
      element: args.ctx.element,
      encodedDot: args.ctx.encodedDot,
    });
    this.#markLeafDirty(args.childPath, nextLeaf);
    this.#rebindParentBranch(args.parentPath, args.nibble);
    if (nextLeaf.requiresSplit(this.#geometry)) {
      await this.#splitLeaf({
        parentPath: args.parentPath,
        leafPath: args.childPath,
        nibbleInParent: args.nibble,
        leafDepth: args.ctx.depth + 1,
        nibbleBits: args.ctx.nibbleBits,
        maxDepth: args.ctx.maxDepth,
      });
    }
  }

  #requireLeafAt(path: readonly number[]): TrieLeaf {
    const leaf = this.#leafAt(path);
    if (leaf === null) {
      throw new TrieCursorError(
        `TrieCursor expected leaf at path=${encodeDirtyPath(path)}`,
        {
          code: "E_TRIE_CURSOR_STRUCTURE",
          context: { path: encodeDirtyPath(path) },
        },
      );
    }
    return leaf;
  }

  async #splitLeaf(ctx: SplitContext): Promise<void> {
    if (ctx.leafDepth >= ctx.maxDepth) {
      return;
    }
    const leaf = this.#leafAt(ctx.leafPath);
    if (leaf === null) {
      return;
    }
    const partitions = partitionEntriesByNextNibble(leaf, ctx.nibbleBits);
    this.#clearLeafAt(ctx.leafPath);
    const newBranch = this.#installPartitionedLeaves(ctx.leafPath, partitions);
    this.#markBranchDirty(ctx.leafPath, newBranch);
    this.#rebindParentBranch(ctx.parentPath, ctx.nibbleInParent);
    await this.#cascadeSplitsInto(ctx, newBranch);
  }

  #installPartitionedLeaves(
    leafPath: readonly number[],
    partitions: ReadonlyMap<number, readonly TrieLeafEntry[]>,
  ): TrieBranch {
    const childEntries = new Map<number, string>();
    for (const [childNibble, childEntriesList] of partitions) {
      const childPath = [...leafPath, childNibble];
      const childLeaf = new TrieLeaf(
        shortenEntries(childEntriesList),
        this.#geometry,
      );
      this.#markLeafDirty(childPath, childLeaf);
      childEntries.set(childNibble, pendingChildOid(leafPath, childNibble));
    }
    return new TrieBranch(childEntries, this.#geometry);
  }

  async #cascadeSplitsInto(
    parentCtx: SplitContext,
    branch: TrieBranch,
  ): Promise<void> {
    const childDepth = parentCtx.leafDepth + 1;
    for (const [childNibble] of branch.entries()) {
      const childPath = [...parentCtx.leafPath, childNibble];
      const childLeaf = this.#leafAt(childPath);
      if (childLeaf === null || !childLeaf.requiresSplit(this.#geometry)) {
        continue;
      }
      await this.#splitLeaf({
        parentPath: parentCtx.leafPath,
        leafPath: childPath,
        nibbleInParent: childNibble,
        leafDepth: childDepth,
        nibbleBits: parentCtx.nibbleBits,
        maxDepth: parentCtx.maxDepth,
      });
    }
  }

  // -- tombstone walk --------------------------------------------------------

  async #tombstoneBelow(
    path: readonly number[],
    observedDots: ReadonlySet<string>,
  ): Promise<void> {
    const leaf = this.#leafAt(path);
    if (leaf !== null) {
      this.#tombstoneInLeaf(path, leaf, observedDots);
      return;
    }
    const branch = this.#branchAt(path);
    if (branch === null) {
      return;
    }
    await this.#descendTombstone(path, branch, observedDots);
  }

  async #descendTombstone(
    path: readonly number[],
    branch: TrieBranch,
    observedDots: ReadonlySet<string>,
  ): Promise<void> {
    for (const [childNibble, childOid] of branch.entries()) {
      await this.#ensureChildLoaded(path, childNibble, childOid);
      await this.#tombstoneBelow([...path, childNibble], observedDots);
    }
  }

  #tombstoneInLeaf(
    leafPath: readonly number[],
    leaf: TrieLeaf,
    observedDots: ReadonlySet<string>,
  ): void {
    const next = rewriteLeafWithTombstones(leaf, observedDots);
    if (next === null) {
      return;
    }
    this.#markLeafDirty(leafPath, new TrieLeaf(next, this.#geometry));
  }

  // -- leaf walk (elements) --------------------------------------------------

  async #visitLeaves(
    path: readonly number[],
    visit: (leaf: TrieLeaf) => void,
  ): Promise<void> {
    const leaf = this.#leafAt(path);
    if (leaf !== null) {
      visit(leaf);
      return;
    }
    const branch = this.#branchAt(path);
    if (branch === null) {
      return;
    }
    await this.#descendVisit(path, branch, visit);
  }

  async #descendVisit(
    path: readonly number[],
    branch: TrieBranch,
    visit: (leaf: TrieLeaf) => void,
  ): Promise<void> {
    const nibbles = [...branch.entries().keys()].sort((a, b) => a - b);
    for (const nibble of nibbles) {
      const childOid = branch.get(nibble);
      if (childOid === undefined) {
        continue;
      }
      await this.#ensureChildLoaded(path, nibble, childOid);
      await this.#visitLeaves([...path, nibble], visit);
    }
  }
}

// -- helper: advance insert context ----------------------------------------

function advanceCtx(ctx: InsertContext): InsertContext {
  return {
    routeKey: ctx.routeKey,
    element: ctx.element,
    encodedDot: ctx.encodedDot,
    depth: ctx.depth + 1,
    nibbleBits: ctx.nibbleBits,
    maxDepth: ctx.maxDepth,
  };
}

// -- helper: tombstone a whole leaf ----------------------------------------

function rewriteLeafWithTombstones(
  leaf: TrieLeaf,
  observedDots: ReadonlySet<string>,
): TrieLeafEntry[] | null {
  let changed = false;
  const out: TrieLeafEntry[] = [];
  for (const entry of leaf.entries()) {
    const result = tombstoneEntry(entry, observedDots);
    if (result.changed) {
      changed = true;
    }
    out.push(result.entry);
  }
  return changed ? out : null;
}

// -- helper: collect elements from a leaf -----------------------------------

function collectLiveElements(leaf: TrieLeaf, out: string[]): void {
  for (const entry of leaf.entries()) {
    if (entry.dots.size > 0) {
      out.push(entry.element);
    }
  }
}

// -- discriminated union for descent step ----------------------------------

type LookupStep =
  | { readonly kind: "missing" }
  | { readonly kind: "leaf"; readonly leaf: TrieLeaf }
  | { readonly kind: "branch"; readonly nextPath: readonly number[] };
