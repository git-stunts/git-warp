import { Dot as DotClass, type Dot } from "../../crdt/Dot.ts";
import type VersionVector from "../../crdt/VersionVector.ts";
import TrieCursorError from "../../errors/TrieCursorError.ts";
import ORSetElementState from "../ORSetElementState.ts";
import type CodecPort from "../../../ports/CodecPort.ts";
import RouteKey, { type NibbleBits } from "../route/RouteKey.ts";

import DirtyPageSet, { encodeDirtyPath } from "./DirtyPageSet.ts";
import type PageCache from "./PageCache.ts";
import TrieBranch from "./TrieBranch.ts";
import TrieCompactor from "./TrieCompactor.ts";
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
  readonly pageCache: PageCache;
}

interface InsertContext {
  readonly routeKey: RouteKey;
  readonly element: string;
  readonly encodedDot: string;
  readonly depth: number;
  readonly nibbleBits: NibbleBits;
  readonly maxDepth: number;
}

interface SplitContext {
  readonly parentPath: readonly number[];
  readonly leafPath: readonly number[];
  readonly nibbleInParent: number;
  readonly leafDepth: number;
  readonly nibbleBits: NibbleBits;
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
  readonly #pageCache: PageCache;

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
    this.#pageCache = init.pageCache;
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

  async getElementState(element: string): Promise<ORSetElementState | null> {
    validateElement(element);
    const entry = await this.#lookupEntry(element);
    return entry === null ? null : elementStateOfEntry(entry);
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

  async removeElement(element: string, observedDots: ReadonlySet<string>): Promise<void> {
    validateElement(element);
    if (observedDots.size === 0) {
      return;
    }
    const located = await this.#locateEntry(element);
    if (located === null) {
      return;
    }
    const next = rewriteElementWithTombstones(located.leaf, element, observedDots);
    if (next !== null) {
      this.#markLoadedLeafMutation(located.path, new TrieLeaf(next, this.#geometry));
    }
  }

  async compact(includedVV: VersionVector): Promise<void> {
    const compactor = new TrieCompactor({
      geometry: this.#geometry,
      nibbleBits: nibbleBitsOf(this.#geometry.nibbleBits),
      loadRootIfNeeded: async () => await this.#loadRootIfNeeded(),
      hasRoot: () => this.#hasRoot(),
      leafAt: (path) => this.#leafAt(path),
      branchAt: (path) => this.#branchAt(path),
      ensureChildLoaded: async (parentPath, nibble, childOid) =>
        await this.#ensureChildLoaded(parentPath, nibble, childOid),
      markLeafDirty: (path, leaf) => this.#markLeafDirty(path, leaf),
      markBranchDirty: (path, branch) => this.#markBranchDirty(path, branch),
      clearLeafAt: (path) => this.#clearLeafAt(path),
      clearBranchAt: (path) => this.#clearBranchAt(path),
    });
    await compactor.compact(includedVV);
  }

  async elements(): Promise<readonly string[]> {
    const out: string[] = [];
    for await (const element of this.scan()) {
      out.push(element);
    }
    return out;
  }

  async *scan(): AsyncIterable<string> {
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return;
    }
    yield* this.#scanBelow([]);
  }

  async *scanElementStates(): AsyncIterable<ORSetElementState> {
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return;
    }
    yield* this.#scanElementStatesBelow([]);
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
      maxDepth: Math.floor(256 / nibbleBits),
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
    const cachedRoot = this.#pageCache.get(this.#initialRootOid);
    if (cachedRoot !== null) {
      if (!(cachedRoot instanceof TrieBranch)) {
        throw new TrieCursorError(
          `TrieCursor expected cached branch at root oid=${this.#initialRootOid}`,
          {
            code: "E_TRIE_CURSOR_STRUCTURE",
            context: { oid: this.#initialRootOid, kind: "leaf" },
          },
        );
      }
      this.#workingBranches.set("", cachedRoot);
      return;
    }
    const rootBranch = await this.#readBranchStrict(this.#initialRootOid, []);
    this.#pageCache.put(this.#initialRootOid, rootBranch);
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

  #markLoadedLeafMutation(path: readonly number[], leaf: TrieLeaf): void {
    this.#markLeafDirty(path, leaf);
    let parentDepth = path.length - 1;
    for (const nibble of [...path].reverse()) {
      this.#rebindParentBranch(path.slice(0, parentDepth), nibble);
      parentDepth -= 1;
    }
  }

  #clearLeafAt(path: readonly number[]): void {
    const key = encodeDirtyPath(path);
    this.#dirtyLeaves.delete(key);
    this.#workingLeaves.delete(key);
  }

  #clearBranchAt(path: readonly number[]): void {
    const key = encodeDirtyPath(path);
    this.#dirtyBranches.delete(key);
    this.#workingBranches.delete(key);
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
    const cachedPage = this.#pageCache.get(childOid);
    if (cachedPage !== null) {
      if (cachedPage instanceof TrieLeaf) {
        this.#workingLeaves.set(encodeDirtyPath(childPath), cachedPage);
        this.#cleanChildren.set(encodeDirtyPath(childPath), childOid);
        return "leaf";
      }
      this.#workingBranches.set(encodeDirtyPath(childPath), cachedPage);
      this.#cleanChildren.set(encodeDirtyPath(childPath), childOid);
      return "branch";
    }
    const leaf = await this.#tryReadLeaf(childOid, childPath);
    if (leaf !== null) {
      this.#pageCache.put(childOid, leaf);
      this.#workingLeaves.set(encodeDirtyPath(childPath), leaf);
      this.#cleanChildren.set(encodeDirtyPath(childPath), childOid);
      return "leaf";
    }
    const branch = await this.#readBranchStrict(childOid, childPath);
    this.#pageCache.put(childOid, branch);
    this.#workingBranches.set(encodeDirtyPath(childPath), branch);
    this.#cleanChildren.set(encodeDirtyPath(childPath), childOid);
    return "branch";
  }

  async #tryReadLeaf(
    oid: string,
    path: readonly number[],
  ): Promise<TrieLeaf | null> {
    const bytes = await this.#readLeafBytesAllowingMissing(oid, path);
    if (bytes === null || bytes.length === 0) {
      // A zero-length `readLeaf` result is the adapter's
      // ambiguous signal that the OID is actually a tree — fall
      // through to `readBranch`. Some adapters error instead of
      // returning empty; both paths converge here.
      return null;
    }
    return this.#decodeBytesAsLeafOrFallThrough(bytes);
  }

  #decodeBytesAsLeafOrFallThrough(bytes: Uint8Array): TrieLeaf | null {
    try {
      return TrieLeaf.deserialize(bytes, this.#geometry, this.#codec);
    } catch (raw) {
      if (!(raw instanceof Error)) {
        throw nonErrorCaught(String(raw));
      }
      // Ambiguous: the bytes may be a malformed leaf (data
      // corruption) or a branch tree whose shape does not match
      // the leaf envelope. The cursor cannot distinguish without
      // a port-level kind probe, so it falls through to
      // `readBranch`. If that also fails the caller surfaces an
      // `E_TRIE_CURSOR_STORE`.
      return null;
    }
  }

  async #readLeafBytesAllowingMissing(
    oid: string,
    path: readonly number[],
  ): Promise<Uint8Array | null> {
    try {
      return await this.#store.readLeaf(oid);
    } catch (raw) {
      if (!(raw instanceof Error)) {
        throw nonErrorCaught(String(raw));
      }
      if (isMissingStoreError(raw)) {
        return null;
      }
      throw wrapStoreError({ raw, op: "readLeaf", path, oid });
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
      if (!(raw instanceof Error)) {
        throw nonErrorCaught(String(raw));
      }
      throw wrapStoreError({ raw, op: "readBranch", path, oid });
    }
    try {
      return new TrieBranch(entries, this.#geometry);
    } catch (raw) {
      if (!(raw instanceof Error)) {
        throw nonErrorCaught(String(raw));
      }
      throw wrapDecodeError({ raw, op: "readBranch", path, oid });
    }
  }

  // -- read path -------------------------------------------------------------

  async #lookupEntry(element: string): Promise<TrieLeafEntry | null> {
    const located = await this.#locateEntry(element);
    return located?.entry ?? null;
  }

  async #locateEntry(element: string): Promise<LocatedEntry | null> {
    await this.#loadRootIfNeeded();
    if (!this.#hasRoot()) {
      return null;
    }
    const routeKey = RouteKey.fromElement(element);
    const nibbleBits = nibbleBitsOf(this.#geometry.nibbleBits);
    return await this.#descendForLookup({ routeKey, element, nibbleBits });
  }

  async #descendForLookup(target: LookupTarget): Promise<LocatedEntry | null> {
    const maxDepth = Math.floor(256 / target.nibbleBits);
    let path: readonly number[] = [];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const step = await this.#stepLookup({
        routeKey: target.routeKey,
        path,
        depth,
        nibbleBits: target.nibbleBits,
      });
      if (step.kind === "missing") {
        return null;
      }
      if (step.kind === "leaf") {
        return locateEntryInLeaf({
          leaf: step.leaf,
          path: step.path,
          depth: depth + 1,
          ...target,
        });
      }
      path = step.nextPath;
    }
    return this.#locateTerminalEntry(path, target, maxDepth);
  }

  #locateTerminalEntry(
    path: readonly number[],
    target: LookupTarget,
    depth: number,
  ): LocatedEntry | null {
    const terminal = this.#leafAt(path);
    return terminal === null
      ? null
      : locateEntryInLeaf({
          leaf: terminal,
          path,
          depth,
          ...target,
        });
  }

  async #stepLookup(args: {
    readonly routeKey: RouteKey;
    readonly path: readonly number[];
    readonly depth: number;
    readonly nibbleBits: NibbleBits;
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
      return leaf === null ? { kind: "missing" } : { kind: "leaf", leaf, path: nextPath };
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
    const newBranch = this.#installPartitionedLeaves(ctx, partitions);
    this.#markBranchDirty(ctx.leafPath, newBranch);
    this.#rebindParentBranch(ctx.parentPath, ctx.nibbleInParent);
    await this.#cascadeSplitsInto(ctx, newBranch);
  }

  #installPartitionedLeaves(
    ctx: SplitContext,
    partitions: ReadonlyMap<number, readonly TrieLeafEntry[]>,
  ): TrieBranch {
    const childEntries = new Map<number, string>();
    const suffixNibbles = ctx.maxDepth - ctx.leafDepth;
    for (const [childNibble, childEntriesList] of partitions) {
      const childPath = [...ctx.leafPath, childNibble];
      const childLeaf = new TrieLeaf(
        shortenEntries(
          childEntriesList,
          nibbleBitsOf(this.#geometry.nibbleBits),
          suffixNibbles,
        ),
        this.#geometry,
      );
      this.#markLeafDirty(childPath, childLeaf);
      childEntries.set(childNibble, pendingChildOid(ctx.leafPath, childNibble));
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
    this.#markLoadedLeafMutation(leafPath, new TrieLeaf(next, this.#geometry));
  }

  // -- leaf walk (scan/elements) ---------------------------------------------

  async *#scanBelow(path: readonly number[]): AsyncIterable<string> {
    const leaf = this.#leafAt(path);
    if (leaf !== null) {
      yield* liveElementsOf(leaf);
      return;
    }
    const branch = this.#branchAt(path);
    if (branch === null) {
      return;
    }
    yield* this.#descendScan(path, branch);
  }

  async *#descendScan(
    path: readonly number[],
    branch: TrieBranch,
  ): AsyncIterable<string> {
    const nibbles = [...branch.entries().keys()].sort((a, b) => a - b);
    for (const nibble of nibbles) {
      const childOid = branch.get(nibble);
      if (childOid === undefined) {
        continue;
      }
      await this.#ensureChildLoaded(path, nibble, childOid);
      yield* this.#scanBelow([...path, nibble]);
    }
  }

  async *#scanElementStatesBelow(
    path: readonly number[],
  ): AsyncIterable<ORSetElementState> {
    const leaf = this.#leafAt(path);
    if (leaf !== null) {
      for (const entry of leaf.entries()) {
        yield elementStateOfEntry(entry);
      }
      return;
    }
    const branch = this.#branchAt(path);
    if (branch === null) {
      return;
    }
    yield* this.#descendScanElementStates(path, branch);
  }

  async *#descendScanElementStates(
    path: readonly number[],
    branch: TrieBranch,
  ): AsyncIterable<ORSetElementState> {
    const nibbles = [...branch.entries().keys()].sort((a, b) => a - b);
    for (const nibble of nibbles) {
      const childOid = branch.get(nibble);
      if (childOid === undefined) {
        continue;
      }
      await this.#ensureChildLoaded(path, nibble, childOid);
      yield* this.#scanElementStatesBelow([...path, nibble]);
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

function rewriteElementWithTombstones(
  leaf: TrieLeaf,
  element: string,
  observedDots: ReadonlySet<string>,
): TrieLeafEntry[] | null {
  let changed = false;
  const out: TrieLeafEntry[] = [];
  for (const entry of leaf.entries()) {
    if (entry.element !== element) {
      out.push(entry);
      continue;
    }
    const result = tombstoneEntry(entry, observedDots);
    if (result.changed) {
      changed = true;
    }
    out.push(result.entry);
  }
  return changed ? out : null;
}

function locateEntryInLeaf(args: {
  readonly leaf: TrieLeaf;
  readonly path: readonly number[];
  readonly routeKey: RouteKey;
  readonly depth: number;
  readonly nibbleBits: NibbleBits;
  readonly element: string;
}): LocatedEntry | null {
  const entry = findEntryInLeaf(args);
  return entry === null ? null : { entry, leaf: args.leaf, path: args.path };
}

// -- helper: yield elements from a leaf -------------------------------------

function* liveElementsOf(leaf: TrieLeaf): Iterable<string> {
  for (const entry of leaf.entries()) {
    if (entry.dots.size > 0) {
      yield entry.element;
    }
  }
}

function elementStateOfEntry(entry: TrieLeafEntry): ORSetElementState {
  return new ORSetElementState({
    element: entry.element,
    dots: entry.dots,
    tombstonedDots: entry.tombstonedDots,
  });
}

// -- discriminated union for descent step ----------------------------------

type LookupStep =
  | { readonly kind: "missing" }
  | { readonly kind: "leaf"; readonly leaf: TrieLeaf; readonly path: readonly number[] }
  | { readonly kind: "branch"; readonly nextPath: readonly number[] };

type LocatedEntry = Readonly<{
  entry: TrieLeafEntry;
  leaf: TrieLeaf;
  path: readonly number[];
}>;

type LookupTarget = Readonly<{
  routeKey: RouteKey;
  element: string;
  nibbleBits: NibbleBits;
}>;

// -- non-Error catch escape hatch ------------------------------------------

/**
 * Build the error to throw when a catch block encounters a value
 * that is not an `Error` instance. All throw sites in this module
 * (and every `WarpError` subclass) throw real `Error`s, so this
 * is strictly a defensive path for host-level oddities (a thrown
 * string, a rejected promise with a primitive, etc.).
 *
 * The `repr` argument is always produced via `String(raw)` at the
 * call site, so the helper's signature stays tight.
 */
function nonErrorCaught(repr: string): TrieCursorError {
  return new TrieCursorError(
    `TrieCursor caught a non-Error value: ${repr}`,
    { code: "E_TRIE_CURSOR_STRUCTURE", context: { raw: repr } },
  );
}
