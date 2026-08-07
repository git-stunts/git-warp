import { describe, it, expect } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';
import { DEFAULT_CHECKPOINT_POLICY } from '../../../src/domain/warp/RuntimeHostBoot.ts';

describe('WarpCore checkpointPolicy (AP/CKPT/1)', () => {
  it('stores checkpointPolicy when opened with { every: 500 }', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: { every: 500 },
    });

    expect((graph)._checkpointPolicy).toEqual({ every: 500 });
  });

  it('accepts minimum valid value { every: 1 }', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: { every: 1 },
    });

    expect((graph)._checkpointPolicy).toEqual({ every: 1 });
  });

  it('applies the default checkpoint policy when none is provided', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    // Opting in was the old contract, and it made unbounded replay growth the
    // default: a caller that never supplied a policy accumulated every patch
    // since its last explicit checkpoint forever, with reads paying for it.
    expect((graph)._checkpointPolicy).toEqual(DEFAULT_CHECKPOINT_POLICY);
    expect(DEFAULT_CHECKPOINT_POLICY.every).toBeGreaterThan(0);
  });

  it('rejects every: 0', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 0 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: -1', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: -1 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: "foo" (non-integer string)', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: {
          // @ts-expect-error exercising runtime validation for JavaScript callers
          every: 'foo',
        },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: 1.5 (non-integer float)', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 1.5 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects checkpointPolicy that is not an object', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        // @ts-expect-error exercising runtime validation for JavaScript callers
        checkpointPolicy: 'auto',
      })
    ).rejects.toThrow('checkpointPolicy must be an object with { every: number }');
  });

  it('treats checkpointPolicy: (null) as no policy', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: null,
    });

    expect((graph)._checkpointPolicy).toBeNull();
  });

  it('distinguishes an explicit null opt-out from an omitted policy', async () => {
    const base = {
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    };
    const optedOut = await openRuntimeHostProduct({
      ...base,
      persistence: createMockPersistence(),
      checkpointPolicy: null,
    });
    const defaulted = await openRuntimeHostProduct({
      ...base,
      persistence: createMockPersistence(),
    });

    expect((optedOut)._checkpointPolicy).toBeNull();
    expect((defaulted)._checkpointPolicy).toEqual(DEFAULT_CHECKPOINT_POLICY);
  });
});
