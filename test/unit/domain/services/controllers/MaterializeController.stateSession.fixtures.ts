import { vi } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import MaterializeController from "../../../../../src/domain/services/controllers/MaterializeController.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { DEFAULT_COMMIT_MESSAGE_CODEC } from "../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts";
import { createEmptyState } from "../../../../../src/domain/services/JoinReducer.ts";
import type { CheckpointData, PatchWithSha } from "../../../../../src/domain/capabilities/PatchCollector.ts";
import InMemoryCheckpointStore from "../../../../helpers/InMemoryCheckpointStore.ts";
import InMemoryMaterializationStore from "../../../../helpers/InMemoryMaterializationStore.ts";
import type MaterializationWorkspacePort from "../../../../../src/ports/MaterializationWorkspacePort.ts";

import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();

export type Coordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

export function snapshotRecord(coordinate: Coordinate) {
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

export function createControllerFixtures() {
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
    isAncestor: vi.fn().mockResolvedValue(false),
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
  const materializations = new InMemoryMaterializationStore();
  const openStateSession = vi.fn(
    async (roots: {
      readonly nodeAliveRootOid: string | null;
      readonly edgeAliveRootOid: string | null;
    }, options: { readonly workspace: MaterializationWorkspacePort }): Promise<StateSession> =>
      await StateSession.open({
        nodeAliveRootOid: roots.nodeAliveRootOid,
        edgeAliveRootOid: roots.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry: GEOMETRY,
        maxDirtyPages: 1,
        workspace: options.workspace,
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
