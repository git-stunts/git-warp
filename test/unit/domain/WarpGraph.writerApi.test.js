import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';

describe('WarpGraph writer API', () => {
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

    graph = await WarpGraph.open({
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

  // ============================================================================
  // createWriter() — deprecated, still functional
  // ============================================================================

  it('createWriter() logs deprecation warning', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await graph.createWriter();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[warp] createWriter() is deprecated. Use writer() or writer(id) instead.',
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('createWriter() logs via logger when present', async () => {
    /** @type {any} */
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const graphWithLogger = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger: mockLogger,
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await graphWithLogger.createWriter();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[warp] createWriter() is deprecated. Use writer() or writer(id) instead.',
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('createWriter() returns a Writer with a generated unique ID', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const w1 = await graph.createWriter();
      const w2 = await graph.createWriter();

      // Both should have canonical writer IDs (w_ prefix, 28 chars)
      expect(w1.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(w2.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);

      // Each call generates a distinct ID
      expect(w1.writerId).not.toBe(w2.writerId);
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});
