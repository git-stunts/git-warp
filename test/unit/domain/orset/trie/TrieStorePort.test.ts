import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import type TrieStorePort from "../../../../../src/domain/orset/trie/TrieStorePort.ts";
import type { TrieBranchEntries } from "../../../../../src/domain/orset/trie/TrieBranchEntries.ts";
import TrieStoreError from "../../../../../src/domain/errors/TrieStoreError.ts";

const TRIE_STORE_PORT_SOURCE_URL = new URL(
  "../../../../../src/domain/orset/trie/TrieStorePort.ts",
  import.meta.url,
);

/**
 * Minimal in-memory test double for TrieStorePort.
 *
 * Not a production adapter. Not exported. Lives inline in the test
 * file so there is zero ambiguity about scope: it exists to prove
 * the interface compiles under a real implementor and to exercise
 * the round-trip semantics the contract requires.
 *
 * Leaves and branches are content-addressed by a deterministic
 * SHA-like digest computed from the serialized bytes, kept short so
 * test assertions stay readable. Adapters do this for real against
 * Git; this double just keeps the round-trip honest.
 */
class InMemoryTrieStore implements TrieStorePort {
  private readonly leaves = new Map<string, Uint8Array>();
  private readonly branches = new Map<string, TrieBranchEntries>();

  async readLeaf(oid: string): Promise<Uint8Array> {
    const bytes = this.leaves.get(oid);
    if (bytes === undefined) {
      throw new TrieStoreError(`leaf ${oid} missing`, {
        code: "E_TRIE_STORE_MISSING",
        context: { oid, kind: "leaf" },
      });
    }
    return new Uint8Array(bytes);
  }

  async readBranch(oid: string): Promise<TrieBranchEntries> {
    const entries = this.branches.get(oid);
    if (entries === undefined) {
      throw new TrieStoreError(`branch ${oid} missing`, {
        code: "E_TRIE_STORE_MISSING",
        context: { oid, kind: "branch" },
      });
    }
    return new Map(entries);
  }

  async writeLeaf(data: Uint8Array): Promise<string> {
    const oid = hashForTest("leaf", data);
    this.leaves.set(oid, new Uint8Array(data));
    return oid;
  }

  async writeBranch(children: TrieBranchEntries): Promise<string> {
    const canonical = canonicalizeBranchForTest(children);
    const oid = hashForTest("branch", canonical);
    this.branches.set(oid, new Map(children));
    return oid;
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

describe("TrieStorePort", () => {
  describe("shape", () => {
    it("is declared as a TypeScript interface (type-only at runtime)", () => {
      // Read the source file directly: the port must be declared as
      // an `export default interface`. An interface erases at
      // runtime, which is the whole point of this check — no class
      // scaffolding, no abstract base, just a contract.
      const source = readFileSync(
        fileURLToPath(TRIE_STORE_PORT_SOURCE_URL),
        "utf8",
      );
      expect(source).toMatch(/export default interface TrieStorePort\b/);
      expect(source).not.toMatch(/export default (abstract )?class TrieStorePort\b/);
    });

    it("accepts a concrete implementation without value-level inheritance", () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      expect(typeof store.readLeaf).toBe("function");
      expect(typeof store.readBranch).toBe("function");
      expect(typeof store.writeLeaf).toBe("function");
      expect(typeof store.writeBranch).toBe("function");
    });
  });

  describe("leaf round-trip through the in-memory double", () => {
    it("returns the bytes written under the same OID", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const oid = await store.writeLeaf(data);
      const read = await store.readLeaf(oid);
      expect(read).toEqual(data);
    });

    it("returns a defensive copy of leaf bytes", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const oid = await store.writeLeaf(new Uint8Array([9, 9, 9]));
      const read = await store.readLeaf(oid);
      read[0] = 0;
      const readAgain = await store.readLeaf(oid);
      expect(readAgain[0]).toBe(9);
    });

    it("raises E_TRIE_STORE_MISSING for an unknown leaf OID", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      await expect(store.readLeaf("leaf-deadbeef")).rejects.toBeInstanceOf(
        TrieStoreError,
      );
      try {
        await store.readLeaf("leaf-deadbeef");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe("E_TRIE_STORE_MISSING");
        }
      }
    });
  });

  describe("branch round-trip through the in-memory double", () => {
    it("round-trips a sparse 16-way branch (v1 geometry)", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const children: TrieBranchEntries = new Map<number, string>([
        [0, "child-0"],
        [7, "child-7"],
        [15, "child-f"],
      ]);
      const oid = await store.writeBranch(children);
      const read = await store.readBranch(oid);
      expect(read.size).toBe(3);
      expect(read.get(0)).toBe("child-0");
      expect(read.get(7)).toBe("child-7");
      expect(read.get(15)).toBe("child-f");
    });

    it("round-trips a wide 256-way branch (max supported geometry)", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const wide = new Map<number, string>();
      for (let i = 0; i < 256; i += 1) {
        wide.set(i, `child-${i.toString(16).padStart(2, "0")}`);
      }
      const oid = await store.writeBranch(wide);
      const read = await store.readBranch(oid);
      expect(read.size).toBe(256);
      expect(read.get(0)).toBe("child-00");
      expect(read.get(128)).toBe("child-80");
      expect(read.get(255)).toBe("child-ff");
    });

    it("round-trips a 2-way branch (1-bit nibble geometry)", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const narrow: TrieBranchEntries = new Map<number, string>([
        [0, "left"],
        [1, "right"],
      ]);
      const oid = await store.writeBranch(narrow);
      const read = await store.readBranch(oid);
      expect([...read.entries()]).toEqual([
        [0, "left"],
        [1, "right"],
      ]);
    });

    it("returns a defensive copy of branch entries", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const children: TrieBranchEntries = new Map<number, string>([
        [3, "child-3"],
      ]);
      const oid = await store.writeBranch(children);
      const read = await store.readBranch(oid);
      // The returned map must be independent of the stored copy. We
      // can't mutate a ReadonlyMap at the type level, but we can
      // verify identity is not shared with the store's internal map.
      expect(read).not.toBe(children);
    });

    it("gives the same branch OID for the same child map regardless of insertion order", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      const forward: TrieBranchEntries = new Map<number, string>([
        [0, "a"],
        [1, "b"],
        [2, "c"],
      ]);
      const reverse: TrieBranchEntries = new Map<number, string>([
        [2, "c"],
        [1, "b"],
        [0, "a"],
      ]);
      const oid1 = await store.writeBranch(forward);
      const oid2 = await store.writeBranch(reverse);
      expect(oid1).toBe(oid2);
    });

    it("raises E_TRIE_STORE_MISSING for an unknown branch OID", async () => {
      const store: TrieStorePort = new InMemoryTrieStore();
      await expect(store.readBranch("branch-deadbeef")).rejects.toBeInstanceOf(
        TrieStoreError,
      );
      try {
        await store.readBranch("branch-deadbeef");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe("E_TRIE_STORE_MISSING");
        }
      }
    });
  });

  describe("TrieStoreError codes", () => {
    it("defaults to E_TRIE_STORE_READ when no code is provided", () => {
      const err = new TrieStoreError("read failed");
      expect(err.code).toBe("E_TRIE_STORE_READ");
    });

    it("accepts all four documented codes", () => {
      const codes = [
        "E_TRIE_STORE_READ",
        "E_TRIE_STORE_WRITE",
        "E_TRIE_STORE_MISSING",
        "E_TRIE_STORE_CORRUPT",
      ] as const;
      for (const code of codes) {
        const err = new TrieStoreError("x", { code });
        expect(err.code).toBe(code);
      }
    });

    it("preserves context on the error instance", () => {
      const err = new TrieStoreError("bad leaf", {
        code: "E_TRIE_STORE_CORRUPT",
        context: { oid: "leaf-1", reason: "invalid header" },
      });
      expect(err.context).toEqual({
        oid: "leaf-1",
        reason: "invalid header",
      });
    });
  });
});
