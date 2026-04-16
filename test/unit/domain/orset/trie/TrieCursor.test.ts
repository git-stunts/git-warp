import { describe, it, expect, beforeEach } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import TrieCursor from "../../../../../src/domain/orset/trie/TrieCursor.ts";
import TrieCursorError from "../../../../../src/domain/errors/TrieCursorError.ts";
import TrieStoreError from "../../../../../src/domain/errors/TrieStoreError.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeaf from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import {
  InMemoryTrieStore,
  NeverCallStore,
  FaultyTrieStore,
} from "../../../../helpers/trieHelpers.ts";

const GEOMETRY_16 = TrieGeometry.default16way();

function makeCursor(opts?: {
  readonly rootOid?: string | null;
  readonly store?: InMemoryTrieStore | NeverCallStore | FaultyTrieStore;
  readonly geometry?: TrieGeometry;
}): {
  readonly cursor: TrieCursor;
  readonly store: InMemoryTrieStore | NeverCallStore | FaultyTrieStore;
} {
  const store = opts?.store ?? new InMemoryTrieStore();
  const cursor = new TrieCursor({
    rootOid: opts?.rootOid ?? null,
    store,
    geometry: opts?.geometry ?? GEOMETRY_16,
    codec: cborCodec,
  });
  return { cursor, store };
}

function dotOf(writer: string, counter: number): Dot {
  return new Dot(writer, counter);
}

describe("TrieCursor", () => {
  describe("empty-trie fast paths", () => {
    let neverStore: NeverCallStore;

    beforeEach(() => {
      neverStore = new NeverCallStore();
    });

    it("contains returns false on an empty trie without touching the store", async () => {
      const { cursor } = makeCursor({ store: neverStore });
      expect(await cursor.contains("node:1")).toBe(false);
    });

    it("getDots returns an empty set on an empty trie", async () => {
      const { cursor } = makeCursor({ store: neverStore });
      const dots = await cursor.getDots("node:1");
      expect(dots.size).toBe(0);
    });

    it("elements returns [] on an empty trie", async () => {
      const { cursor } = makeCursor({ store: neverStore });
      expect(await cursor.elements()).toEqual([]);
    });

    it("remove on an empty observed set does not touch the store", async () => {
      const { cursor } = makeCursor({ store: neverStore });
      await cursor.remove(new Set());
      await cursor.remove(new Set<string>());
    });

    it("snapshot of a fresh cursor is empty with null rootOid", () => {
      const { cursor } = makeCursor({ store: neverStore });
      const snap = cursor.snapshot();
      expect(snap.isEmpty()).toBe(true);
      expect(snap.rootOid()).toBeNull();
    });
  });

  describe("validation", () => {
    it("rejects an empty element string", async () => {
      const { cursor } = makeCursor();
      await expect(cursor.contains("")).rejects.toBeInstanceOf(TrieCursorError);
    });

    it("rejects an add dot with zero counter", async () => {
      const { cursor } = makeCursor();
      try {
        // Build by hand to bypass Dot's constructor validation.
        const badDot = Object.freeze({ writerId: "w", counter: 0 }) as unknown as Dot;
        await cursor.add("node:1", badDot);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieCursorError);
        if (err instanceof TrieCursorError) {
          expect(err.code).toBe("E_TRIE_CURSOR_INPUT");
        }
      }
    });

    it("rejects an add dot with empty writerId", async () => {
      const { cursor } = makeCursor();
      const badDot = Object.freeze({ writerId: "", counter: 1 }) as unknown as Dot;
      await expect(cursor.add("node:1", badDot)).rejects.toBeInstanceOf(
        TrieCursorError,
      );
    });
  });

  describe("single-add insertion", () => {
    it("creates the first root and a leaf on the first add", async () => {
      const { cursor } = makeCursor();
      await cursor.add("node:1", dotOf("alice", 1));
      expect(await cursor.contains("node:1")).toBe(true);
      const snap = cursor.snapshot();
      expect(snap.isEmpty()).toBe(false);
      expect(snap.dirtyBranchAt([])).not.toBeNull();
    });

    it("returns the live dots after add", async () => {
      const { cursor } = makeCursor();
      await cursor.add("node:1", dotOf("alice", 1));
      const dots = await cursor.getDots("node:1");
      expect(dots.size).toBe(1);
      expect(dots.has(Dot.encode(dotOf("alice", 1)))).toBe(true);
    });

    it("does not call writeLeaf / writeBranch — the flusher does that", async () => {
      const store = new InMemoryTrieStore();
      const { cursor } = makeCursor({ store });
      await cursor.add("node:1", dotOf("alice", 1));
      expect(store.hasBeenWrittenTo()).toBe(false);
    });

    it("elements lists the newly-added element", async () => {
      const { cursor } = makeCursor();
      await cursor.add("node:1", dotOf("alice", 1));
      expect(await cursor.elements()).toEqual(["node:1"]);
    });
  });

  describe("multiple adds in one leaf", () => {
    it("reports multiple elements under the same cursor", async () => {
      const { cursor } = makeCursor();
      await cursor.add("alpha", dotOf("w1", 1));
      await cursor.add("beta", dotOf("w1", 2));
      await cursor.add("gamma", dotOf("w1", 3));
      const all = await cursor.elements();
      expect(new Set(all)).toEqual(new Set(["alpha", "beta", "gamma"]));
    });

    it("treats adds of the same (element,dot) as idempotent", async () => {
      const { cursor } = makeCursor();
      await cursor.add("node:1", dotOf("alice", 1));
      await cursor.add("node:1", dotOf("alice", 1));
      const dots = await cursor.getDots("node:1");
      expect(dots.size).toBe(1);
    });

    it("extends an existing entry with a new dot", async () => {
      const { cursor } = makeCursor();
      await cursor.add("node:1", dotOf("alice", 1));
      await cursor.add("node:1", dotOf("alice", 2));
      const dots = await cursor.getDots("node:1");
      expect(dots.size).toBe(2);
    });
  });

  describe("leaf splits", () => {
    it("splits when leaf entries exceed leafCapacity", async () => {
      const tiny = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const { cursor } = makeCursor({ geometry: tiny });
      // Add enough elements to force several leaves past capacity-2.
      // At ~30 elements distributed over 16 depth-0 nibbles, every
      // bucket that reaches 3+ entries must split.
      for (let i = 0; i < 30; i += 1) {
        await cursor.add(`el-${i}`, dotOf("w", i + 1));
      }
      const all = await cursor.elements();
      expect(all.length).toBe(30);
      const snap = cursor.snapshot();
      // At least one branch must now sit below the root (we
      // overflowed past capacity-2 somewhere).
      let foundDeepBranch = false;
      for (const entry of snap.enumerateBottomUp()) {
        if (entry.path.length >= 1 && entry.node instanceof TrieBranch) {
          foundDeepBranch = true;
          break;
        }
      }
      expect(foundDeepBranch).toBe(true);
    });

    it("keeps all elements reachable after a cascade of splits", async () => {
      const tiny = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const { cursor } = makeCursor({ geometry: tiny });
      const ids = Array.from({ length: 20 }, (_, i) => `node:${i}`);
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id === undefined) {
          continue;
        }
        await cursor.add(id, dotOf("w", i + 1));
      }
      for (const id of ids) {
        expect(await cursor.contains(id)).toBe(true);
      }
    });

    it("a snapshot after splits enumerates bottom-up (deepest first)", async () => {
      const tiny = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const { cursor } = makeCursor({ geometry: tiny });
      for (let i = 0; i < 12; i += 1) {
        await cursor.add(`node:${i}`, dotOf("w", i + 1));
      }
      const paths = [...cursor.snapshot().enumerateBottomUp()].map(
        (e) => e.path.length,
      );
      // Strictly non-increasing depths.
      for (let i = 1; i < paths.length; i += 1) {
        const prev = paths[i - 1] ?? 0;
        const curr = paths[i] ?? 0;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  describe("remove semantics", () => {
    it("moves a dot from live to tombstoned", async () => {
      const { cursor } = makeCursor();
      const d = dotOf("alice", 1);
      await cursor.add("node:1", d);
      await cursor.remove(new Set([Dot.encode(d)]));
      expect(await cursor.contains("node:1")).toBe(false);
      const live = await cursor.getDots("node:1");
      expect(live.size).toBe(0);
    });

    it("leaves unrelated dots untouched", async () => {
      const { cursor } = makeCursor();
      const live = dotOf("alice", 1);
      const other = dotOf("alice", 2);
      await cursor.add("node:1", live);
      await cursor.add("node:1", other);
      await cursor.remove(new Set([Dot.encode(live)]));
      const remaining = await cursor.getDots("node:1");
      expect(remaining.size).toBe(1);
      expect(remaining.has(Dot.encode(other))).toBe(true);
    });

    it("elements excludes elements whose dots are all tombstoned", async () => {
      const { cursor } = makeCursor();
      const d = dotOf("alice", 1);
      await cursor.add("node:1", d);
      await cursor.remove(new Set([Dot.encode(d)]));
      expect(await cursor.elements()).toEqual([]);
    });
  });

  describe("round-trip through a stored root", () => {
    it("loads a branch root at construction and finds pre-existing entries", async () => {
      // Pre-seed the store with a branch + leaf pair manually, as
      // a later cycle (flush) will. Build a single-entry leaf at
      // the depth-0 nibble for "node:1".
      const store = new InMemoryTrieStore();
      const rootOid = await seedSingleElement(store, "node:1", dotOf("x", 1));
      const { cursor } = makeCursor({ store, rootOid });
      expect(await cursor.contains("node:1")).toBe(true);
    });

    it("records the clean child OID for a subtree the cursor only reads", async () => {
      const store = new InMemoryTrieStore();
      const rootOid = await seedSingleElement(store, "node:1", dotOf("x", 1));
      const { cursor } = makeCursor({ store, rootOid });
      await cursor.contains("node:1");
      const snap = cursor.snapshot();
      // Some subtree path must have been recorded as clean.
      let foundCleanRecord = false;
      for (let n = 0; n < 16; n += 1) {
        if (snap.cleanChildOidAt([n]) !== null) {
          foundCleanRecord = true;
          break;
        }
      }
      expect(foundCleanRecord).toBe(true);
    });

    it("surfaces a store read failure as E_TRIE_CURSOR_STORE", async () => {
      const faulty = new FaultyTrieStore();
      faulty.queueReadFault(
        new TrieStoreError("synthetic", { code: "E_TRIE_STORE_READ" }),
      );
      const { cursor } = makeCursor({ store: faulty, rootOid: "ghost-root" });
      try {
        await cursor.contains("node:1");
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieCursorError);
        if (err instanceof TrieCursorError) {
          expect(err.code).toBe("E_TRIE_CURSOR_STORE");
        }
      }
    });

    it("surfaces a decode failure as E_TRIE_CURSOR_DECODE", async () => {
      const store = new InMemoryTrieStore();
      // Write malformed leaf bytes (valid blob, invalid CBOR
      // envelope) directly under a fabricated root that points
      // at this OID.
      const badBytes = new Uint8Array([0x00, 0x01, 0x02]);
      const badOid = await store.writeLeaf(badBytes);
      const rootEntries = new Map<number, string>([[0, badOid]]);
      const rootOid = await store.writeBranch(rootEntries);
      const { cursor } = makeCursor({ store, rootOid });
      try {
        // Pick an element whose depth-0 nibble is 0 to force the
        // decode attempt against the malformed blob.
        const element = await findElementWithDepth0Nibble(0);
        await cursor.contains(element);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieCursorError);
        if (err instanceof TrieCursorError) {
          expect(err.code).toBe("E_TRIE_CURSOR_DECODE");
        }
      }
    });
  });
});

// -- helpers (test-local) ---------------------------------------------------

async function seedSingleElement(
  store: InMemoryTrieStore,
  element: string,
  dot: Dot,
): Promise<string> {
  const { default: RouteKey } = await import(
    "../../../../../src/domain/orset/route/RouteKey.ts"
  );
  const { suffixOfRouteKey } = await import(
    "../../../../../src/domain/orset/trie/trieCursorHelpers.ts"
  );
  const routeKey = RouteKey.fromElement(element);
  const n0 = routeKey.nibbleAt(0, 4);
  const suffix = suffixOfRouteKey(routeKey, 1, 4);
  const leaf = new TrieLeaf(
    [
      {
        routeKeySuffix: suffix,
        element,
        dots: new Set([Dot.encode(dot)]),
        tombstonedDots: new Set<string>(),
      },
    ],
    GEOMETRY_16,
  );
  const leafBytes = leaf.serialize(cborCodec);
  const leafOid = await store.writeLeaf(leafBytes);
  const rootEntries = new Map<number, string>([[n0, leafOid]]);
  return await store.writeBranch(rootEntries);
}

async function findElementWithDepth0Nibble(target: number): Promise<string> {
  const { default: RouteKey } = await import(
    "../../../../../src/domain/orset/route/RouteKey.ts"
  );
  for (let i = 0; i < 10000; i += 1) {
    const candidate = `probe-${i}`;
    if (RouteKey.fromElement(candidate).nibbleAt(0, 4) === target) {
      return candidate;
    }
  }
  throw new Error("no element with target nibble found within probe range");
}
