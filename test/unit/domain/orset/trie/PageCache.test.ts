import { describe, it, expect } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import TrieCursor from "../../../../../src/domain/orset/trie/TrieCursor.ts";
import TrieFlusher from "../../../../../src/domain/orset/trie/TrieFlusher.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieCursorError from "../../../../../src/domain/errors/TrieCursorError.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeaf from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY_16 = TrieGeometry.default16way();

function makeLeaf(element: string, suffixByte: number): TrieLeaf {
  return new TrieLeaf(
    [
      {
        routeKeySuffix: Uint8Array.of(suffixByte),
        element,
        dots: new Set<string>(),
        tombstonedDots: new Set<string>(),
      },
    ],
    GEOMETRY_16,
  );
}

function makeBranch(childOid: string): TrieBranch {
  return new TrieBranch(new Map([[0, childOid]]), GEOMETRY_16);
}

function makeCursor(opts?: {
  readonly rootOid?: string | null;
  readonly store?: InMemoryTrieStore;
  readonly geometry?: TrieGeometry;
  readonly pageCache?: PageCache;
}): {
  readonly cursor: TrieCursor;
  readonly store: InMemoryTrieStore;
  readonly pageCache: PageCache;
} {
  const store = opts?.store ?? new InMemoryTrieStore();
  const pageCache = opts?.pageCache ?? new PageCache({ maxResident: 4 });
  const cursor = new TrieCursor({
    rootOid: opts?.rootOid ?? null,
    store,
    geometry: opts?.geometry ?? GEOMETRY_16,
    codec: cborCodec,
    pageCache,
  });
  return { cursor, store, pageCache };
}

async function flushRootWithElements(args: {
  readonly store: InMemoryTrieStore;
  readonly elements: readonly string[];
}): Promise<string> {
  const { cursor } = makeCursor({
    store: args.store,
    pageCache: new PageCache({ maxResident: 8 }),
  });
  for (let i = 0; i < args.elements.length; i += 1) {
    const element = args.elements[i];
    if (element === undefined) {
      continue;
    }
    await cursor.add(element, new Dot("writer", i + 1));
  }
  const flusher = new TrieFlusher({ store: args.store, codec: cborCodec });
  const result = await flusher.flush(cursor.snapshot());
  if (result.rootOid === null) {
    throw new Error("expected non-null rootOid");
  }
  return result.rootOid;
}

describe("PageCache", () => {
  describe("construction", () => {
    it("rejects maxResident=0", () => {
      expect(() => new PageCache({ maxResident: 0 })).toThrow();
    });

    it("rejects negative maxResident", () => {
      expect(() => new PageCache({ maxResident: -1 })).toThrow();
    });

    it("rejects non-integer maxResident", () => {
      expect(() => new PageCache({ maxResident: 1.5 })).toThrow();
    });
  });

  describe("pure lru behavior", () => {
    it("records a miss without increasing resident count", () => {
      const cache = new PageCache({ maxResident: 2 });

      expect(cache.get("missing-oid")).toBeNull();
      expect(cache.stats().misses).toBe(1);
      expect(cache.stats().resident).toBe(0);
    });

    it("stores both leaves and branches in one resident pool", () => {
      const cache = new PageCache({ maxResident: 2 });

      cache.put("leaf-1", makeLeaf("alpha", 0x01));
      cache.put("branch-1", makeBranch("child-oid"));

      expect(cache.get("leaf-1")).toBeInstanceOf(TrieLeaf);
      expect(cache.get("branch-1")).toBeInstanceOf(TrieBranch);
      expect(cache.stats().resident).toBe(2);
    });

    it("promotes a hit to MRU and evicts the true LRU on overflow", () => {
      const cache = new PageCache({ maxResident: 2 });

      cache.put("leaf-a", makeLeaf("alpha", 0x01));
      cache.put("leaf-b", makeLeaf("beta", 0x02));
      expect(cache.get("leaf-a")).toBeInstanceOf(TrieLeaf);

      cache.put("leaf-c", makeLeaf("gamma", 0x03));

      expect(cache.get("leaf-b")).toBeNull();
      expect(cache.get("leaf-a")).toBeInstanceOf(TrieLeaf);
      expect(cache.get("leaf-c")).toBeInstanceOf(TrieLeaf);
      expect(cache.stats().evictions).toBe(1);
    });

    it("re-put of an existing OID refreshes recency without increasing resident count", () => {
      const cache = new PageCache({ maxResident: 2 });

      cache.put("leaf-a", makeLeaf("alpha", 0x01));
      cache.put("leaf-b", makeLeaf("beta", 0x02));
      cache.put("leaf-a", makeLeaf("alpha-2", 0x03));

      expect(cache.stats().resident).toBe(2);

      cache.put("leaf-c", makeLeaf("gamma", 0x04));
      expect(cache.get("leaf-b")).toBeNull();
      expect(cache.get("leaf-a")).toBeInstanceOf(TrieLeaf);
    });
  });
});

describe("TrieCursor + PageCache", () => {
  it("reuses a shared cache across two cursors and avoids repeated store reads", async () => {
    const store = new InMemoryTrieStore();
    const rootOid = await flushRootWithElements({
      store,
      elements: ["node:1", "node:2"],
    });
    const sharedCache = new PageCache({ maxResident: 8 });

    const first = makeCursor({ rootOid, store, pageCache: sharedCache }).cursor;
    expect(await first.contains("node:1")).toBe(true);
    const afterFirst = store.readCounts();

    const second = makeCursor({ rootOid, store, pageCache: sharedCache }).cursor;
    expect(await second.contains("node:1")).toBe(true);
    expect(store.readCounts()).toEqual(afterFirst);
  });

  it("does not place dirty working pages or pending OIDs into the cache before flush", async () => {
    const { cursor, pageCache } = makeCursor();

    await cursor.add("node:1", new Dot("alice", 1));

    expect(pageCache.stats().resident).toBe(0);
    expect(pageCache.get("pending:0")).toBeNull();
  });

  it("raises a cursor error when the cache returns a leaf for the root OID", async () => {
    const store = new InMemoryTrieStore();
    const pageCache = new PageCache({ maxResident: 4 });
    pageCache.put("root-oid", makeLeaf("node:1", 0x01));

    const { cursor } = makeCursor({
      rootOid: "root-oid",
      store,
      pageCache,
    });

    await expect(cursor.contains("node:1")).rejects.toBeInstanceOf(
      TrieCursorError,
    );
  });
});
