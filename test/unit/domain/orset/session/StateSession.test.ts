import { describe, expect, it } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import VersionVector from "../../../../../src/domain/crdt/VersionVector.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import StateSessionError from "../../../../../src/domain/errors/StateSessionError.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();

async function openSession(args?: {
  readonly nodeAliveRootOid?: string | null;
  readonly edgeAliveRootOid?: string | null;
  readonly store?: InMemoryTrieStore;
  readonly pageCache?: PageCache;
  readonly geometry?: TrieGeometry;
}) {
  const store = args?.store ?? new InMemoryTrieStore();
  const pageCache = args?.pageCache ?? new PageCache({ maxResident: 32 });
  const session = await StateSession.open({
    nodeAliveRootOid: args?.nodeAliveRootOid ?? null,
    edgeAliveRootOid: args?.edgeAliveRootOid ?? null,
    store,
    codec: cborCodec,
    geometry: args?.geometry ?? GEOMETRY,
    pageCache,
  });
  return { session, store, pageCache };
}

async function scanAll(scan: AsyncIterable<string>): Promise<readonly string[]> {
  const out: string[] = [];
  for await (const element of scan) {
    out.push(element);
  }
  return out;
}

async function scanElementStates(
  scan: AsyncIterable<{
    readonly element: string;
    readonly dots: ReadonlySet<string>;
    readonly tombstonedDots: ReadonlySet<string>;
  }>,
): Promise<
  readonly {
    readonly element: string;
    readonly dots: readonly string[];
    readonly tombstonedDots: readonly string[];
  }[]
> {
  const out: Array<{
    readonly element: string;
    readonly dots: readonly string[];
    readonly tombstonedDots: readonly string[];
  }> = [];
  for await (const state of scan) {
    out.push({
      element: state.element,
      dots: [...state.dots].sort(),
      tombstonedDots: [...state.tombstonedDots].sort(),
    });
  }
  return out;
}

describe("StateSession", () => {
  describe("construction", () => {
    it("rejects an empty nodeAlive root oid", async () => {
      const store = new InMemoryTrieStore();
      const pageCache = new PageCache({ maxResident: 8 });

      await expect(
        StateSession.open({
          nodeAliveRootOid: "",
          edgeAliveRootOid: null,
          store,
          codec: cborCodec,
          geometry: GEOMETRY,
          pageCache,
        }),
      ).rejects.toBeInstanceOf(StateSessionError);
    });

    it("rejects a non-geometry constructor argument", async () => {
      const store = new InMemoryTrieStore();
      const pageCache = new PageCache({ maxResident: 8 });

      await expect(
        StateSession.open({
          nodeAliveRootOid: null,
          edgeAliveRootOid: null,
          store,
          codec: cborCodec,
          // @ts-expect-error intentional runtime validation test
          geometry: {},
          pageCache,
        }),
      ).rejects.toBeInstanceOf(StateSessionError);
    });

    it("rejects a non-page-cache constructor argument", async () => {
      const store = new InMemoryTrieStore();

      await expect(
        StateSession.open({
          nodeAliveRootOid: null,
          edgeAliveRootOid: null,
          store,
          codec: cborCodec,
          geometry: GEOMETRY,
          // @ts-expect-error intentional runtime validation test
          pageCache: {},
        }),
      ).rejects.toBeInstanceOf(StateSessionError);
    });
  });

  describe("golden path", () => {
    it("opens an empty session honestly and closes to null roots", async () => {
      const { session } = await openSession();

      expect(await session.nodeContains("node:1")).toBe(false);
      expect(await session.edgeContains("edge:1")).toBe(false);
      expect(await scanAll(session.scanNodes())).toEqual([]);
      expect(await scanAll(session.scanEdges())).toEqual([]);

      const result = await session.close();
      expect(result.nodeAliveRootOid).toBeNull();
      expect(result.edgeAliveRootOid).toBeNull();
    });

    it("persists node and edge state across close and reopen", async () => {
      const { session, store, pageCache } = await openSession();

      await session.addNode("node:1", new Dot("alice", 1));
      await session.addEdge("edge:1", new Dot("alice", 2));

      const result = await session.close();
      const reopened = await StateSession.open({
        nodeAliveRootOid: result.nodeAliveRootOid,
        edgeAliveRootOid: result.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry: GEOMETRY,
        pageCache,
      });

      expect(await reopened.nodeContains("node:1")).toBe(true);
      expect(await reopened.edgeContains("edge:1")).toBe(true);
      expect(await scanAll(reopened.scanNodes())).toEqual(["node:1"]);
      expect(await scanAll(reopened.scanEdges())).toEqual(["edge:1"]);
    });

    it("shares one page cache across nodeAlive and edgeAlive engines", async () => {
      const { session, store, pageCache } = await openSession();

      await session.addNode("shared:1", new Dot("alice", 1));
      await session.addEdge("shared:1", new Dot("alice", 1));

      const closeResult = await session.close();
      expect(closeResult.nodeAliveRootOid).toBe(closeResult.edgeAliveRootOid);

      const reopened = await StateSession.open({
        nodeAliveRootOid: closeResult.nodeAliveRootOid,
        edgeAliveRootOid: closeResult.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry: GEOMETRY,
        pageCache,
      });

      expect(await reopened.nodeContains("shared:1")).toBe(true);
      const afterNodeRead = store.readCounts();
      expect(await reopened.edgeContains("shared:1")).toBe(true);
      expect(store.readCounts()).toEqual(afterNodeRead);
    });
  });

  describe("edge cases", () => {
    it("keeps nodeAlive and edgeAlive independent inside one session", async () => {
      const { session } = await openSession();

      await session.addNode("node:only", new Dot("alice", 1));
      await session.addEdge("edge:only", new Dot("alice", 2));

      expect(await session.nodeContains("node:only")).toBe(true);
      expect(await session.edgeContains("edge:only")).toBe(true);
      expect(await session.nodeContains("edge:only")).toBe(false);
      expect(await session.edgeContains("node:only")).toBe(false);
    });

    it("compacts both engines through the session surface", async () => {
      const { session, store, pageCache } = await openSession();
      const nodeDot = new Dot("alice", 1);
      const edgeDot = new Dot("alice", 2);

      await session.addNode("node:1", nodeDot);
      await session.addEdge("edge:1", edgeDot);
      await session.removeNodes(new Set([Dot.encode(nodeDot)]));
      await session.removeEdges(new Set([Dot.encode(edgeDot)]));
      await session.compact(VersionVector.from({ alice: 2 }));

      const closeResult = await session.close();
      const reopened = await StateSession.open({
        nodeAliveRootOid: closeResult.nodeAliveRootOid,
        edgeAliveRootOid: closeResult.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry: GEOMETRY,
        pageCache,
      });

      expect(await reopened.nodeContains("node:1")).toBe(false);
      expect(await reopened.edgeContains("edge:1")).toBe(false);
      expect(await scanAll(reopened.scanNodes())).toEqual([]);
      expect(await scanAll(reopened.scanEdges())).toEqual([]);
    });

    it("surfaces tombstoned element state without pretending removed entries vanished", async () => {
      const { session } = await openSession();
      const nodeDot = new Dot("alice", 1);
      const edgeDot = new Dot("alice", 2);

      await session.addNode("node:1", nodeDot);
      await session.addEdge("edge:1", edgeDot);
      await session.removeNodes(new Set([Dot.encode(nodeDot)]));
      await session.removeEdges(new Set([Dot.encode(edgeDot)]));

      expect(await session.nodeContains("node:1")).toBe(false);
      expect(await session.edgeContains("edge:1")).toBe(false);

      const nodeState = await session.nodeElementState("node:1");
      const edgeState = await session.edgeElementState("edge:1");

      expect(nodeState?.element).toBe("node:1");
      expect([...nodeState?.dots ?? []]).toEqual([]);
      expect([...nodeState?.tombstonedDots ?? []]).toEqual([Dot.encode(nodeDot)]);
      expect(edgeState?.element).toBe("edge:1");
      expect([...edgeState?.dots ?? []]).toEqual([]);
      expect([...edgeState?.tombstonedDots ?? []]).toEqual([Dot.encode(edgeDot)]);

      expect(await scanElementStates(session.scanNodeElementStates())).toEqual([
        {
          element: "node:1",
          dots: [],
          tombstonedDots: [Dot.encode(nodeDot)],
        },
      ]);
      expect(await scanElementStates(session.scanEdgeElementStates())).toEqual([
        {
          element: "edge:1",
          dots: [],
          tombstonedDots: [Dot.encode(edgeDot)],
        },
      ]);
    });

    it("keeps scan methods as async iterables instead of arrays", async () => {
      const { session } = await openSession();

      await session.addNode("node:1", new Dot("alice", 1));
      await session.addEdge("edge:1", new Dot("alice", 2));

      expect(await scanAll(session.scanNodes())).toEqual(["node:1"]);
      expect(await scanAll(session.scanEdges())).toEqual(["edge:1"]);
    });
  });

  describe("known failure modes", () => {
    it("rejects reads after close", async () => {
      const { session } = await openSession();
      await session.close();

      await expect(session.nodeContains("node:1")).rejects.toBeInstanceOf(
        StateSessionError,
      );
      await expect(session.edgeContains("edge:1")).rejects.toBeInstanceOf(
        StateSessionError,
      );
    });

    it("rejects writes and compaction after close", async () => {
      const { session } = await openSession();
      await session.close();

      await expect(
        session.addNode("node:1", new Dot("alice", 1)),
      ).rejects.toBeInstanceOf(StateSessionError);
      await expect(
        session.addEdge("edge:1", new Dot("alice", 2)),
      ).rejects.toBeInstanceOf(StateSessionError);
      await expect(
        session.compact(VersionVector.from({ alice: 2 })),
      ).rejects.toBeInstanceOf(StateSessionError);
    });

    it("rejects double close", async () => {
      const { session } = await openSession();
      await session.close();
      await expect(session.close()).rejects.toBeInstanceOf(StateSessionError);
    });
  });
});
