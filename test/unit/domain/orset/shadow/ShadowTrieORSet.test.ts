import { describe, it, expect } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import TrieCursor from "../../../../../src/domain/orset/trie/TrieCursor.ts";
import TrieFlusher from "../../../../../src/domain/orset/trie/TrieFlusher.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieCursorError from "../../../../../src/domain/errors/TrieCursorError.ts";
import TrieStoreError from "../../../../../src/domain/errors/TrieStoreError.ts";
import ShadowTrieORSet from "../../../../../src/domain/orset/shadow/ShadowTrieORSet.ts";
import ShadowTrieORSetError from "../../../../../src/domain/errors/ShadowTrieORSetError.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import {
  FaultyTrieStore,
  InMemoryTrieStore,
} from "../../../../helpers/trieHelpers.ts";

const GEOMETRY_16 = TrieGeometry.default16way();

function makeEngine(opts?: {
  readonly rootOid?: string | null;
  readonly store?: InMemoryTrieStore | FaultyTrieStore;
  readonly geometry?: TrieGeometry;
}): {
  readonly engine: ShadowTrieORSet;
  readonly store: InMemoryTrieStore | FaultyTrieStore;
  readonly cursor: TrieCursor;
  readonly flusher: TrieFlusher;
} {
  const store = opts?.store ?? new InMemoryTrieStore();
  const cursor = new TrieCursor({
    rootOid: opts?.rootOid ?? null,
    store,
    geometry: opts?.geometry ?? GEOMETRY_16,
    codec: cborCodec,
    pageCache: new PageCache({ maxResident: 16 }),
  });
  const flusher = new TrieFlusher({ store, codec: cborCodec });
  const engine = new ShadowTrieORSet({ cursor, flusher });
  return { engine, store, cursor, flusher };
}

async function scanAll(engine: ShadowTrieORSet): Promise<readonly string[]> {
  const out: string[] = [];
  for await (const element of engine.scan()) {
    out.push(element);
  }
  return out;
}

function malformedDot(writerId: string, counter: number): Dot {
  const candidate = { writerId, counter };
  Object.setPrototypeOf(candidate, Dot.prototype);
  return candidate;
}

describe("ShadowTrieORSet", () => {
  describe("construction", () => {
    it("rejects a non-TrieCursor constructor argument", () => {
      const { flusher } = makeEngine();
      // @ts-expect-error intentional runtime validation test
      expect(() => new ShadowTrieORSet({ cursor: {}, flusher })).toThrow(
        ShadowTrieORSetError,
      );
    });

    it("rejects a non-TrieFlusher constructor argument", () => {
      const { cursor } = makeEngine();
      // @ts-expect-error intentional runtime validation test
      expect(() => new ShadowTrieORSet({ cursor, flusher: {} })).toThrow(
        ShadowTrieORSetError,
      );
    });
  });

  describe("golden path", () => {
    it("reports an empty engine honestly", async () => {
      const { engine } = makeEngine();

      expect(await engine.contains("node:1")).toBe(false);
      expect(await engine.getDots("node:1")).toEqual(new Set<string>());
      expect(await scanAll(engine)).toEqual([]);
    });

    it("adds one element and exposes it through contains, getDots, and scan", async () => {
      const { engine } = makeEngine();

      await engine.add("node:1", new Dot("alice", 1));

      expect(await engine.contains("node:1")).toBe(true);
      expect(await engine.getDots("node:1")).toEqual(
        new Set([Dot.encode(new Dot("alice", 1))]),
      );
      expect(await scanAll(engine)).toEqual(["node:1"]);
    });

    it("adds multiple elements and scans all visible ids", async () => {
      const { engine } = makeEngine();

      await engine.add("node:1", new Dot("alice", 1));
      await engine.add("node:2", new Dot("alice", 2));
      await engine.add("node:3", new Dot("alice", 3));

      expect(new Set(await scanAll(engine))).toEqual(
        new Set(["node:1", "node:2", "node:3"]),
      );
    });

    it("removes observed dots and hides tombstoned entries from contains and scan", async () => {
      const { engine } = makeEngine();
      const dot = new Dot("alice", 1);

      await engine.add("node:1", dot);
      await engine.remove(new Set([Dot.encode(dot)]));

      expect(await engine.contains("node:1")).toBe(false);
      expect(await engine.getDots("node:1")).toEqual(new Set<string>());
      expect(await scanAll(engine)).toEqual([]);
    });

    it("flushes persisted state and a reopened cursor sees the same visible set", async () => {
      const { engine, store } = makeEngine();

      await engine.add("node:1", new Dot("alice", 1));
      await engine.add("node:2", new Dot("alice", 2));

      const result = await engine.flush();
      expect(result.rootOid).not.toBeNull();
      if (result.rootOid === null) {
        throw new Error("rootOid must exist after flush");
      }

      const reopened = makeEngine({ rootOid: result.rootOid, store }).engine;
      expect(new Set(await scanAll(reopened))).toEqual(
        new Set(["node:1", "node:2"]),
      );
    });
  });

  describe("edge cases", () => {
    it("treats duplicate add of the same (element,dot) as idempotent", async () => {
      const { engine } = makeEngine();
      const dot = new Dot("alice", 1);

      await engine.add("node:1", dot);
      await engine.add("node:1", dot);

      expect(await engine.getDots("node:1")).toEqual(
        new Set([Dot.encode(dot)]),
      );
    });

    it("preserves add-wins visibility when only one of multiple dots is removed", async () => {
      const { engine } = makeEngine();
      const dot1 = new Dot("alice", 1);
      const dot2 = new Dot("alice", 2);

      await engine.add("node:1", dot1);
      await engine.add("node:1", dot2);
      await engine.remove(new Set([Dot.encode(dot1)]));

      expect(await engine.contains("node:1")).toBe(true);
      expect(await engine.getDots("node:1")).toEqual(
        new Set([Dot.encode(dot2)]),
      );
    });

    it("targets removal by element even when another element carries the same dot", async () => {
      const { engine } = makeEngine();
      const sharedDot = new Dot("alice", 1);

      await engine.add("node:target", sharedDot);
      await engine.add("node:other", sharedDot);
      await engine.removeElement("node:target", new Set([Dot.encode(sharedDot)]));

      expect(await engine.contains("node:target")).toBe(false);
      expect(await engine.contains("node:other")).toBe(true);
    });

    it("treats empty, unknown, and unobserved targeted removals as no-ops", async () => {
      const { engine } = makeEngine();
      const dot = new Dot("alice", 1);
      await engine.add("node:target", dot);

      await engine.removeElement("node:target", new Set());
      await engine.removeElement("node:missing", new Set([Dot.encode(dot)]));
      await engine.removeElement(
        "node:target",
        new Set([Dot.encode(new Dot("alice", 2))]),
      );

      expect(await engine.contains("node:target")).toBe(true);
    });

    it("treats remove of an empty observed-dot set as a no-op", async () => {
      const { engine } = makeEngine();

      await engine.add("node:1", new Dot("alice", 1));
      await engine.remove(new Set<string>());

      expect(await engine.contains("node:1")).toBe(true);
      expect(await scanAll(engine)).toEqual(["node:1"]);
    });

    it("ignores tombstones for dots the engine has never observed", async () => {
      const { engine } = makeEngine();

      await engine.add("node:1", new Dot("alice", 1));
      await engine.remove(new Set([Dot.encode(new Dot("ghost", 99))]));

      expect(await engine.contains("node:1")).toBe(true);
    });

    it("keeps split-trie entries reachable through scan and contains", async () => {
      const tiny = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const { engine } = makeEngine({ geometry: tiny });

      const ids = Array.from({ length: 20 }, (_, i) => `node:${i}`);
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id !== undefined) {
          await engine.add(id, new Dot("writer", i + 1));
        }
      }

      expect(new Set(await scanAll(engine))).toEqual(new Set(ids));
      for (const id of ids) {
        expect(await engine.contains(id)).toBe(true);
      }
    });

    it("reads only the target route when removing from a persisted split trie", async () => {
      const tiny = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const store = new InMemoryTrieStore();
      const { engine } = makeEngine({ geometry: tiny, store });
      const ids = Array.from({ length: 128 }, (_, index) => `node:${index}`);
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (id !== undefined) {
          await engine.add(id, new Dot("writer", index + 1));
        }
      }
      const flushed = await engine.flush();
      expect(flushed.rootOid).not.toBeNull();
      if (flushed.rootOid === null) {
        throw new Error("rootOid must exist after split-trie flush");
      }

      const target = "node:63";
      const targetDot = new Dot("writer", 64);
      const lookup = makeEngine({ rootOid: flushed.rootOid, store, geometry: tiny }).engine;
      const beforeLookup = store.readCounts();
      expect(await lookup.contains(target)).toBe(true);
      const afterLookup = store.readCounts();
      const lookupReads = {
        leaf: afterLookup.leaf - beforeLookup.leaf,
        branch: afterLookup.branch - beforeLookup.branch,
      };

      const removal = makeEngine({ rootOid: flushed.rootOid, store, geometry: tiny }).engine;
      const beforeRemoval = store.readCounts();
      await removal.removeElement(target, new Set([Dot.encode(targetDot)]));
      const afterRemoval = store.readCounts();
      const removalReads = {
        leaf: afterRemoval.leaf - beforeRemoval.leaf,
        branch: afterRemoval.branch - beforeRemoval.branch,
      };

      expect(removalReads).toEqual(lookupReads);
      expect(removalReads.leaf + removalReads.branch).toBeLessThan(10);

      const removed = await removal.flush();
      expect(removed.rootOid).not.toBeNull();
      if (removed.rootOid === null) {
        throw new Error("rootOid must exist after targeted removal flush");
      }
      const reopened = makeEngine({ rootOid: removed.rootOid, store, geometry: tiny }).engine;
      expect(await reopened.contains(target)).toBe(false);
      expect(await reopened.contains("node:62")).toBe(true);
      expect(await reopened.contains("node:64")).toBe(true);
    });

    it("returns a clean flush result when no writes occurred", async () => {
      const { engine } = makeEngine();
      const result = await engine.flush();
      expect(result.isClean()).toBe(true);
      expect(result.rootOid).toBeNull();
    });
  });

  describe("known failure modes", () => {
    it("surfaces invalid element input from the delegated cursor", async () => {
      const { engine } = makeEngine();
      await expect(engine.contains("")).rejects.toBeInstanceOf(TrieCursorError);
    });

    it("surfaces malformed dot input from the delegated cursor", async () => {
      const { engine } = makeEngine();
      const badDot = malformedDot("alice", 0);
      await expect(engine.add("node:1", badDot)).rejects.toBeInstanceOf(
        TrieCursorError,
      );
    });

    it("surfaces store faults from delegated cursor reads", async () => {
      const store = new FaultyTrieStore();
      const rootOid = "existing-root";
      store.queueReadFault(
        new TrieStoreError("boom", { code: "E_TRIE_STORE_READ" }),
      );
      const { engine } = makeEngine({ store, rootOid });
      await expect(engine.contains("node:1")).rejects.toBeInstanceOf(
        TrieCursorError,
      );
    });

    it("does not expose the synchronous ORSet elements() surface", () => {
      const { engine } = makeEngine();
      expect("elements" in engine).toBe(false);
    });
  });
});
