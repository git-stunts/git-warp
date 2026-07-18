import { describe, expect, it } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import VersionVector from "../../../../../src/domain/crdt/VersionVector.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import type StateSessionCloseResult from "../../../../../src/domain/orset/session/StateSessionCloseResult.ts";
import StateSessionError from "../../../../../src/domain/errors/StateSessionError.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
} from "../../../../../src/ports/MaterializationWorkspacePort.ts";
import BundleHandle from "../../../../../src/domain/storage/BundleHandle.ts";
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from "../../../../../src/domain/storage/StorageRetentionWitness.ts";
import { workspaceRetentionWitness } from "../../../../helpers/InMemoryMaterializationStore.ts";

const GEOMETRY = TrieGeometry.default16way();

async function openSession(args?: {
  readonly nodeAliveRootOid?: string | null;
  readonly edgeAliveRootOid?: string | null;
  readonly store?: InMemoryTrieStore;
  readonly pageCache?: PageCache;
  readonly geometry?: TrieGeometry;
  readonly workspace?: MaterializationWorkspacePort;
  readonly maxDirtyPages?: number;
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
    ...(args?.workspace === undefined ? {} : { workspace: args.workspace }),
    ...(args?.maxDirtyPages === undefined ? {} : { maxDirtyPages: args.maxDirtyPages }),
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

    it("rejects invalid dirty-page bounds and workspace contracts", async () => {
      await expect(openSession({
        workspace: new RecordingWorkspace(),
        maxDirtyPages: 0,
      })).rejects.toBeInstanceOf(
        StateSessionError,
      );
      await expect(openSession({ maxDirtyPages: 8 })).rejects.toBeInstanceOf(
        StateSessionError,
      );
      await expect(openSession({
        // @ts-expect-error intentional runtime validation test
        workspace: {},
      })).rejects.toBeInstanceOf(StateSessionError);
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

    it("checkpoints and rebases before dirty page residency can grow with the graph", async () => {
      const workspace = new RecordingWorkspace();
      const geometry = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 0,
      });
      const { session, store } = await openSession({
        workspace,
        maxDirtyPages: 8,
        geometry,
      });

      for (let index = 0; index < 100; index += 1) {
        await session.addNode(`node:${String(index).padStart(3, "0")}`, new Dot("alice", index + 1));
        expect(session.dirtyPageCount()).toBeLessThan(8);
      }

      const roots = await session.close();
      expect(workspace.checkpoints.length).toBeGreaterThan(1);
      const reopened = await StateSession.open({
        nodeAliveRootOid: roots.nodeAliveRootOid,
        edgeAliveRootOid: roots.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry,
        pageCache: new PageCache({ maxResident: 32 }),
      });
      expect(await scanAll(reopened.scanNodes())).toHaveLength(100);
    });

    it("retains terminal roots before accepting the flush", async () => {
      const workspace = new RecordingWorkspace();
      const { session } = await openSession({ workspace });

      await session.addNode("node:small", new Dot("alice", 1));
      const roots = await session.close();

      expect(roots.nodeAliveRootOid).not.toBeNull();
      expect(workspace.checkpoints).toEqual([{
        nodeAliveRoot: roots.nodeAliveRootOid,
        edgeAliveRoot: roots.edgeAliveRootOid,
      }]);
    });

    it("keeps dirty state when a workspace cannot witness the staged root", async () => {
      const { session } = await openSession({
        workspace: new NullWitnessWorkspace(),
        maxDirtyPages: 1,
      });

      await expect(
        session.addNode("node:unwitnessed", new Dot("alice", 1)),
      ).rejects.toBeInstanceOf(StateSessionError);
      expect(session.dirtyPageCount()).toBeGreaterThan(0);
    });

    it("accepts a prepared terminal flush only after final retention is witnessed", async () => {
      const workspace = new RecordingWorkspace();
      const { session } = await openSession({ workspace, maxDirtyPages: 1_000 });
      await session.addNode("node:terminal", new Dot("alice", 1));

      const prepared = await session.prepareClose();

      expect(workspace.checkpoints).toEqual([]);
      expect(session.dirtyPageCount()).toBeGreaterThan(0);
      await expect(session.nodeContains("node:terminal"))
        .rejects.toBeInstanceOf(StateSessionError);
      expect(() => prepared.accept(null)).toThrow(StateSessionError);

      prepared.accept(finalRetentionWitness(prepared.roots));
      expect(session.dirtyPageCount()).toBe(0);
      expect(() => prepared.accept(finalRetentionWitness(prepared.roots)))
        .toThrow(StateSessionError);
    });

    it("reopens the session posture when preparing a terminal flush fails", async () => {
      const { session } = await openSession({ store: new FailingWriteStore() });
      await session.addNode("node:retryable", new Dot("alice", 1));

      await expect(session.prepareClose()).rejects.toThrow("terminal flush unavailable");

      expect(session.dirtyPageCount()).toBeGreaterThan(0);
      expect(await session.nodeContains("node:retryable")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("keeps nodeAlive and edgeAlive independent inside one session", async () => {
      const { session } = await openSession();
      const edgeDot = new Dot("alice", 2);

      await session.addNode("node:only", new Dot("alice", 1));
      await session.addEdge("edge:only", edgeDot);

      expect(await session.nodeContains("node:only")).toBe(true);
      expect(await session.edgeContains("edge:only")).toBe(true);
      expect([...await session.edgeDots("edge:only")]).toEqual([Dot.encode(edgeDot)]);
      expect(await session.nodeContains("edge:only")).toBe(false);
      expect(await session.edgeContains("node:only")).toBe(false);
    });

    it("compacts both engines through the session surface", async () => {
      const { session, store, pageCache } = await openSession();
      const nodeDot = new Dot("alice", 1);
      const edgeDot = new Dot("alice", 2);

      await session.addNode("node:1", nodeDot);
      await session.addEdge("edge:1", edgeDot);
      await session.removeNode("node:1", new Set([Dot.encode(nodeDot)]));
      await session.removeEdge("edge:1", new Set([Dot.encode(edgeDot)]));
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

    it("rejects compaction before traversing a bounded session", async () => {
      const workspace = new RecordingWorkspace();
      const { session } = await openSession({ workspace, maxDirtyPages: 2 });
      for (let index = 0; index < 32; index += 1) {
        const dot = new Dot("alice", index + 1);
        await session.addNode(`node:${String(index)}`, dot);
        await session.removeNode(`node:${String(index)}`, new Set([Dot.encode(dot)]));
      }
      const checkpointsBeforeCompaction = workspace.checkpoints.length;
      const dirtyPagesBeforeCompaction = session.dirtyPageCount();

      await expect(
        session.compact(VersionVector.from({ alice: 32 })),
      ).rejects.toMatchObject({
        code: "E_STATE_SESSION_INPUT",
        message: expect.stringContaining("resumable subtree checkpoints"),
      });

      expect(workspace.checkpoints).toHaveLength(checkpointsBeforeCompaction);
      expect(session.dirtyPageCount()).toBe(dirtyPagesBeforeCompaction);
    });

    it("surfaces tombstoned element state without pretending removed entries vanished", async () => {
      const { session } = await openSession();
      const nodeDot = new Dot("alice", 1);
      const edgeDot = new Dot("alice", 2);

      await session.addNode("node:1", nodeDot);
      await session.addEdge("edge:1", edgeDot);
      await session.removeNode("node:1", new Set([Dot.encode(nodeDot)]));
      await session.removeEdge("edge:1", new Set([Dot.encode(edgeDot)]));

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

class FailingWriteStore extends InMemoryTrieStore {
  override writeLeaf(_data: Uint8Array): Promise<never> {
    return Promise.reject(new Error("terminal flush unavailable"));
  }
}

class RecordingWorkspace extends MaterializationWorkspacePort {
  readonly checkpoints: MaterializationWorkspaceRoots[] = [];

  override checkpoint(roots: MaterializationWorkspaceRoots): Promise<StorageRetentionWitness> {
    this.checkpoints.push(roots);
    const handle = new BundleHandle(`test:workspace:${String(this.checkpoints.length)}`);
    return Promise.resolve(workspaceRetentionWitness(handle, {
      generation: `generation-${String(this.checkpoints.length)}`,
    }));
  }

  override stagePage(): Promise<never> {
    return Promise.reject(new Error("StateSession fake store does not stage through the workspace"));
  }

  override stageOrderedBundle(): Promise<never> {
    return Promise.reject(new Error("StateSession fake store does not stage through the workspace"));
  }

  override release(): Promise<void> {
    return Promise.resolve();
  }

  override promote(): Promise<never> {
    return Promise.reject(new Error("StateSession tests do not promote materializations"));
  }
}

class NullWitnessWorkspace extends MaterializationWorkspacePort {
  override stagePage(): Promise<never> {
    return Promise.reject(new Error("StateSession fake store does not stage through the workspace"));
  }

  override stageOrderedBundle(): Promise<never> {
    return Promise.reject(new Error("StateSession fake store does not stage through the workspace"));
  }

  override checkpoint(): Promise<null> {
    return Promise.resolve(null);
  }

  override release(): Promise<void> {
    return Promise.resolve();
  }

  override promote(): Promise<never> {
    return Promise.reject(new Error("StateSession tests do not promote materializations"));
  }
}

function finalRetentionWitness(roots: StateSessionCloseResult): StorageRetentionWitness {
  const handle = new BundleHandle(
    roots.nodeAliveRootOid ?? roots.edgeAliveRootOid ?? "test:empty-materialization",
  );
  return new StorageRetentionWitness({
    handle,
    policy: "evictable",
    reachability: "anchored",
    root: new StorageRetentionRoot({
      kind: "cache-set",
      namespace: "test/materializations",
      locator: "test/materializations",
      generation: "final-generation",
      path: handle.toString(),
    }),
    observedAt: "1970-01-01T00:00:00.000Z",
  });
}
