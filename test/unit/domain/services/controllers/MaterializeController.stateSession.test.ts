import { describe, expect, it, vi } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import PatchEntry from "../../../../../src/domain/artifacts/PatchEntry.ts";
import MaterializeController from "../../../../../src/domain/services/controllers/MaterializeController.ts";
import { reduceSessionBackedState } from "../../../../../src/domain/services/controllers/MaterializeSessionBridge.ts";
import NodeAdd from "../../../../../src/domain/types/ops/NodeAdd.ts";
import EdgeAdd from "../../../../../src/domain/types/ops/EdgeAdd.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { DEFAULT_COMMIT_MESSAGE_CODEC } from "../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts";
import SchemaUnsupportedError from "../../../../../src/domain/errors/SchemaUnsupportedError.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";
import { createEmptyState } from "../../../../../src/domain/services/JoinReducer.ts";
import Patch from "../../../../../src/domain/types/Patch.ts";
import type { CheckpointData, PatchWithSha } from "../../../../../src/domain/capabilities/PatchCollector.ts";
import InMemoryCheckpointStore from "../../../../helpers/InMemoryCheckpointStore.ts";
import InMemoryMaterializationStore from "../../../../helpers/InMemoryMaterializationStore.ts";

const GEOMETRY = TrieGeometry.default16way();

type Coordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

type PatchRecord = PatchWithSha;

function nodeAddPatchRecord(args: {
  readonly writer: string;
  readonly lamport: number;
  readonly sha: string;
  readonly node: string;
}): PatchRecord {
  return {
    patch: new Patch({
      writer: args.writer,
      lamport: args.lamport,
      context: {},
      ops: [new NodeAdd(args.node, Dot.create(args.writer, args.lamport))],
      reads: [],
      writes: [args.node],
    }),
    sha: args.sha,
  };
}

function edgeAddPatchRecord(args: {
  readonly writer: string;
  readonly lamport: number;
  readonly sha: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
}): PatchRecord {
  return {
    patch: new Patch({
      writer: args.writer,
      lamport: args.lamport,
      context: {},
      ops: [
        new EdgeAdd({
          from: args.from,
          to: args.to,
          label: args.label,
          dot: Dot.create(args.writer, args.lamport),
        }),
      ],
      reads: [],
      writes: [`${args.from}\0${args.to}\0${args.label}`],
    }),
    sha: args.sha,
  };
}

function snapshotRecord(coordinate: Coordinate) {
  const state = createEmptyState();
  state.nodeAlive.add("node:base", Dot.create("seed", 1));
  const removedNodeDot = Dot.create("seed", 2);
  state.nodeAlive.add("node:removed", removedNodeDot);
  state.nodeAlive.remove(new Set([Dot.encode(removedNodeDot)]));
  const removedEdgeDot = Dot.create("seed", 3);
  state.edgeAlive.add("node:base\0node:removed\0related", removedEdgeDot);
  state.edgeAlive.remove(new Set([Dot.encode(removedEdgeDot)]));
  return {
    snapshotId: "snapshot-base",
    coordinate,
    state,
    retention: "evictable" as const,
    provenancePosture: "full" as const,
    stateHash: "snapshot-base-hash",
    payloadRef: "snapshot-base-payload",
    createdAt: "snapshot-base-created-at",
  };
}

async function* streamFromPromise<T>(items: Promise<T[]>): AsyncIterable<T> {
  for (const item of await items) {
    yield item;
  }
}

function createControllerFixtures() {
  const stateCache = {
    getExact: vi.fn(),
    getBestCompatiblePredecessor: vi.fn(),
    put: vi.fn(),
    pin: vi.fn(),
    publishCheckpointHead: vi.fn(),
    resolveCheckpointHead: vi.fn(),
    pruneEvictable: vi.fn(),
  };
  const patches = {
    discoverWriters: vi.fn().mockResolvedValue([]),
    loadWriterPatches: vi.fn<(_writerId: string) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    collectForFrontier:
      vi.fn<(_frontier: Map<string, string>, _ceiling: number | null) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    collectForFrontierSinceCoordinate:
      vi.fn<(_frontier: Map<string, string>, _ceiling: number | null, _coordinate: Coordinate) => Promise<PatchWithSha[]>>()
        .mockResolvedValue([]),
    loadCheckpoint: vi.fn().mockResolvedValue(null),
    loadPatchesSince: vi.fn<(_checkpoint: CheckpointData) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    loadPatchChain: vi.fn<(_toSha: string, _fromSha?: string | null) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    getFrontier: vi.fn().mockResolvedValue(new Map([["writer-1", "tip-1"]])),
    streamWriterPatches: vi.fn((writerId: string) => streamFromPromise(patches.loadWriterPatches(writerId))),
    streamForFrontier: vi.fn((frontier: Map<string, string>, ceiling: number | null) =>
      streamFromPromise(patches.collectForFrontier(frontier, ceiling))),
    streamForFrontierSinceCoordinate: vi.fn((
      frontier: Map<string, string>,
      ceiling: number | null,
      coordinate: Coordinate,
    ) => streamFromPromise(patches.collectForFrontierSinceCoordinate(frontier, ceiling, coordinate))),
    streamPatchesSince: vi.fn((checkpoint: Parameters<typeof patches.loadPatchesSince>[0]) =>
      streamFromPromise(patches.loadPatchesSince(checkpoint))),
  };
  const store = new InMemoryTrieStore();
  const pageCache = new PageCache({ maxResident: 32 });
  const materializations = new InMemoryMaterializationStore();
  const openStateSession = vi.fn(
    async (roots: {
      readonly nodeAliveRootOid: string | null;
      readonly edgeAliveRootOid: string | null;
    }): Promise<StateSession> =>
      await StateSession.open({
        nodeAliveRootOid: roots.nodeAliveRootOid,
        edgeAliveRootOid: roots.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry: GEOMETRY,
        pageCache,
      }),
  );

  const deps = {
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    },
    codec: cborCodec,
    crypto: {
      hash: vi.fn().mockResolvedValue("state-hash-1"),
      hmac: vi.fn().mockResolvedValue(new Uint8Array([1])),
      timingSafeEqual: vi.fn().mockReturnValue(false),
    },
    persistence: {
      readRef: vi.fn().mockResolvedValue(null),
      readTreeOids: vi.fn().mockResolvedValue({}),
      showNode: vi.fn().mockResolvedValue(""),
      readBlob: vi.fn().mockResolvedValue(new Uint8Array([1])),
    },
    checkpointStore: new InMemoryCheckpointStore(),
    materializations,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    getStateCache: () => stateCache,
    patches,
    graphCloner: { openReadOnly: vi.fn() },
    graphName: "test-graph",
    openStateSession,
  };

  return {
    controller: new MaterializeController(deps),
    patches,
    stateCache,
    openStateSession,
    materializations,
    deps,
  };
}

describe("MaterializeController — state session integration", () => {
  it("does not flush partial trie roots when session reduction fails", async () => {
    const { openStateSession } = createControllerFixtures();
    const close = vi.spyOn(StateSession.prototype, "close");
    const failure = new Error("patch source failed");
    const partial = new PatchEntry(nodeAddPatchRecord({
      writer: "writer-1",
      lamport: 1,
      sha: "deadbeef",
      node: "node:partial",
    }));
    const patches = {
      async *[Symbol.asyncIterator]() {
        yield partial;
        throw failure;
      },
    };

    try {
      await expect(reduceSessionBackedState({
        openStateSession,
        patches,
        receipts: false,
        wantDiff: false,
      })).rejects.toBe(failure);
      expect(close).not.toHaveBeenCalled();
    } finally {
      close.mockRestore();
    }
  });

  it("replays live materialization through StateSession and returns an explicit WarpState projection bridge", async () => {
    const { controller, patches, openStateSession, materializations } = createControllerFixtures();
    patches.collectForFrontier.mockResolvedValue([
      nodeAddPatchRecord({
        writer: "writer-1",
        lamport: 1,
        sha: "a1b2",
        node: "node:session",
      }),
      nodeAddPatchRecord({
        writer: "writer-1",
        lamport: 2,
        sha: "b2c3",
        node: "node:peer",
      }),
      edgeAddPatchRecord({
        writer: "writer-1",
        lamport: 3,
        sha: "c3d4",
        from: "node:session",
        to: "node:peer",
        label: "follows",
      }),
    ]);

    const result = await controller.materialize({});

    expect(openStateSession).toHaveBeenCalledWith({
      nodeAliveRootOid: null,
      edgeAliveRootOid: null,
    });
    expect(result.state.nodeAlive.contains("node:session")).toBe(true);
    expect(result.patchCount).toBe(3);
    expect(result.adjacency.outgoing.get("node:session")).toEqual([
      { neighborId: "node:peer", label: "follows" },
    ]);
    expect(materializations.retainedRequests).toHaveLength(1);
    expect(materializations.retainedRequests[0]?.roots.nodeAlive.status).toBe("retained");
    expect(materializations.retainedRequests[0]?.roots.edgeAlive.status).toBe("retained");
    expect(materializations.retainedRequests[0]?.roots.properties.status).toBe("unavailable");
    expect(result.materialization?.roots.nodeAlive.status).toBe("retained");
  });

  it("reopens exact retained roots with zero covered patch replay after controller restart", async () => {
    const fixtures = createControllerFixtures();
    fixtures.patches.collectForFrontier.mockResolvedValue([
      nodeAddPatchRecord({
        writer: "writer-1",
        lamport: 1,
        sha: "a1b2",
        node: "node:retained",
      }),
    ]);

    const cold = await fixtures.controller.materialize();
    const published = fixtures.stateCache.put.mock.calls[0]?.[0];
    if (published === undefined) {
      throw new Error("Cold materialization did not publish its state snapshot");
    }
    fixtures.stateCache.getExact.mockResolvedValue(published);
    fixtures.patches.collectForFrontier.mockClear();
    fixtures.stateCache.put.mockClear();
    fixtures.openStateSession.mockClear();

    const warm = await fixtures.controller.materialize();
    const reopened = await new MaterializeController(fixtures.deps).materialize();

    const retained = fixtures.materializations.retainedRequests[0];
    expect(retained).toBeDefined();
    expect(fixtures.materializations.retainedRequests).toHaveLength(1);
    expect(fixtures.materializations.exactLookups).toHaveLength(2);
    expect(fixtures.patches.collectForFrontier).not.toHaveBeenCalled();
    expect(fixtures.stateCache.put).not.toHaveBeenCalled();
    expect(fixtures.openStateSession).toHaveBeenCalledTimes(2);
    expect(fixtures.openStateSession).toHaveBeenNthCalledWith(1, {
      nodeAliveRootOid: retained?.roots.nodeAlive.handle?.toString(),
      edgeAliveRootOid: retained?.roots.edgeAlive.handle?.toString() ?? null,
    });
    expect(warm.patchCount).toBe(0);
    expect(reopened.patchCount).toBe(0);
    expect(warm.state.nodeAlive.contains("node:retained")).toBe(true);
    expect(reopened.state.nodeAlive.contains("node:retained")).toBe(true);
    expect(warm.materialization?.bundle.equals(cold.materialization?.bundle)).toBe(true);
    expect(reopened.materialization?.bundle.equals(cold.materialization?.bundle)).toBe(true);
  });

  it("hydrates a predecessor snapshot into StateSession before replaying the suffix", async () => {
    const { controller, stateCache, patches, openStateSession } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([["writer-1", "tip-2"]]),
      ceiling: 2,
    };
    const predecessor = snapshotRecord({
      frontier: new Map([["writer-1", "tip-1"]]),
      ceiling: 1,
    });

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(predecessor);
    patches.collectForFrontierSinceCoordinate.mockResolvedValue([
      nodeAddPatchRecord({
        writer: "writer-1",
        lamport: 2,
        sha: "b2c3",
        node: "node:suffix",
      }),
    ]);

    const result = await controller.materializeCoordinate(target);

    expect(openStateSession).toHaveBeenCalledWith({
      nodeAliveRootOid: null,
      edgeAliveRootOid: null,
    });
    expect(stateCache.put).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: target,
        retention: "evictable",
        provenancePosture: "degraded",
      }),
    );
    expect(result.state.nodeAlive.contains("node:base")).toBe(true);
    expect(result.state.nodeAlive.contains("node:suffix")).toBe(true);
    expect(result.state.nodeAlive.contains("node:removed")).toBe(false);
    expect(result.state.nodeAlive.isTombstoned(Dot.encode(Dot.create("seed", 2)))).toBe(true);
    expect(result.state.edgeAlive.contains("node:base\0node:removed\0related")).toBe(false);
    expect(result.state.edgeAlive.isTombstoned(Dot.encode(Dot.create("seed", 3)))).toBe(true);
  });

  it("fails fast on materializeAt when the controller is on the session-backed runtime line", async () => {
    const { controller } = createControllerFixtures();

    await expect(controller.materializeAt("a".repeat(40))).rejects.toBeInstanceOf(
      SchemaUnsupportedError,
    );
  });
});
