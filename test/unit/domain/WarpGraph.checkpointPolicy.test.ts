import { describe, it, expect } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

describe('WarpRuntime checkpointPolicy (AP/CKPT/1)', () => {
  it('stores checkpointPolicy when opened with { every: 500 }', async () => {
    const graph = await WarpRuntime.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: { every: 500 },
    });

    expect((graph)._checkpointPolicy).toEqual({ every: 500 });
  });

  it('accepts minimum valid value { every: 1 }', async () => {
    const graph = await WarpRuntime.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: { every: 1 },
    });

    expect((graph)._checkpointPolicy).toEqual({ every: 1 });
  });

  it('defaults _checkpointPolicy to null when not provided', async () => {
    const graph = await WarpRuntime.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect((graph)._checkpointPolicy).toBeNull();
  });

  it('rejects every: 0', async () => {
    await expect(
      WarpRuntime.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 0 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: -1', async () => {
    await expect(
      WarpRuntime.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: -1 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: "foo" (non-integer string)', async () => {
    await expect(
      WarpRuntime.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: ('foo' as any) },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: 1.5 (non-integer float)', async () => {
    await expect(
      WarpRuntime.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 1.5 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects checkpointPolicy that is not an object', async () => {
    await expect(
      WarpRuntime.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: ('auto' as any),
      })
    ).rejects.toThrow('checkpointPolicy must be an object with { every: number }');
  });

  it('treats checkpointPolicy: (null) as no policy', async () => {
    const graph = await WarpRuntime.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: (null as any),
    });

    expect((graph)._checkpointPolicy).toBeNull();
  });
});
