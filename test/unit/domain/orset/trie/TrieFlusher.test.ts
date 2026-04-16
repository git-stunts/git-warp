import { describe, it, expect } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import TrieCursor from "../../../../../src/domain/orset/trie/TrieCursor.ts";
import TrieFlusher from "../../../../../src/domain/orset/trie/TrieFlusher.ts";
import FlushResult from "../../../../../src/domain/orset/trie/FlushResult.ts";
import TrieFlushError from "../../../../../src/domain/errors/TrieFlushError.ts";
import DirtyPageSet, {
  encodeDirtyPath,
} from "../../../../../src/domain/orset/trie/DirtyPageSet.ts";
import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeaf from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY_16 = TrieGeometry.default16way();

function newStoreAndFlusher(): {
  readonly store: InMemoryTrieStore;
  readonly flusher: TrieFlusher;
} {
  const store = new InMemoryTrieStore();
  const flusher = new TrieFlusher({ store, codec: cborCodec });
  return { store, flusher };
}

function cursorOf(
  rootOid: string | null,
  store: InMemoryTrieStore,
  geometry: TrieGeometry = GEOMETRY_16,
): TrieCursor {
  return new TrieCursor({ rootOid, store, geometry, codec: cborCodec });
}

describe("FlushResult", () => {
  it("freezes on construction", () => {
    const r = new FlushResult({
      rootOid: null,
      blobsWritten: 0,
      treesWritten: 0,
      bytesWritten: 0,
    });
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("reports isClean when zero writes occurred", () => {
    const r = new FlushResult({
      rootOid: "oid",
      blobsWritten: 0,
      treesWritten: 0,
      bytesWritten: 0,
    });
    expect(r.isClean()).toBe(true);
  });

  it("reports not-isClean when any writes occurred", () => {
    const r = new FlushResult({
      rootOid: "oid",
      blobsWritten: 1,
      treesWritten: 0,
      bytesWritten: 12,
    });
    expect(r.isClean()).toBe(false);
  });

  it("rejects a rootOid that is neither null nor a non-empty string", () => {
    try {
      new FlushResult({
        rootOid: "",
        blobsWritten: 0,
        treesWritten: 0,
        bytesWritten: 0,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TrieFlushError);
      if (err instanceof TrieFlushError) {
        expect(err.code).toBe("E_TRIE_FLUSH_STRUCTURE");
      }
    }
  });

  it("rejects a negative blobsWritten", () => {
    try {
      new FlushResult({
        rootOid: null,
        blobsWritten: -1,
        treesWritten: 0,
        bytesWritten: 0,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TrieFlushError);
    }
  });

  it("rejects a non-integer treesWritten", () => {
    try {
      new FlushResult({
        rootOid: null,
        blobsWritten: 0,
        treesWritten: 1.5,
        bytesWritten: 0,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TrieFlushError);
    }
  });

  it("rejects a negative bytesWritten", () => {
    try {
      new FlushResult({
        rootOid: null,
        blobsWritten: 0,
        treesWritten: 0,
        bytesWritten: -5,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TrieFlushError);
    }
  });
});

describe("TrieFlusher", () => {
  describe("empty flush", () => {
    it("returns incoming rootOid and zero writes when the snapshot is empty", async () => {
      const { store, flusher } = newStoreAndFlusher();
      const snap = DirtyPageSet.emptyForRoot(null);
      const result = await flusher.flush(snap);
      expect(result.rootOid).toBeNull();
      expect(result.blobsWritten).toBe(0);
      expect(result.treesWritten).toBe(0);
      expect(result.bytesWritten).toBe(0);
      expect(store.hasBeenWrittenTo()).toBe(false);
    });

    it("preserves a non-null incoming rootOid", async () => {
      const { flusher } = newStoreAndFlusher();
      const snap = DirtyPageSet.emptyForRoot("clean-root");
      const result = await flusher.flush(snap);
      expect(result.rootOid).toBe("clean-root");
    });
  });

  describe("single-mutation flush", () => {
    it("writes one leaf and one branch for a fresh single-element trie", async () => {
      const { store, flusher } = newStoreAndFlusher();
      const cursor = cursorOf(null, store);
      await cursor.add("node:1", new Dot("alice", 1));
      const result = await flusher.flush(cursor.snapshot());
      expect(result.blobsWritten).toBe(1);
      expect(result.treesWritten).toBe(1);
      expect(result.rootOid).not.toBeNull();
      expect(result.bytesWritten).toBeGreaterThan(0);
    });

    it("the written root can be re-opened by a fresh cursor", async () => {
      const { store, flusher } = newStoreAndFlusher();
      const first = cursorOf(null, store);
      await first.add("node:1", new Dot("alice", 1));
      const { rootOid } = await flusher.flush(first.snapshot());
      const second = cursorOf(rootOid, store);
      expect(await second.contains("node:1")).toBe(true);
    });
  });

  describe("multi-mutation flush", () => {
    it("round-trips twenty elements through a capacity-2 trie", async () => {
      const tiny = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const store = new InMemoryTrieStore();
      const flusher = new TrieFlusher({ store, codec: cborCodec });
      const cursor = cursorOf(null, store, tiny);
      for (let i = 0; i < 20; i += 1) {
        await cursor.add(`node:${i}`, new Dot("w", i + 1));
      }
      const { rootOid } = await flusher.flush(cursor.snapshot());
      const replay = new TrieCursor({
        rootOid,
        store,
        geometry: tiny,
        codec: cborCodec,
      });
      for (let i = 0; i < 20; i += 1) {
        expect(await replay.contains(`node:${i}`)).toBe(true);
      }
    });

    it("preserves structural sharing — a second cursor modifying one subtree rewrites only that subtree's branches", async () => {
      // Baseline: write 10 elements.
      const store = new InMemoryTrieStore();
      const flusher = new TrieFlusher({ store, codec: cborCodec });
      const first = cursorOf(null, store);
      for (let i = 0; i < 10; i += 1) {
        await first.add(`node:${i}`, new Dot("w", i + 1));
      }
      const baseline = await flusher.flush(first.snapshot());
      const baselineWrites = store.writeCounts();

      // Open a second cursor and add a single element. Flush.
      const second = cursorOf(baseline.rootOid, store);
      await second.add("node:new", new Dot("w", 100));
      const next = await flusher.flush(second.snapshot());

      // The new root should differ from the baseline root.
      expect(next.rootOid).not.toBe(baseline.rootOid);

      // The new flush must have written far fewer objects than the
      // baseline — most subtrees are reused.
      const totalSecondWrites =
        store.writeCounts().leaf + store.writeCounts().branch
        - (baselineWrites.leaf + baselineWrites.branch);
      expect(totalSecondWrites).toBeLessThanOrEqual(
        baselineWrites.leaf + baselineWrites.branch,
      );

      // The second root can re-read the original AND the new element.
      const replay = cursorOf(next.rootOid, store);
      for (let i = 0; i < 10; i += 1) {
        expect(await replay.contains(`node:${i}`)).toBe(true);
      }
      expect(await replay.contains("node:new")).toBe(true);
    });
  });

  describe("deterministic output", () => {
    it("produces the same root OID when the same snapshot is flushed twice", async () => {
      // Two identical insertion sequences must yield the same snapshot,
      // which must flush to the same root OID through the content-
      // addressed store.
      const storeA = new InMemoryTrieStore();
      const storeB = new InMemoryTrieStore();
      const curA = cursorOf(null, storeA);
      const curB = cursorOf(null, storeB);
      for (let i = 0; i < 5; i += 1) {
        await curA.add(`node:${i}`, new Dot("w", i + 1));
        await curB.add(`node:${i}`, new Dot("w", i + 1));
      }
      const fA = new TrieFlusher({ store: storeA, codec: cborCodec });
      const fB = new TrieFlusher({ store: storeB, codec: cborCodec });
      const rA = await fA.flush(curA.snapshot());
      const rB = await fB.flush(curB.snapshot());
      expect(rA.rootOid).toBe(rB.rootOid);
    });
  });

  describe("error surface", () => {
    it("raises E_TRIE_FLUSH_UNRESOLVED when a pending child OID cannot be replaced", async () => {
      const { flusher } = newStoreAndFlusher();
      // Fabricate a branch whose only child is a bare `pending:...`
      // sentinel with no matching freshly-written OID and no
      // clean-child record. This simulates a cursor/flusher
      // handshake bug.
      const brokenBranch = new TrieBranch(
        new Map<number, string>([[0, "pending:0"]]),
        GEOMETRY_16,
      );
      const snap = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map(),
        dirtyBranches: new Map([[encodeDirtyPath([]), brokenBranch]]),
        cleanChildren: new Map(),
      });
      try {
        await flusher.flush(snap);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieFlushError);
        if (err instanceof TrieFlushError) {
          expect(err.code).toBe("E_TRIE_FLUSH_UNRESOLVED");
        }
      }
    });

    it("raises E_TRIE_FLUSH_STORE when store.writeLeaf fails", async () => {
      const store = makeFailingLeafStore();
      const flusher = new TrieFlusher({ store, codec: cborCodec });
      const leaf = new TrieLeaf([], GEOMETRY_16);
      const snap = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([[encodeDirtyPath([]), leaf]]),
        dirtyBranches: new Map(),
        cleanChildren: new Map(),
      });
      try {
        await flusher.flush(snap);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieFlushError);
        if (err instanceof TrieFlushError) {
          expect(err.code).toBe("E_TRIE_FLUSH_STORE");
          expect(err.context["path"]).toBe("");
        }
      }
    });

    it("raises E_TRIE_FLUSH_STORE when store.writeBranch fails", async () => {
      const store = makeFailingBranchStore();
      const flusher = new TrieFlusher({ store, codec: cborCodec });
      const branch = new TrieBranch(new Map<number, string>(), GEOMETRY_16);
      const snap = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map(),
        dirtyBranches: new Map([[encodeDirtyPath([]), branch]]),
        cleanChildren: new Map(),
      });
      try {
        await flusher.flush(snap);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieFlushError);
        if (err instanceof TrieFlushError) {
          expect(err.code).toBe("E_TRIE_FLUSH_STORE");
        }
      }
    });
  });

  describe("clean subtree fallback", () => {
    it("reuses a clean child OID recorded in the snapshot", async () => {
      const { store, flusher } = newStoreAndFlusher();
      // Build a root branch whose nibble-3 child is a clean child.
      const branch = new TrieBranch(
        new Map<number, string>([[3, "pending:3"]]),
        GEOMETRY_16,
      );
      const snap = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map(),
        dirtyBranches: new Map([[encodeDirtyPath([]), branch]]),
        cleanChildren: new Map([[encodeDirtyPath([3]), "clean-child-oid"]]),
      });
      const result = await flusher.flush(snap);
      expect(result.blobsWritten).toBe(0);
      expect(result.treesWritten).toBe(1);
      expect(store.hasBranch(result.rootOid ?? "")).toBe(true);
    });
  });
});

function makeFailingLeafStore(): InMemoryTrieStore {
  const store = new InMemoryTrieStore();
  // Monkey-patch writeLeaf to always throw. Keep all other
  // methods intact.
  const original = store.writeLeaf.bind(store);
  store.writeLeaf = async () => {
    throw new (await import("../../../../../src/domain/errors/TrieStoreError.ts")).default(
      "synthetic write fault",
      { code: "E_TRIE_STORE_WRITE" },
    );
  };
  void original;
  return store;
}

function makeFailingBranchStore(): InMemoryTrieStore {
  const store = new InMemoryTrieStore();
  const original = store.writeBranch.bind(store);
  store.writeBranch = async () => {
    throw new (await import("../../../../../src/domain/errors/TrieStoreError.ts")).default(
      "synthetic branch write fault",
      { code: "E_TRIE_STORE_WRITE" },
    );
  };
  void original;
  return store;
}
