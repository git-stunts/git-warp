import { describe, it, expect, vi } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { createGitCasPatchStorage } from '../../../src/ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import type RuntimeStorageCapabilityPort from '../../../src/ports/RuntimeStorageCapabilityPort.ts';

/**
 * Spec tests for OG-014: auto-construction of blob storage.
 *
 * When no explicit `blobStorage` is provided to `openRuntimeHostProduct()`,
 * the core should auto-construct the appropriate adapter:
 * - `CasBlobAdapter` when persistence has plumbing (Git-backed)
 * - `InMemoryBlobStorageAdapter` when persistence lacks plumbing (in-memory)
 *
 * These tests should all FAIL against the current code (red phase).
 */

type MockBlobStorage = {
  store: ReturnType<typeof vi.fn>;
  retrieve: ReturnType<typeof vi.fn>;
  storeStream: ReturnType<typeof vi.fn>;
  retrieveStream: ReturnType<typeof vi.fn>;
};

type MockPersistence = CorePersistence & Partial<RuntimeStorageCapabilityPort> & {
  configGet: ReturnType<typeof vi.fn>;
  configSet: ReturnType<typeof vi.fn>;
};

function makeMockPersistence({ hasPlumbing = false } = {}): MockPersistence {
  const persistence: MockPersistence = {
    commitNode: vi.fn(async () => 'c'.repeat(40)),
    showNode: vi.fn(async () => ''),
    readRef: vi.fn(async () => null),
    listRefs: vi.fn(async () => []),
    updateRef: vi.fn(async () => undefined),
    deleteRef: vi.fn(async () => undefined),
    compareAndSwapRef: vi.fn(async () => undefined),
    logNodes: vi.fn(async () => ''),
    logNodesStream: vi.fn(),
    countNodes: vi.fn(async () => 0),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    readBlob: vi.fn(async () => new Uint8Array()),
    writeBlob: vi.fn(async () => 'a'.repeat(40)),
    readTree: vi.fn(async () => ({})),
    getNodeInfo: vi.fn(async () => ({ message: '', parents: [], sha: 'a'.repeat(40), author: '', date: '' })),
    nodeExists: vi.fn(async () => true),
    getCommitTree: vi.fn(async () => 'b'.repeat(40)),
    readTreeOids: vi.fn(async () => ({})),
    writeTree: vi.fn(async () => 'a'.repeat(40)),
    commitNodeWithTree: vi.fn(async () => 'd'.repeat(40)),
    ping: vi.fn(async () => ({ ok: true, latencyMs: 0 })),
    emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  };
  if (hasPlumbing) {
    persistence.createRuntimeBlobStorage = vi.fn(async () => ({
      store: vi.fn(),
      retrieve: vi.fn(),
      storeStream: vi.fn(),
      retrieveStream: vi.fn(),
    }));
    persistence.defaultPatchWriteStorage = vi.fn(() => createGitCasPatchStorage(false));
  }
  return persistence;
}

describe('WarpCore blob storage auto-construction (OG-014)', () => {
  it('auto-constructs blob storage when none is provided', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: makeMockPersistence(),
      graphName: 'test',
      writerId: 'w1',
    });

    // _blobStorage should not be null — it should be auto-constructed
    expect((graph)._blobStorage).not.toBeNull();
  });

  it('auto-constructs InMemoryBlobStorageAdapter when persistence lacks plumbing', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: makeMockPersistence({ hasPlumbing: false }),
      graphName: 'test',
      writerId: 'w1',
    });

    const bs = (graph as any)._blobStorage;
    expect(bs).not.toBeNull();
    // Should have the streaming methods
    expect(typeof bs!.storeStream).toBe('function');
    expect(typeof bs!.retrieveStream).toBe('function');
  });

  it('preserves explicitly provided blobStorage', async () => {
    const customStorage = {
      store: vi.fn(),
      retrieve: vi.fn(),
      storeStream: vi.fn(),
      retrieveStream: vi.fn(),
    };
    const graph = await openRuntimeHostProduct({
      persistence: makeMockPersistence(),
      graphName: 'test',
      writerId: 'w1',
      blobStorage: (customStorage),
    });

    expect((graph)._blobStorage).toBe(customStorage);
  });

  it('attachContent uses blob storage even when caller did not provide one', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: makeMockPersistence(),
      graphName: 'test',
      writerId: 'w1',
    });

    const patch = await graph.createPatch();
    patch.addNode('n1');

    // This should NOT call persistence.writeBlob — it should use auto-constructed blob storage
    await patch.attachContent('n1', 'hello');

    const persistence = (graph)._persistence;
    expect(persistence.writeBlob).not.toHaveBeenCalled();
  });
});
