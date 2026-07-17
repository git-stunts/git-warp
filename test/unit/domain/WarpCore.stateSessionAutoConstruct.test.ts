import { describe, expect, it, vi } from "vitest";

import WarpCore from "../../../src/domain/WarpCore.ts";
import SchemaUnsupportedError from "../../../src/domain/errors/SchemaUnsupportedError.ts";
import { resolveRuntimeHostConstructionOptions } from "../../../src/domain/warp/RuntimeHostBoot.ts";
import MemoryRuntimeStorageAdapter from "../../../test/helpers/MemoryRuntimeStorageAdapter.ts";
import InMemoryGraphAdapter from "../../../test/helpers/InMemoryGraphAdapter.ts";
import type RuntimeStorageProviderPort from "../../../src/ports/RuntimeStorageProviderPort.ts";
import type { RuntimeStorageRequest } from "../../../src/ports/RuntimeStorageProviderPort.ts";
import WarpStateCachePort, {
  type WarpStateCoordinate,
  type WarpStateSnapshotRecord,
} from "../../../src/ports/WarpStateCachePort.ts";
import { InMemoryTrieStore } from "../../helpers/trieHelpers.ts";

class TestStateCache extends WarpStateCachePort {
  getExact(_coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  getBestCompatiblePredecessor(
    _coordinate: WarpStateCoordinate,
  ): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  put(snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    return Promise.resolve(snapshot);
  }

  pin(_snapshotId: string): Promise<WarpStateSnapshotRecord> {
    return Promise.reject(new Error("unused"));
  }

  publishCheckpointHead(_graphName: string, _snapshotId: string): Promise<void> {
    return Promise.resolve();
  }

  resolveCheckpointHead(_graphName: string): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  pruneEvictable(): Promise<void> {
    return Promise.resolve();
  }
}

function makeMockPersistence(): InMemoryGraphAdapter {
  return new InMemoryGraphAdapter();
}

describe("WarpCore state-session auto-construction", () => {
  it("provisions a session-backed materialize controller when core trie storage is available", async () => {
    const persistence = makeMockPersistence();
    const memoryStorage = new MemoryRuntimeStorageAdapter({ history: persistence });
    const trie = new InMemoryTrieStore();
    const createRuntimeStorageServices = vi.fn(async (request: RuntimeStorageRequest) => Object.freeze({
      ...await memoryStorage.createRuntimeStorageServices(request),
      trie,
    }));
    const runtimeStorage: RuntimeStorageProviderPort = { createRuntimeStorageServices };
    const graph = await WarpCore.open({
      persistence,
      runtimeStorage,
      graphName: "test",
      writerId: "w1",
    });

    await expect(graph.materializeAt("a".repeat(40))).rejects.toBeInstanceOf(
      SchemaUnsupportedError,
    );
    expect(createRuntimeStorageServices).toHaveBeenCalledTimes(1);
  });

  it("keeps explicit state cache and session ports ahead of storage defaults", async () => {
    const persistence = makeMockPersistence();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history: persistence });
    const stateCache = new TestStateCache();
    const openStateSession = vi.fn(async () => {
      throw new Error("unused explicit session");
    });

    const resolved = await resolveRuntimeHostConstructionOptions({
      persistence,
      runtimeStorage,
      graphName: "test",
      writerId: "w1",
      stateCache,
      openStateSession,
    });

    expect(resolved.options.stateCache).toBe(stateCache);
    expect(resolved.options.openStateSession).toBe(openStateSession);
    expect(resolved.options.materializationRead).toBeUndefined();
  });
});
