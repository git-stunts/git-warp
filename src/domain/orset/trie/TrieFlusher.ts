import TrieFlushError from "../../errors/TrieFlushError.ts";
import type CodecPort from "../../../ports/CodecPort.ts";

import {
  encodeDirtyPath,
  type DirtyPageEntry,
  type default as DirtyPageSet,
} from "./DirtyPageSet.ts";
import FlushResult from "./FlushResult.ts";
import TrieBranch from "./TrieBranch.ts";
import type { TrieBranchEntries } from "./TrieBranchEntries.ts";
import TrieLeaf from "./TrieLeaf.ts";
import type TrieStorePort from "./TrieStorePort.ts";
import {
  shouldFlushBranchWriteWave,
  shouldFlushLeafWriteWave,
} from "./TrieWriteWavePolicy.ts";
import type ArtifactStagingPort from "../../../ports/ArtifactStagingPort.ts";

const PENDING_OID_PREFIX = "pending:";

/**
 * Initializer for {@link TrieFlusher}.
 */
export interface TrieFlusherInit {
  readonly store: TrieStorePort;
  readonly codec: CodecPort;
  readonly staging?: ArtifactStagingPort;
}

/**
 * Persists a {@link DirtyPageSet} produced by `TrieCursor` into
 * the trie store, returning a new root OID and a summary of what
 * was written.
 *
 * The flusher is stateless between calls: every invocation takes
 * a fresh snapshot, walks it deterministically bottom-up, writes
 * leaves and branches via `TrieStorePort`, and returns a frozen
 * `FlushResult`. There is no partial-flush recovery; the caller
 * retries.
 *
 * ## Structural sharing
 *
 * A branch's child-OID map may point at:
 *
 * 1. A freshly-written OID from this flush (the common case for
 *    any dirty path).
 * 2. A clean-child OID recorded by the cursor during descent —
 *    the subtree was visited but not modified, so its OID is
 *    reused verbatim.
 * 3. An OID present on the branch itself that is not a `pending:`
 *    sentinel — the cursor rebuilt this branch for some other
 *    nibble but left the original child entry unchanged.
 *
 * ## Pending-OID resolution
 *
 * The cursor inserts `pending:<path-key>` sentinels when it
 * creates or rebinds a child slot it has not yet written. The
 * flusher must replace every sentinel before calling
 * `store.writeBranch`; any sentinel still present after the
 * walk raises `E_TRIE_FLUSH_UNRESOLVED`.
 *
 * ## Failure model
 *
 * Every failure surfaces as `TrieFlushError` with a typed code.
 * Store faults become `E_TRIE_FLUSH_STORE`; codec faults become
 * `E_TRIE_FLUSH_ENCODE`; resolution bugs become
 * `E_TRIE_FLUSH_UNRESOLVED`; anything else the flusher cannot
 * classify becomes `E_TRIE_FLUSH_STRUCTURE`.
 */
export default class TrieFlusher {
  readonly #store: TrieStorePort;
  readonly #codec: CodecPort;
  readonly #staging: ArtifactStagingPort | undefined;

  constructor(init: TrieFlusherInit) {
    this.#store = init.store;
    this.#codec = init.codec;
    this.#staging = init.staging;
  }

  async flush(dirty: DirtyPageSet): Promise<FlushResult> {
    if (dirty.isEmpty()) {
      return new FlushResult({
        rootOid: dirty.rootOid(),
        blobsWritten: 0,
        treesWritten: 0,
        bytesWritten: 0,
      });
    }
    const state = createFlushState();
    const entries = [...dirty.enumerateBottomUp()];
    await this.#writeLeafWave(entries, state);
    await this.#writeBranchWaves(entries, dirty, state);
    return new FlushResult({
      rootOid: state.rootOid,
      blobsWritten: state.blobsWritten,
      treesWritten: state.treesWritten,
      bytesWritten: state.bytesWritten,
    });
  }

  async #writeLeafWave(entries: readonly DirtyPageEntry[], state: FlushState): Promise<void> {
    let paths: Array<readonly number[]> = [];
    let leaves: Uint8Array[] = [];
    let byteLength = 0;
    for (const entry of entries) {
      if (entry.node instanceof TrieLeaf) {
        const leaf = this.#serializeLeaf(entry.node, entry.path);
        if (shouldFlushLeafWriteWave({
          byteLength,
          itemCount: leaves.length,
          nextByteLength: leaf.byteLength,
        })) {
          await this.#recordLeafWave(leaves, paths, state);
          paths = [];
          leaves = [];
          byteLength = 0;
        }
        paths.push(entry.path);
        leaves.push(leaf);
        byteLength += leaf.byteLength;
      }
    }
    await this.#recordLeafWave(leaves, paths, state);
  }

  async #recordLeafWave(
    leaves: readonly Uint8Array[],
    paths: readonly (readonly number[])[],
    state: FlushState,
  ): Promise<void> {
    const roots = await this.#writeLeaves(leaves, paths);
    requireWriteCardinality("leaf", paths.length, roots.length);
    for (let index = 0; index < paths.length; index += 1) {
      const bytes = requireLeaf(leaves, index);
      recordRoot(state, requirePath(paths, index), requireRoot(roots, index));
      recordLeafMetrics(state, bytes.length);
    }
  }

  async #writeBranchWaves(
    entries: readonly DirtyPageEntry[],
    dirty: DirtyPageSet,
    state: FlushState,
  ): Promise<void> {
    let depth = -1;
    let wave: DirtyPageEntry[] = [];
    for (const entry of entries) {
      if (!(entry.node instanceof TrieBranch)) { continue; }
      if (shouldFlushBranchWriteWave({
        depth,
        itemCount: wave.length,
        nextDepth: entry.path.length,
      })) {
        await this.#writeBranchWave(wave, dirty, state);
        wave = [];
      }
      depth = entry.path.length;
      wave.push(entry);
    }
    await this.#writeBranchWave(wave, dirty, state);
  }

  async #writeBranchWave(
    wave: readonly DirtyPageEntry[],
    dirty: DirtyPageSet,
    state: FlushState,
  ): Promise<void> {
    const paths: Array<readonly number[]> = [];
    const branches: TrieBranchEntries[] = [];
    for (const entry of wave) {
      if (!(entry.node instanceof TrieBranch)) { throw invalidBranchWave(); }
      paths.push(entry.path);
      branches.push(resolveBranchChildren({ branch: entry.node, path: entry.path, dirty, state }));
    }
    const roots = await this.#writeBranches(branches, paths);
    requireWriteCardinality("branch", paths.length, roots.length);
    for (let index = 0; index < paths.length; index += 1) {
      recordBranchRoot(state, requirePath(paths, index), requireRoot(roots, index));
    }
  }

  async #writeLeaves(
    leaves: readonly Uint8Array[],
    paths: readonly (readonly number[])[],
  ): Promise<readonly string[]> {
    if (leaves.length === 0) { return []; }
    if (this.#store.writeLeaves === undefined) {
      return await this.#writeLeavesIndividually(leaves, paths);
    }
    try {
      return await this.#store.writeLeaves(leaves, this.#staging);
    } catch (raw) {
      if (!(raw instanceof Error)) { throw flushNonErrorCaught(String(raw)); }
      throw wrapFlushError({
        raw,
        op: "writeLeaves",
        path: requirePath(paths, 0),
        code: "E_TRIE_FLUSH_STORE",
      });
    }
  }

  async #writeLeavesIndividually(
    leaves: readonly Uint8Array[],
    paths: readonly (readonly number[])[],
  ): Promise<readonly string[]> {
    const roots: string[] = [];
    for (let index = 0; index < leaves.length; index += 1) {
      roots.push(await this.#writeLeafBytes(
        requireLeaf(leaves, index),
        requirePath(paths, index),
      ));
    }
    return roots;
  }

  async #writeBranches(
    branches: readonly TrieBranchEntries[],
    paths: readonly (readonly number[])[],
  ): Promise<readonly string[]> {
    if (branches.length === 0) { return []; }
    if (this.#store.writeBranches === undefined) {
      return await this.#writeBranchesIndividually(branches, paths);
    }
    try {
      return await this.#store.writeBranches(branches, this.#staging);
    } catch (raw) {
      if (!(raw instanceof Error)) { throw flushNonErrorCaught(String(raw)); }
      throw wrapFlushError({
        raw,
        op: "writeBranches",
        path: requirePath(paths, 0),
        code: "E_TRIE_FLUSH_STORE",
      });
    }
  }

  async #writeBranchesIndividually(
    branches: readonly TrieBranchEntries[],
    paths: readonly (readonly number[])[],
  ): Promise<readonly string[]> {
    const roots: string[] = [];
    for (let index = 0; index < branches.length; index += 1) {
      roots.push(await this.#writeBranchEntries(
        requireBranch(branches, index),
        requirePath(paths, index),
      ));
    }
    return roots;
  }

  #serializeLeaf(leaf: TrieLeaf, path: readonly number[]): Uint8Array {
    try {
      return leaf.serialize(this.#codec);
    } catch (raw) {
      if (!(raw instanceof Error)) {
        throw flushNonErrorCaught(String(raw));
      }
      throw wrapFlushError({
        raw,
        op: "serializeLeaf",
        path,
        code: "E_TRIE_FLUSH_ENCODE",
      });
    }
  }

  async #writeLeafBytes(
    bytes: Uint8Array,
    path: readonly number[],
  ): Promise<string> {
    try {
      return await this.#store.writeLeaf(bytes, this.#staging);
    } catch (raw) {
      if (!(raw instanceof Error)) {
        throw flushNonErrorCaught(String(raw));
      }
      throw wrapFlushError({
        raw,
        op: "writeLeaf",
        path,
        code: "E_TRIE_FLUSH_STORE",
      });
    }
  }

  async #writeBranchEntries(
    entries: TrieBranchEntries,
    path: readonly number[],
  ): Promise<string> {
    try {
      return await this.#store.writeBranch(entries, this.#staging);
    } catch (raw) {
      if (!(raw instanceof Error)) {
        throw flushNonErrorCaught(String(raw));
      }
      throw wrapFlushError({
        raw,
        op: "writeBranch",
        path,
        code: "E_TRIE_FLUSH_STORE",
      });
    }
  }
}

// -- internal state ---------------------------------------------------------

interface FlushState {
  rootOid: string | null;
  blobsWritten: number;
  treesWritten: number;
  bytesWritten: number;
  readonly newOidByPath: Map<string, string>;
}

function createFlushState(): FlushState {
  return {
    rootOid: null,
    blobsWritten: 0,
    treesWritten: 0,
    bytesWritten: 0,
    newOidByPath: new Map<string, string>(),
  };
}

function recordLeafMetrics(state: FlushState, byteLength: number): void {
  state.blobsWritten += 1;
  state.bytesWritten += byteLength;
}

function recordBranchRoot(
  state: FlushState,
  path: readonly number[],
  root: string,
): void {
  recordRoot(state, path, root);
  state.treesWritten += 1;
}

function recordRoot(state: FlushState, path: readonly number[], root: string): void {
  state.newOidByPath.set(encodeDirtyPath(path), root);
  if (path.length === 0) {
    state.rootOid = root;
  }
}

function requireWriteCardinality(kind: string, expected: number, actual: number): void {
  if (expected === actual) { return; }
  throw new TrieFlushError(`TrieFlusher ${kind} wave returned ${actual} roots for ${expected} writes`, {
    code: "E_TRIE_FLUSH_STORE",
    context: { kind, expected, actual },
  });
}

function requirePath(
  paths: readonly (readonly number[])[],
  index: number,
): readonly number[] {
  const path = paths[index];
  if (path === undefined) { throw invalidWaveEntry("path", index); }
  return path;
}

function requireLeaf(leaves: readonly Uint8Array[], index: number): Uint8Array {
  const leaf = leaves[index];
  if (leaf === undefined) { throw invalidWaveEntry("leaf", index); }
  return leaf;
}

function requireBranch(
  branches: readonly TrieBranchEntries[],
  index: number,
): TrieBranchEntries {
  const branch = branches[index];
  if (branch === undefined) { throw invalidWaveEntry("branch", index); }
  return branch;
}

function requireRoot(roots: readonly string[], index: number): string {
  const root = roots[index];
  if (root === undefined || root.length === 0) { throw invalidWaveEntry("root", index); }
  return root;
}

function invalidBranchWave(): TrieFlushError {
  return new TrieFlushError("TrieFlusher branch wave contains a non-branch entry", {
    code: "E_TRIE_FLUSH_STRUCTURE",
  });
}

function invalidWaveEntry(kind: string, index: number): TrieFlushError {
  return new TrieFlushError(`TrieFlusher wave omitted ${kind} at index ${index}`, {
    code: "E_TRIE_FLUSH_STRUCTURE",
    context: { kind, index },
  });
}

// -- branch resolution ------------------------------------------------------

function resolveBranchChildren(args: {
  readonly branch: TrieBranch;
  readonly path: readonly number[];
  readonly dirty: DirtyPageSet;
  readonly state: FlushState;
}): TrieBranchEntries {
  const out = new Map<number, string>();
  for (const [nibble, originalOid] of args.branch.entries()) {
    const childPath = [...args.path, nibble];
    const resolved = resolveChildOid({
      originalOid,
      childPath,
      dirty: args.dirty,
      state: args.state,
    });
    out.set(nibble, resolved);
  }
  return out;
}

function resolveChildOid(args: {
  readonly originalOid: string;
  readonly childPath: readonly number[];
  readonly dirty: DirtyPageSet;
  readonly state: FlushState;
}): string {
  const freshlyWritten = args.state.newOidByPath.get(
    encodeDirtyPath(args.childPath),
  );
  if (freshlyWritten !== undefined) {
    return freshlyWritten;
  }
  const cleanChild = args.dirty.cleanChildOidAt(args.childPath);
  if (cleanChild !== null) {
    return cleanChild;
  }
  if (!isPendingOid(args.originalOid)) {
    return args.originalOid;
  }
  throw new TrieFlushError(
    `TrieFlusher could not resolve pending child OID at path=${encodeDirtyPath(args.childPath)}`,
    {
      code: "E_TRIE_FLUSH_UNRESOLVED",
      context: {
        path: encodeDirtyPath(args.childPath),
        pending: args.originalOid,
      },
    },
  );
}

function isPendingOid(oid: string): boolean {
  return oid.startsWith(PENDING_OID_PREFIX);
}

// -- error wrapping ---------------------------------------------------------

interface WrapFlushArgs {
  readonly raw: Error;
  readonly op: string;
  readonly path: readonly number[];
  readonly code:
    | "E_TRIE_FLUSH_STORE"
    | "E_TRIE_FLUSH_ENCODE"
    | "E_TRIE_FLUSH_STRUCTURE";
}

function wrapFlushError(args: WrapFlushArgs): TrieFlushError {
  if (args.raw instanceof TrieFlushError) {
    return args.raw;
  }
  const { message } = args.raw;
  return new TrieFlushError(
    `TrieFlusher ${args.op} failed at path=${encodeDirtyPath(args.path)}: ${message}`,
    {
      code: args.code,
      context: {
        op: args.op,
        path: encodeDirtyPath(args.path),
        cause: message,
      },
    },
  );
}

function flushNonErrorCaught(repr: string): TrieFlushError {
  return new TrieFlushError(
    `TrieFlusher caught a non-Error value: ${repr}`,
    { code: "E_TRIE_FLUSH_STRUCTURE", context: { raw: repr } },
  );
}
