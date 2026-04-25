import { describe, expect, it, vi } from "vitest";

import WarpCore from "../../../src/domain/WarpCore.ts";
import SchemaUnsupportedError from "../../../src/domain/errors/SchemaUnsupportedError.ts";
import { createGitCasPatchStorage } from "../../../src/ports/CommitMessageCodecPort.ts";
import type { CorePersistence } from "../../../src/domain/types/WarpPersistence.ts";
import type RuntimeStorageCapabilityPort from "../../../src/ports/RuntimeStorageCapabilityPort.ts";
import { InMemoryTrieStore } from "../../helpers/trieHelpers.ts";

type MockPersistence = CorePersistence & Partial<RuntimeStorageCapabilityPort> & {
  configGet: ReturnType<typeof vi.fn>;
  configSet: ReturnType<typeof vi.fn>;
};

function makeMockPersistence(): MockPersistence {
  return {
    commitNode: vi.fn(async () => "c".repeat(40)),
    showNode: vi.fn(async () => ""),
    readRef: vi.fn(async () => null),
    listRefs: vi.fn(async () => []),
    updateRef: vi.fn(async () => undefined),
    deleteRef: vi.fn(async () => undefined),
    compareAndSwapRef: vi.fn(async () => undefined),
    logNodes: vi.fn(async () => ""),
    logNodesStream: vi.fn(),
    countNodes: vi.fn(async () => 0),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    readBlob: vi.fn(async () => new Uint8Array()),
    writeBlob: vi.fn(async () => "a".repeat(40)),
    readTree: vi.fn(async () => ({})),
    getNodeInfo: vi.fn(async () => ({
      message: "",
      parents: [],
      sha: "a".repeat(40),
      author: "",
      date: "",
    })),
    nodeExists: vi.fn(async () => true),
    getCommitTree: vi.fn(async () => "b".repeat(40)),
    readTreeOids: vi.fn(async () => ({})),
    writeTree: vi.fn(async () => "a".repeat(40)),
    commitNodeWithTree: vi.fn(async () => "d".repeat(40)),
    ping: vi.fn(async () => ({ ok: true, latencyMs: 0 })),
    emptyTree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    createRuntimeBlobStorage: vi.fn(async () => ({
      store: vi.fn(),
      retrieve: vi.fn(),
      storeStream: vi.fn(),
      retrieveStream: vi.fn(),
    })),
    createRuntimeTrieStore: vi.fn(async () => new InMemoryTrieStore()),
    defaultPatchWriteStorage: vi.fn(() => createGitCasPatchStorage(false)),
  };
}

describe("WarpCore state-session auto-construction", () => {
  it("provisions a session-backed materialize controller when core trie storage is available", async () => {
    const persistence = makeMockPersistence();
    const graph = await WarpCore.open({
      persistence,
      graphName: "test",
      writerId: "w1",
    });

    await expect(graph.materializeAt("a".repeat(40))).rejects.toBeInstanceOf(
      SchemaUnsupportedError,
    );
    expect(persistence.createRuntimeTrieStore).toHaveBeenCalledTimes(1);
  });
});
