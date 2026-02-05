import { describe, it, expect, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';

function createMockPersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    listRefs: vi.fn().mockResolvedValue([]),
    updateRef: vi.fn().mockResolvedValue(),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(),
  };
}

describe('WarpGraph onDeleteWithData option', () => {
  it('defaults to warn when not specified', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect(graph.onDeleteWithData).toBe('warn');
  });

  it('accepts reject', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'reject',
    });

    expect(graph.onDeleteWithData).toBe('reject');
  });

  it('accepts cascade', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'cascade',
    });

    expect(graph.onDeleteWithData).toBe('cascade');
  });

  it('accepts warn explicitly', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'warn',
    });

    expect(graph.onDeleteWithData).toBe('warn');
  });

  it('throws on invalid value', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        onDeleteWithData: 'invalid',
      }),
    ).rejects.toThrow('onDeleteWithData must be one of: reject, cascade, warn');
  });

  it('getter returns the configured value', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'cascade',
    });

    expect(graph.onDeleteWithData).toBe('cascade');
  });
});
