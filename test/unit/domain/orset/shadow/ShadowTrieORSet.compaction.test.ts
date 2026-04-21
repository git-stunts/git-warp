import { describe, expect, it } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import VersionVector from "../../../../../src/domain/crdt/VersionVector.ts";
import TrieCursor from "../../../../../src/domain/orset/trie/TrieCursor.ts";
import TrieFlusher from "../../../../../src/domain/orset/trie/TrieFlusher.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import TrieLeaf from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import ShadowTrieORSet from "../../../../../src/domain/orset/shadow/ShadowTrieORSet.ts";
import TrieCursorError from "../../../../../src/domain/errors/TrieCursorError.ts";
import TrieStoreError from "../../../../../src/domain/errors/TrieStoreError.ts";
import RouteKey from "../../../../../src/domain/orset/route/RouteKey.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import {
  InMemoryTrieStore,
  NeverCallStore,
} from "../../../../helpers/trieHelpers.ts";

const DEFAULT_GEOMETRY = TrieGeometry.default16way();
const MERGE_GEOMETRY = new TrieGeometry({
  fanout: 16,
  nibbleBits: 4,
  leafCapacity: 3,
  leafFloor: 2,
});

class ToggleReadFaultTrieStore extends InMemoryTrieStore {
  #failReads = false;

  failReads(): void {
    this.#failReads = true;
  }

  override async readLeaf(oid: string): Promise<Uint8Array> {
    if (this.#failReads) {
      throw new TrieStoreError("boom", { code: "E_TRIE_STORE_READ" });
    }
    return await super.readLeaf(oid);
  }

  override async readBranch(oid: string) {
    if (this.#failReads) {
      throw new TrieStoreError("boom", { code: "E_TRIE_STORE_READ" });
    }
    return await super.readBranch(oid);
  }
}

function makeEngine(opts?: {
  readonly rootOid?: string | null;
  readonly store?: InMemoryTrieStore | ToggleReadFaultTrieStore;
  readonly geometry?: TrieGeometry;
}): {
  readonly engine: ShadowTrieORSet;
  readonly store: InMemoryTrieStore | ToggleReadFaultTrieStore;
} {
  const store = opts?.store ?? new InMemoryTrieStore();
  const geometry = opts?.geometry ?? DEFAULT_GEOMETRY;
  const cursor = new TrieCursor({
    rootOid: opts?.rootOid ?? null,
    store,
    geometry,
    codec: cborCodec,
    pageCache: new PageCache({ maxResident: 32 }),
  });
  const flusher = new TrieFlusher({ store, codec: cborCodec });
  return {
    engine: new ShadowTrieORSet({ cursor, flusher }),
    store,
  };
}

function makeNeverCallEngine(): ShadowTrieORSet {
  const store = new NeverCallStore();
  const cursor = new TrieCursor({
    rootOid: null,
    store,
    geometry: DEFAULT_GEOMETRY,
    codec: cborCodec,
    pageCache: new PageCache({ maxResident: 32 }),
  });
  const flusher = new TrieFlusher({ store, codec: cborCodec });
  return new ShadowTrieORSet({ cursor, flusher });
}

async function scanAll(engine: ShadowTrieORSet): Promise<readonly string[]> {
  const out: string[] = [];
  for await (const element of engine.scan()) {
    out.push(element);
  }
  return out;
}

async function flushAndReopen(args: {
  readonly engine: ShadowTrieORSet;
  readonly store: InMemoryTrieStore | ToggleReadFaultTrieStore;
  readonly geometry?: TrieGeometry;
}): Promise<{
  readonly rootOid: string | null;
  readonly reopened: ShadowTrieORSet;
}> {
  const result = await args.engine.flush();
  const reopened = args.geometry === undefined
    ? makeEngine({
        rootOid: result.rootOid,
        store: args.store,
      }).engine
    : makeEngine({
        rootOid: result.rootOid,
        store: args.store,
        geometry: args.geometry,
      }).engine;
  return { rootOid: result.rootOid, reopened };
}

async function readRootBranch(
  store: InMemoryTrieStore,
  rootOid: string,
  geometry: TrieGeometry,
): Promise<TrieBranch> {
  const entries = await store.readBranch(rootOid);
  return new TrieBranch(entries, geometry);
}

async function readPageAtOid(
  store: InMemoryTrieStore,
  oid: string,
  geometry: TrieGeometry,
): Promise<
  | { readonly kind: "leaf"; readonly leaf: TrieLeaf }
  | { readonly kind: "branch"; readonly branch: TrieBranch }
> {
  try {
    const bytes = await store.readLeaf(oid);
    return {
      kind: "leaf",
      leaf: TrieLeaf.deserialize(bytes, geometry, cborCodec),
    };
  } catch (raw) {
    if (!(raw instanceof TrieStoreError) || raw.code !== "E_TRIE_STORE_MISSING") {
      throw raw;
    }
  }
  const entries = await store.readBranch(oid);
  return {
    kind: "branch",
    branch: new TrieBranch(entries, geometry),
  };
}

async function rootChildPage(args: {
  readonly store: InMemoryTrieStore;
  readonly rootOid: string;
  readonly geometry: TrieGeometry;
  readonly element: string;
}) {
  const branch = await readRootBranch(args.store, args.rootOid, args.geometry);
  const nibble = firstNibble(args.element, args.geometry);
  const childOid = branch.get(nibble);
  expect(childOid).toBeDefined();
  if (childOid === undefined) {
    throw new Error("root child oid missing");
  }
  return await readPageAtOid(args.store, childOid, args.geometry);
}

function firstNibble(element: string, geometry: TrieGeometry): number {
  void geometry;
  return RouteKey.fromElement(element).nibbleAt(0, 4);
}

function leafElements(leaf: TrieLeaf): readonly string[] {
  return leaf.entries().map((entry) => entry.element);
}

function assertStrictSuffixOrder(leaf: TrieLeaf): void {
  const suffixes = leaf.entries().map((entry) =>
    Buffer.from(entry.routeKeySuffix).toString("hex"),
  );
  const sorted = [...suffixes].sort();
  expect(suffixes).toEqual(sorted);
}

describe("ShadowTrieORSet.compact", () => {
  describe("golden path", () => {
    it("compacts a stable fully tombstoned entry out of the trie", async () => {
      const { engine, store } = makeEngine();
      const dot = new Dot("alice", 1);

      await engine.add("node:1", dot);
      await engine.remove(new Set([Dot.encode(dot)]));
      await engine.compact(VersionVector.from({ alice: 1 }));

      expect(await engine.contains("node:1")).toBe(false);
      expect(await engine.getDots("node:1")).toEqual(new Set<string>());
      expect(await scanAll(engine)).toEqual([]);

      const { reopened } = await flushAndReopen({ engine, store });
      expect(await reopened.contains("node:1")).toBe(false);
      expect(await scanAll(reopened)).toEqual([]);
    });

    it("preserves surviving live dots while dropping only compactable tombstones", async () => {
      const { engine, store } = makeEngine();
      const dot1 = new Dot("alice", 1);
      const dot2 = new Dot("alice", 2);

      await engine.add("node:1", dot1);
      await engine.add("node:1", dot2);
      await engine.remove(new Set([Dot.encode(dot1)]));
      await engine.compact(VersionVector.from({ alice: 1 }));

      expect(await engine.contains("node:1")).toBe(true);
      expect(await engine.getDots("node:1")).toEqual(
        new Set([Dot.encode(dot2)]),
      );

      const { reopened } = await flushAndReopen({ engine, store });
      expect(await reopened.getDots("node:1")).toEqual(
        new Set([Dot.encode(dot2)]),
      );
      expect(await scanAll(reopened)).toEqual(["node:1"]);
    });

    it("does not flush implicitly while compacting working state", async () => {
      const store = new InMemoryTrieStore();
      const { engine } = makeEngine({ store });
      const dot = new Dot("alice", 1);

      await engine.add("node:1", dot);
      await engine.remove(new Set([Dot.encode(dot)]));
      await engine.compact(VersionVector.from({ alice: 1 }));

      expect(store.writeCounts()).toEqual({ leaf: 0, branch: 0 });
    });
  });

  describe("edge cases", () => {
    it("is a no-op on an empty trie", async () => {
      const engine = makeNeverCallEngine();

      await engine.compact(VersionVector.empty());

      expect(await scanAll(engine)).toEqual([]);
      const result = await engine.flush();
      expect(result.isClean()).toBe(true);
    });

    it("keeps tombstoned dots beyond the stable frontier intact", async () => {
      const { engine, store } = makeEngine();
      const dot = new Dot("alice", 1);

      await engine.add("node:1", dot);
      await engine.remove(new Set([Dot.encode(dot)]));
      await engine.compact(VersionVector.empty());

      const { rootOid } = await flushAndReopen({ engine, store });
      expect(rootOid).not.toBeNull();
      if (rootOid === null) {
        return;
      }

      const page = await rootChildPage({
        store,
        rootOid,
        geometry: DEFAULT_GEOMETRY,
        element: "node:1",
      });
      expect(page.kind).toBe("leaf");
      if (page.kind !== "leaf") {
        return;
      }
      expect(page.leaf.entries()).toHaveLength(1);
      const [entry] = page.leaf.entries();
      expect(entry?.element).toBe("node:1");
      expect(entry?.dots).toEqual(new Set<string>());
      expect(entry?.tombstonedDots).toEqual(new Set([Dot.encode(dot)]));
    });

    it("merges undersized sibling leaves when the combined size fits geometry", async () => {
      const { engine, store } = makeEngine({ geometry: MERGE_GEOMETRY });
      const ids: readonly string[] = ["node:19", "node:278", "node:20", "node:234"];

      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id !== undefined) {
          await engine.add(id, new Dot("writer", i + 1));
        }
      }
      await engine.remove(new Set([Dot.encode(new Dot("writer", 1))]));
      await engine.compact(VersionVector.from({ writer: 1 }));

      const { rootOid, reopened } = await flushAndReopen({
        engine,
        store,
        geometry: MERGE_GEOMETRY,
      });
      expect(new Set(await scanAll(reopened))).toEqual(
        new Set(["node:278", "node:20", "node:234"]),
      );
      expect(rootOid).not.toBeNull();
      if (rootOid === null) {
        return;
      }

      const page = await rootChildPage({
        store,
        rootOid,
        geometry: MERGE_GEOMETRY,
        element: "node:278",
      });
      expect(page.kind).toBe("leaf");
      if (page.kind !== "leaf") {
        return;
      }
      expect(new Set(leafElements(page.leaf))).toEqual(
        new Set(["node:278", "node:20", "node:234"]),
      );
    });

    it("keeps sibling leaves separate when the combined size would exceed capacity", async () => {
      const { engine, store } = makeEngine({ geometry: MERGE_GEOMETRY });
      const ids: readonly string[] = [
        "node:19",
        "node:278",
        "node:20",
        "node:234",
        "node:372",
      ];

      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id !== undefined) {
          await engine.add(id, new Dot("writer", i + 1));
        }
      }
      await engine.remove(new Set([Dot.encode(new Dot("writer", 1))]));
      await engine.compact(VersionVector.from({ writer: 1 }));

      const { rootOid } = await flushAndReopen({
        engine,
        store,
        geometry: MERGE_GEOMETRY,
      });
      expect(rootOid).not.toBeNull();
      if (rootOid === null) {
        return;
      }

      const page = await rootChildPage({
        store,
        rootOid,
        geometry: MERGE_GEOMETRY,
        element: "node:278",
      });
      expect(page.kind).toBe("branch");
      if (page.kind !== "branch") {
        return;
      }
      expect(page.branch.childCount()).toBe(2);
    });

    it("collapses a single-child branch into its parent leaf path", async () => {
      const { engine, store } = makeEngine({ geometry: MERGE_GEOMETRY });
      const ids: readonly string[] = ["node:19", "node:278", "node:20", "node:234"];

      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id !== undefined) {
          await engine.add(id, new Dot("writer", i + 1));
        }
      }
      await engine.remove(
        new Set([
          Dot.encode(new Dot("writer", 1)),
          Dot.encode(new Dot("writer", 2)),
        ]),
      );
      await engine.compact(VersionVector.from({ writer: 2 }));

      const { rootOid } = await flushAndReopen({
        engine,
        store,
        geometry: MERGE_GEOMETRY,
      });
      expect(rootOid).not.toBeNull();
      if (rootOid === null) {
        return;
      }

      const page = await rootChildPage({
        store,
        rootOid,
        geometry: MERGE_GEOMETRY,
        element: "node:20",
      });
      expect(page.kind).toBe("leaf");
      if (page.kind !== "leaf") {
        return;
      }
      expect(new Set(leafElements(page.leaf))).toEqual(
        new Set(["node:20", "node:234"]),
      );
    });
  });

  describe("known failure modes", () => {
    it("keeps merged leaf suffixes strictly sorted", async () => {
      const { engine, store } = makeEngine({ geometry: MERGE_GEOMETRY });
      const ids: readonly string[] = ["node:19", "node:278", "node:20", "node:234"];

      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id !== undefined) {
          await engine.add(id, new Dot("writer", i + 1));
        }
      }
      await engine.remove(new Set([Dot.encode(new Dot("writer", 1))]));
      await engine.compact(VersionVector.from({ writer: 1 }));

      const { rootOid } = await flushAndReopen({
        engine,
        store,
        geometry: MERGE_GEOMETRY,
      });
      expect(rootOid).not.toBeNull();
      if (rootOid === null) {
        return;
      }

      const page = await rootChildPage({
        store,
        rootOid,
        geometry: MERGE_GEOMETRY,
        element: "node:278",
      });
      expect(page.kind).toBe("leaf");
      if (page.kind !== "leaf") {
        return;
      }
      assertStrictSuffixOrder(page.leaf);
    });

    it("surfaces store faults while compacting persisted pages", async () => {
      const store = new ToggleReadFaultTrieStore();
      const dot = new Dot("alice", 1);
      const seeded = makeEngine({ store });

      await seeded.engine.add("node:1", dot);
      const flushed = await seeded.engine.flush();
      expect(flushed.rootOid).not.toBeNull();
      if (flushed.rootOid === null) {
        return;
      }

      store.failReads();
      const reopened = makeEngine({
        rootOid: flushed.rootOid,
        store,
      }).engine;

      await expect(
        reopened.compact(VersionVector.from({ alice: 1 })),
      ).rejects.toBeInstanceOf(TrieCursorError);
    });

    it("treats compaction over already-clean persisted state as a no-op", async () => {
      const store = new InMemoryTrieStore();
      const seeded = makeEngine({ store });

      await seeded.engine.add("node:1", new Dot("alice", 1));
      const before = await seeded.engine.flush();
      expect(before.rootOid).not.toBeNull();
      if (before.rootOid === null) {
        return;
      }

      const reopened = makeEngine({
        rootOid: before.rootOid,
        store,
      }).engine;

      const writesBefore = store.writeCounts();
      await reopened.compact(VersionVector.from({ alice: 99 }));
      const after = await reopened.flush();

      expect(after.isClean()).toBe(true);
      expect(store.writeCounts()).toEqual(writesBefore);
    });
  });
});
