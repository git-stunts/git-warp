import TrieFlushError from "../../errors/TrieFlushError.ts";
import type CodecPort from "../../../ports/CodecPort.ts";

import DirtyPageSet, {
  encodeDirtyPath,
  type DirtyPageEntry,
} from "./DirtyPageSet.ts";
import FlushResult from "./FlushResult.ts";
import TrieBranch from "./TrieBranch.ts";
import type { TrieBranchEntries } from "./TrieBranchEntries.ts";
import TrieLeaf from "./TrieLeaf.ts";
import type TrieStorePort from "./TrieStorePort.ts";

const PENDING_OID_PREFIX = "pending:";

/**
 * Initializer for {@link TrieFlusher}.
 */
export interface TrieFlusherInit {
  readonly store: TrieStorePort;
  readonly codec: CodecPort;
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

  constructor(init: TrieFlusherInit) {
    this.#store = init.store;
    this.#codec = init.codec;
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
    for (const entry of dirty.enumerateBottomUp()) {
      await this.#processEntry({ entry, dirty, state });
    }
    return new FlushResult({
      rootOid: state.rootOid,
      blobsWritten: state.blobsWritten,
      treesWritten: state.treesWritten,
      bytesWritten: state.bytesWritten,
    });
  }

  async #processEntry(args: {
    readonly entry: DirtyPageEntry;
    readonly dirty: DirtyPageSet;
    readonly state: FlushState;
  }): Promise<void> {
    if (args.entry.node instanceof TrieLeaf) {
      await this.#processLeaf({
        path: args.entry.path,
        leaf: args.entry.node,
        state: args.state,
      });
      return;
    }
    await this.#processBranch({
      path: args.entry.path,
      branch: args.entry.node,
      dirty: args.dirty,
      state: args.state,
    });
  }

  async #processLeaf(args: {
    readonly path: readonly number[];
    readonly leaf: TrieLeaf;
    readonly state: FlushState;
  }): Promise<void> {
    const bytes = this.#serializeLeaf(args.leaf, args.path);
    const oid = await this.#writeLeafBytes(bytes, args.path);
    args.state.newOidByPath.set(encodeDirtyPath(args.path), oid);
    args.state.blobsWritten += 1;
    args.state.bytesWritten += bytes.length;
    if (args.path.length === 0) {
      args.state.rootOid = oid;
    }
  }

  async #processBranch(args: {
    readonly path: readonly number[];
    readonly branch: TrieBranch;
    readonly dirty: DirtyPageSet;
    readonly state: FlushState;
  }): Promise<void> {
    const resolved = resolveBranchChildren({
      branch: args.branch,
      path: args.path,
      dirty: args.dirty,
      state: args.state,
    });
    const oid = await this.#writeBranchEntries(resolved, args.path);
    args.state.newOidByPath.set(encodeDirtyPath(args.path), oid);
    args.state.treesWritten += 1;
    if (args.path.length === 0) {
      args.state.rootOid = oid;
    }
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
      return await this.#store.writeLeaf(bytes);
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
      return await this.#store.writeBranch(entries);
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
