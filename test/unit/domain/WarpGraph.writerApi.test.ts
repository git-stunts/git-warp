import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';

describe('WarpCore writer API', () => {
    let mockPersistence;
    let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
      readBlob: vi.fn(),
      writeBlob: vi.fn(),
      getNodeInfo: vi.fn(),
      readTreeOids: vi.fn(),
      writeTree: vi.fn(),
    };

    graph = await openRuntimeHostProduct({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  // ============================================================================
  // writer() — two-form API
  // ============================================================================

  it('writer() returns stable identity across multiple calls', async () => {
    // First call generates and persists a new ID via resolveWriterId
    const w1 = await graph.writer();
    // configSet should have been called to persist the generated ID
    const persistedId = mockPersistence.configSet.mock.calls.find(
      (/** @type {any} */ [key]) => key === 'warp.writerId.test',
    )?.[1];
    expect(persistedId).toBeTruthy();

    // Subsequent call reads the persisted ID from config
    mockPersistence.configGet.mockResolvedValue(persistedId);
    const w2 = await graph.writer();

    expect(w1.writerId).toBe(w2.writerId);
  });

  it('writer(id) returns a Writer with the explicit ID', async () => {
    const w = await graph.writer('alice');
    expect(w.writerId).toBe('alice');
  });

});
