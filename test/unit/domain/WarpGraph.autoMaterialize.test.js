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

    expect(/** @type {any} */ (graph)._autoMaterialize).toBe(true);
  });

  it('stores flag when opened with autoMaterialize: false', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });

    expect(/** @type {any} */ (graph)._autoMaterialize).toBe(false);
  });

  it('defaults to true when autoMaterialize is not provided', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect(/** @type {any} */ (graph)._autoMaterialize).toBe(true);
  });

  it('defaults to true when autoMaterialize is explicitly undefined', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: undefined,
    });

    expect(/** @type {any} */ (graph)._autoMaterialize).toBe(true);
  });

  it('rejects autoMaterialize: "yes" (string)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: /** @type {any} */ ('yes'),
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: 1 (number)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: /** @type {any} */ (1),
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: null', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: /** @type {any} */ (null),
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });
});
