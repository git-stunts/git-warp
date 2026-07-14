import { describe, it, expect, vi } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import MemoryRuntimeStorageAdapter from '../../../src/infrastructure/adapters/MemoryRuntimeStorageAdapter.ts';

/**
 * Spec tests for runtime content storage composition.
 *
 * Runtime storage is an explicit sibling of timeline history. The provider
 * owns adapter construction and the domain consumes only semantic services.
 */

type MockPersistence = CorePersistence & {
  configGet: ReturnType<typeof vi.fn>;
  configSet: ReturnType<typeof vi.fn>;
};

function makeMockPersistence(): MockPersistence {
  return {
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
}

describe('WarpCore runtime content storage composition', () => {
  it('obtains content storage from the injected runtime provider', async () => {
    const persistence = makeMockPersistence();
    const graph = await openRuntimeHostProduct({
      persistence,
      runtimeStorage: new MemoryRuntimeStorageAdapter({ history: persistence }),
      graphName: 'test',
      writerId: 'w1',
    });

    expect(graph._blobStorage).not.toBeNull();
  });

  it('provides streaming content methods without persistence capability reflection', async () => {
    const persistence = makeMockPersistence();
    const graph = await openRuntimeHostProduct({
      persistence,
      runtimeStorage: new MemoryRuntimeStorageAdapter({ history: persistence }),
      graphName: 'test',
      writerId: 'w1',
    });

    const content = graph._blobStorage;
    expect(content).not.toBeNull();
    if (content === null) {
      throw new Error('runtime content storage must be configured');
    }
    expect(typeof content.storeStream).toBe('function');
    expect(typeof content.retrieveStream).toBe('function');
  });

  it('preserves explicitly provided blobStorage', async () => {
    const customStorage = {
      store: vi.fn(),
      retrieve: vi.fn(),
      storeStream: vi.fn(),
      retrieveStream: vi.fn(),
    };
    const persistence = makeMockPersistence();
    const graph = await openRuntimeHostProduct({
      persistence,
      runtimeStorage: new MemoryRuntimeStorageAdapter({ history: persistence }),
      graphName: 'test',
      writerId: 'w1',
      blobStorage: customStorage,
    });

    expect(graph._blobStorage).toBe(customStorage);
  });

  it('attachContent uses provider content storage instead of history blobs', async () => {
    const persistence = makeMockPersistence();
    const graph = await openRuntimeHostProduct({
      persistence,
      runtimeStorage: new MemoryRuntimeStorageAdapter({ history: persistence }),
      graphName: 'test',
      writerId: 'w1',
    });

    const patch = await graph.createPatch();
    patch.addNode('n1');

    await patch.attachContent('n1', 'hello');

    expect(graph._persistence.writeBlob).not.toHaveBeenCalled();
  });
});
