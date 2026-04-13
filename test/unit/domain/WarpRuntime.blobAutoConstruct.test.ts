import { describe, it, expect, vi } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.ts';

/**
 * Spec tests for OG-014: auto-construction of blob storage.
 *
 * When no explicit `blobStorage` is provided to `WarpRuntime.open()`,
 * the runtime should auto-construct the appropriate adapter:
 * - `CasBlobAdapter` when persistence has plumbing (Git-backed)
 * - `InMemoryBlobStorageAdapter` when persistence lacks plumbing (in-memory)
 *
 * These tests should all FAIL against the current code (red phase).
 */

/** @returns {any} */
function makeMockPersistence({ hasPlumbing = false } = {}) {
  const persistence = {
    readRef: vi.fn().mockResolvedValue(null),
    listRefs: vi.fn().mockResolvedValue([]),
    updateRef: vi.fn().mockResolvedValue(undefined),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    readBlob: vi.fn().mockResolvedValue(new Uint8Array()),
    writeBlob: vi.fn().mockResolvedValue('a'.repeat(40)),
    getNodeInfo: vi.fn().mockResolvedValue({ message: '', parents: [] }),
    readTreeOids: vi.fn().mockResolvedValue({}),
    writeTree: vi.fn().mockResolvedValue('a'.repeat(40)),
  };
  if (hasPlumbing) {
    (persistence).plumbing = {};
  }
  return persistence;
}

describe('WarpRuntime blob storage auto-construction (OG-014)', () => {
  it('auto-constructs blob storage when none is provided', async () => {
    const graph = await WarpRuntime.open({
      persistence: makeMockPersistence(),
      graphName: 'test',
      writerId: 'w1',
    });

    // _blobStorage should not be null — it should be auto-constructed
    expect((graph)._blobStorage).not.toBeNull();
  });

  it('auto-constructs InMemoryBlobStorageAdapter when persistence lacks plumbing', async () => {
    const graph = await WarpRuntime.open({
      persistence: makeMockPersistence({ hasPlumbing: false }),
      graphName: 'test',
      writerId: 'w1',
    });

    const bs = (graph)._blobStorage;
    expect(bs).not.toBeNull();
    // Should have the streaming methods
    expect(typeof bs.storeStream).toBe('function');
    expect(typeof bs.retrieveStream).toBe('function');
  });

  it('preserves explicitly provided blobStorage', async () => {
    const customStorage = {
      store: vi.fn(),
      retrieve: vi.fn(),
      storeStream: vi.fn(),
      retrieveStream: vi.fn(),
    };
    const graph = await WarpRuntime.open({
      persistence: makeMockPersistence(),
      graphName: 'test',
      writerId: 'w1',
      blobStorage: (customStorage),
    });

    expect((graph)._blobStorage).toBe(customStorage);
  });

  it('attachContent uses blob storage even when caller did not provide one', async () => {
    const graph = await WarpRuntime.open({
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
