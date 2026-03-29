import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.js';

describe('WarpRuntime writer API', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
    };

    graph = await WarpRuntime.open({
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
