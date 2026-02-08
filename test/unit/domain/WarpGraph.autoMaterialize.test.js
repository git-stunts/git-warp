import { describe, it, expect, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph autoMaterialize option (AP/LAZY/1)', () => {
  it('stores flag when opened with autoMaterialize: true', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: true,
    });

    expect(graph._autoMaterialize).toBe(true);
  });

  it('stores flag when opened with autoMaterialize: false', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });

    expect(graph._autoMaterialize).toBe(false);
  });

  it('defaults to false when autoMaterialize is not provided', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect(graph._autoMaterialize).toBe(false);
  });

  it('defaults to false when autoMaterialize is explicitly undefined', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: undefined,
    });

    expect(graph._autoMaterialize).toBe(false);
  });

  it('rejects autoMaterialize: "yes" (string)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: 'yes',
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: 1 (number)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: 1,
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: null', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: null,
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });
});
