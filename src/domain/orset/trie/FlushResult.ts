import TrieFlushError from "../../errors/TrieFlushError.ts";

/**
 * Initializer for {@link FlushResult}.
 */
export interface FlushResultInit {
  readonly rootOid: string | null;
  readonly blobsWritten: number;
  readonly treesWritten: number;
  readonly bytesWritten: number;
}

/**
 * Summary of what a single `TrieFlusher.flush` call emitted.
 *
 * Fields:
 *
 * - `rootOid` — the post-flush root OID. `null` only if the
 *   source trie was empty and the dirty set contained no pages.
 * - `blobsWritten` — number of leaf blobs written to the store.
 * - `treesWritten` — number of branch trees written to the store.
 * - `bytesWritten` — total bytes written across all leaf blobs
 *   (branch-tree byte counts are not tracked at this layer; the
 *   adapter encodes them differently per host).
 *
 * All fields are validated in the constructor: non-negative
 * integers, OID either a non-empty string or null. The instance
 * is frozen on exit.
 */
export default class FlushResult {
  readonly rootOid: string | null;
  readonly blobsWritten: number;
  readonly treesWritten: number;
  readonly bytesWritten: number;

  constructor(init: FlushResultInit) {
    validateRootOid(init.rootOid);
    validateNonNegativeInteger("blobsWritten", init.blobsWritten);
    validateNonNegativeInteger("treesWritten", init.treesWritten);
    validateNonNegativeInteger("bytesWritten", init.bytesWritten);
    this.rootOid = init.rootOid;
    this.blobsWritten = init.blobsWritten;
    this.treesWritten = init.treesWritten;
    this.bytesWritten = init.bytesWritten;
    Object.freeze(this);
  }

  /**
   * True when the flush emitted zero store writes.
   */
  isClean(): boolean {
    return this.blobsWritten === 0 && this.treesWritten === 0;
  }
}

function validateRootOid(rootOid: string | null): void {
  if (rootOid === null) {
    return;
  }
  if (typeof rootOid !== "string" || rootOid.length === 0) {
    throw new TrieFlushError(
      `FlushResult rootOid must be null or a non-empty string; received ${String(rootOid)}`,
      { code: "E_TRIE_FLUSH_STRUCTURE", context: { rootOid } },
    );
  }
}

function validateNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TrieFlushError(
      `FlushResult ${name} must be a non-negative integer; received ${String(value)}`,
      { code: "E_TRIE_FLUSH_STRUCTURE", context: { field: name, value } },
    );
  }
}
