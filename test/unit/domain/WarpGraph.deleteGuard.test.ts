import { describe, it, expect } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

describe('WarpCore onDeleteWithData option', () => {
  it('defaults to warn when not specified', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect(graph.onDeleteWithData).toBe('warn');
  });

  it('accepts reject', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'reject',
    });

    expect(graph.onDeleteWithData).toBe('reject');
  });

  it('accepts cascade', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'cascade',
    });

    expect(graph.onDeleteWithData).toBe('cascade');
  });

  it('accepts warn explicitly', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'warn',
    });

    expect(graph.onDeleteWithData).toBe('warn');
  });

  it('throws on invalid value', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        onDeleteWithData: ('invalid' as any),
      }),
    ).rejects.toThrow('onDeleteWithData must be one of: reject, cascade, warn');
  });

  it('getter returns the configured value', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      onDeleteWithData: 'cascade',
    });

    expect(graph.onDeleteWithData).toBe('cascade');
  });
});
