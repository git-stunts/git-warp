import { describe, expect, it, vi } from "vitest";

import PatchCollector, {
  type CheckpointData,
  type PatchWithSha,
} from "../../../../../src/domain/capabilities/PatchCollector.ts";
import PatchEntry from "../../../../../src/domain/artifacts/PatchEntry.ts";
import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import MaterializationCoordinate from "../../../../../src/domain/materialization/MaterializationCoordinate.ts";
import MaterializationRoot from "../../../../../src/domain/materialization/MaterializationRoot.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import MaterializeController from "../../../../../src/domain/services/controllers/MaterializeController.ts";
import { reduceSessionBackedState } from "../../../../../src/domain/services/controllers/MaterializeSessionBridge.ts";
import BundleHandle from "../../../../../src/domain/storage/BundleHandle.ts";
import Patch from "../../../../../src/domain/types/Patch.ts";
import NodeAdd from "../../../../../src/domain/types/ops/NodeAdd.ts";
import NodePropSet from "../../../../../src/domain/types/ops/NodePropSet.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import type MaterializationWorkspacePort from "../../../../../src/ports/MaterializationWorkspacePort.ts";
import InMemoryCheckpointStore from "../../../../helpers/InMemoryCheckpointStore.ts";
import InMemoryMaterializationStore, {
  InMemoryMaterializationWorkspace,
} from "../../../../helpers/InMemoryMaterializationStore.ts";
import MockIndexStorage from "../../../../helpers/MockIndexStorage.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();
const PATCH_SHA = "a1b2";

class PropertyPatchCollector extends PatchCollector {
  readonly #entry: PatchWithSha;

  constructor() {
    super();
    this.#entry = propertyPatch();
  }

  override discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  override loadWriterPatches(_writerId: string): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadCheckpoint(): Promise<CheckpointData | null> {
    return Promise.resolve(null);
  }

  override loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadPatchChain(_toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]> {
    return Promise.resolve([this.#entry]);
  }

  override getFrontier(): Promise<Map<string, string>> {
    return Promise.resolve(new Map([["writer-1", PATCH_SHA]]));
  }
}

describe("MaterializeController property-root retention", () => {
  it("releases the workspace without promotion when the property-root checkpoint fails", async () => {
    const materializations = new InMemoryMaterializationStore();
    const controller = new MaterializeController({
      logger: testLogger(),
      codec: cborCodec,
      crypto: testCrypto(),
      persistence: testPersistence(),
      checkpointStore: new InMemoryCheckpointStore(),
      materializations,
      getStateCache: () => null,
      patches: new PropertyPatchCollector(),
      graphCloner: { openReadOnly: vi.fn() },
      graphName: "test-graph",
      openStateSession: createStateSessionOpener(),
      propertyStore: new MockIndexStorage(),
    });
    const failure = new Error("property-root checkpoint failed");
    const originalCheckpoint = InMemoryMaterializationWorkspace.prototype.checkpoint;
    const checkpoint = vi.spyOn(InMemoryMaterializationWorkspace.prototype, "checkpoint")
      .mockImplementation(function (
        this: InMemoryMaterializationWorkspace,
        roots,
      ) {
        if (roots.propertiesRoot !== undefined) {
          return Promise.reject(failure);
        }
        return originalCheckpoint.call(this, roots);
      });
    const promote = vi.spyOn(InMemoryMaterializationWorkspace.prototype, "promote");

    try {
      await expect(controller.materialize()).rejects.toBe(failure);

      expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({
        propertiesRoot: expect.any(String),
      }));
      expect(promote).not.toHaveBeenCalled();
      expect(materializations.retainedRequests).toHaveLength(0);
      expect(materializations.workspaces[0]?.released).toBe(true);
    } finally {
      promote.mockRestore();
      checkpoint.mockRestore();
    }
  });

  it("rebuilds a supplied property root when the reduction observes a patch", async () => {
    const materializations = new InMemoryMaterializationStore();
    const propertyStore = new MockIndexStorage();
    const stale = MaterializationRoot.retained(new BundleHandle("test:stale-properties"));

    const reduced = await reduceSessionBackedState({
      openStateSession: createStateSessionOpener(),
      materializations,
      propertyStore,
      propertyRoot: stale,
      coordinate: new MaterializationCoordinate({
        frontier: new Map([["writer-1", PATCH_SHA]]),
        ceiling: null,
      }),
      patches: [new PatchEntry(propertyPatch())],
      receipts: false,
      wantDiff: false,
    });

    expect(reduced.roots.properties.status).toBe("retained");
    expect(reduced.roots.properties.equals(stale)).toBe(false);
    expect(propertyStore.writeBlob).toHaveBeenCalledOnce();
    await reduced.workspace.release();
  });
});

function propertyPatch(): PatchWithSha {
  return {
    patch: new Patch({
      writer: "writer-1",
      lamport: 1,
      context: {},
      ops: [
        new NodeAdd("node:retained", Dot.create("writer-1", 1)),
        new NodePropSet("node:retained", "status", "ready"),
      ],
      reads: [],
      writes: ["node:retained"],
    }),
    sha: PATCH_SHA,
  };
}

function createStateSessionOpener() {
  const store = new InMemoryTrieStore();
  const pageCache = new PageCache({ maxResident: 32 });
  return async (
    roots: {
      readonly nodeAliveRootOid: string | null;
      readonly edgeAliveRootOid: string | null;
    },
    options: { readonly workspace: MaterializationWorkspacePort },
  ): Promise<StateSession> => await StateSession.open({
    nodeAliveRootOid: roots.nodeAliveRootOid,
    edgeAliveRootOid: roots.edgeAliveRootOid,
    store,
    codec: cborCodec,
    geometry: GEOMETRY,
    pageCache,
    maxDirtyPages: 1,
    workspace: options.workspace,
  });
}

function testLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function testCrypto() {
  return {
    hash: vi.fn().mockResolvedValue("state-hash-1"),
    hmac: vi.fn().mockResolvedValue(new Uint8Array([1])),
    timingSafeEqual: vi.fn().mockReturnValue(false),
  };
}

function testPersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    readTreeOids: vi.fn().mockResolvedValue({}),
    showNode: vi.fn().mockResolvedValue(""),
    readBlob: vi.fn().mockResolvedValue(new Uint8Array([1])),
  };
}
