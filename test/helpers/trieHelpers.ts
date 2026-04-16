import type TrieStorePort from "../../src/domain/orset/trie/TrieStorePort.ts";
import type { TrieBranchEntries } from "../../src/domain/orset/trie/TrieBranchEntries.ts";
import TrieStoreError from "../../src/domain/errors/TrieStoreError.ts";

/**
 * Deterministic in-memory `TrieStorePort` double shared across
 * unit tests for cycles 0029 (TrieCursor) and 0030 (TrieFlusher).
 *
 * Not a production adapter. Keeps content-addressable semantics
 * so writes of the same bytes / canonical branch yield the same
 * OID — matching the Git-backed adapter's real behaviour without
 * requiring a git subprocess.
 */
export class InMemoryTrieStore implements TrieStorePort {
  readonly #leaves = new Map<string, Uint8Array>();
  readonly #branches = new Map<string, TrieBranchEntries>();
  #leafReadCount = 0;
  #branchReadCount = 0;
  #leafWriteCount = 0;
  #branchWriteCount = 0;

  async readLeaf(oid: string): Promise<Uint8Array> {
    this.#leafReadCount += 1;
    const bytes = this.#leaves.get(oid);
    if (bytes === undefined) {
      throw new TrieStoreError(`leaf ${oid} missing`, {
        code: "E_TRIE_STORE_MISSING",
        context: { oid, kind: "leaf" },
      });
    }
    return new Uint8Array(bytes);
  }

  async readBranch(oid: string): Promise<TrieBranchEntries> {
    this.#branchReadCount += 1;
    const entries = this.#branches.get(oid);
    if (entries === undefined) {
      throw new TrieStoreError(`branch ${oid} missing`, {
        code: "E_TRIE_STORE_MISSING",
        context: { oid, kind: "branch" },
      });
    }
    return new Map(entries);
  }

  async writeLeaf(data: Uint8Array): Promise<string> {
    this.#leafWriteCount += 1;
    const oid = hashForTest("leaf", data);
    this.#leaves.set(oid, new Uint8Array(data));
    return oid;
  }

  async writeBranch(children: TrieBranchEntries): Promise<string> {
    this.#branchWriteCount += 1;
    const canonical = canonicalizeBranchForTest(children);
    const oid = hashForTest("branch", canonical);
    this.#branches.set(oid, new Map(children));
    return oid;
  }

  /**
   * Testing-only introspection: whether the store has seen any
   * writes. Useful for asserting a cursor did not flush.
   */
  hasBeenWrittenTo(): boolean {
    return this.#leafWriteCount > 0 || this.#branchWriteCount > 0;
  }

  /**
   * Testing-only introspection: (leafReads, branchReads) counts.
   */
  readCounts(): { readonly leaf: number; readonly branch: number } {
    return { leaf: this.#leafReadCount, branch: this.#branchReadCount };
  }

  /**
   * Testing-only introspection: (leafWrites, branchWrites) counts.
   */
  writeCounts(): { readonly leaf: number; readonly branch: number } {
    return { leaf: this.#leafWriteCount, branch: this.#branchWriteCount };
  }

  /**
   * Testing-only introspection: whether a given leaf OID exists.
   */
  hasLeaf(oid: string): boolean {
    return this.#leaves.has(oid);
  }

  /**
   * Testing-only introspection: whether a given branch OID exists.
   */
  hasBranch(oid: string): boolean {
    return this.#branches.has(oid);
  }
}

/**
 * Trie store double that throws on every method. Useful for
 * proving the cursor does not touch the store in paths where it
 * must not (empty-trie fast paths, for instance).
 */
export class NeverCallStore implements TrieStorePort {
  async readLeaf(): Promise<Uint8Array> {
    throw new TrieStoreError("NeverCallStore.readLeaf was invoked", {
      code: "E_TRIE_STORE_READ",
    });
  }

  async readBranch(): Promise<TrieBranchEntries> {
    throw new TrieStoreError("NeverCallStore.readBranch was invoked", {
      code: "E_TRIE_STORE_READ",
    });
  }

  async writeLeaf(): Promise<string> {
    throw new TrieStoreError("NeverCallStore.writeLeaf was invoked", {
      code: "E_TRIE_STORE_WRITE",
    });
  }

  async writeBranch(): Promise<string> {
    throw new TrieStoreError("NeverCallStore.writeBranch was invoked", {
      code: "E_TRIE_STORE_WRITE",
    });
  }
}

/**
 * Trie store double that injects a configurable failure on the
 * next read or write call. Useful for exercising the cursor's
 * error-classification paths.
 */
export class FaultyTrieStore implements TrieStorePort {
  readonly #underlying: InMemoryTrieStore;
  #nextReadFault: TrieStoreError | null = null;

  constructor() {
    this.#underlying = new InMemoryTrieStore();
  }

  queueReadFault(err: TrieStoreError): void {
    this.#nextReadFault = err;
  }

  async readLeaf(oid: string): Promise<Uint8Array> {
    const fault = this.#takeReadFault();
    if (fault !== null) {
      throw fault;
    }
    return await this.#underlying.readLeaf(oid);
  }

  async readBranch(oid: string): Promise<TrieBranchEntries> {
    const fault = this.#takeReadFault();
    if (fault !== null) {
      throw fault;
    }
    return await this.#underlying.readBranch(oid);
  }

  async writeLeaf(data: Uint8Array): Promise<string> {
    return await this.#underlying.writeLeaf(data);
  }

  async writeBranch(children: TrieBranchEntries): Promise<string> {
    return await this.#underlying.writeBranch(children);
  }

  #takeReadFault(): TrieStoreError | null {
    const fault = this.#nextReadFault;
    this.#nextReadFault = null;
    return fault;
  }
}

function hashForTest(tag: string, input: Uint8Array): string {
  let h = 2166136261 >>> 0;
  h = (h ^ tag.length) >>> 0;
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.imul(h, 16777619) >>> 0;
    h = (h ^ tag.charCodeAt(i)) >>> 0;
  }
  for (const byte of input) {
    h = Math.imul(h, 16777619) >>> 0;
    h = (h ^ byte) >>> 0;
  }
  return `${tag}-${h.toString(16).padStart(8, "0")}`;
}

function canonicalizeBranchForTest(children: TrieBranchEntries): Uint8Array {
  const sorted = [...children.entries()].sort((a, b) => a[0] - b[0]);
  const parts: number[] = [];
  for (const [nibble, childOid] of sorted) {
    parts.push(nibble);
    for (let i = 0; i < childOid.length; i += 1) {
      parts.push(childOid.charCodeAt(i) & 0xff);
    }
    parts.push(0);
  }
  return Uint8Array.from(parts);
}
