import { describe, it, expect } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

describe('WarpCore autoMaterialize option (AP/LAZY/1)', () => {
  it('stores flag when opened with autoMaterialize: true', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: true,
    });

    expect((graph)._autoMaterialize).toBe(true);
  });

  it('stores flag when opened with autoMaterialize: false', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });

    expect((graph)._autoMaterialize).toBe(false);
  });

  it('defaults to true when autoMaterialize is not provided', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect((graph)._autoMaterialize).toBe(true);
  });

  it('defaults to true when autoMaterialize is explicitly undefined', async () => {
    const graph = await openRuntimeHostProduct((({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: undefined,
    }) as any));

    expect((graph)._autoMaterialize).toBe(true);
  });

  it('rejects autoMaterialize: "yes" (string)', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: ('yes' as any),
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: 1 (number)', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: (1 as any),
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: null', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: (null as any),
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });
});
