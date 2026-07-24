import { describe, expect, it, vi } from 'vitest';

import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../../../../src/domain/materialization/MaterializationHandle.ts';
import MaterializationRoot from '../../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../../src/domain/materialization/MaterializationRoots.ts';
import { materializedResolution } from '../../../../../src/domain/services/controllers/MaterializedLiveResolution.ts';
import type { MaterializeResult } from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import BundleHandle from '../../../../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../../../../src/domain/storage/StorageRetentionWitness.ts';
import type { MaterializationAcquisition } from '../../../../../src/ports/MaterializationStorePort.ts';

describe('materializedResolution', () => {
  it('returns and releases an acquisition that matches the published result', async () => {
    const handle = materializationHandle('same');
    const release = vi.fn().mockResolvedValue(undefined);
    const resolution = materializedResolution(
      materializeResult(handle),
      acquisition(handle, release),
    );

    expect(resolution.materialization).toBe(handle);
    expect(resolution.source).toBe('materialized');
    expect(resolution.replayedPatchCount).toBe(3);
    await resolution.release();
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects a non-empty result without a retained handle', () => {
    expect(() => materializedResolution(
      materializeResult(undefined),
      acquisition(materializationHandle('acquired'), vi.fn()),
    )).toThrowError(/did not produce a retained handle/u);
  });

  it('rejects an acquisition whose retained identity changed', () => {
    expect(() => materializedResolution(
      materializeResult(materializationHandle('expected')),
      acquisition(materializationHandle('changed'), vi.fn()),
    )).toThrowError(/changed before it could be acquired/u);
  });
});

function materializeResult(
  materialization: MaterializationHandle | undefined,
): MaterializeResult {
  return {
    materialization,
    patchCount: 3,
  } as MaterializeResult;
}

function acquisition(
  materialization: MaterializationHandle,
  release: () => Promise<void>,
): MaterializationAcquisition {
  return Object.freeze({
    materialization,
    acquiredAt: '1970-01-01T00:00:00.000Z',
    release,
  });
}

function materializationHandle(suffix: string): MaterializationHandle {
  const bundle = new BundleHandle(`materialization:${suffix}`);
  return new MaterializationHandle({
    laneName: 'events',
    bundle,
    coordinate: new MaterializationCoordinate({
      frontier: new Map([['writer', 'patch']]),
      ceiling: null,
    }),
    roots: partialRoots(),
    stateHash: null,
    retention: new StorageRetentionWitness({
      handle: bundle,
      policy: 'evictable',
      reachability: 'anchored',
      root: new StorageRetentionRoot({
        kind: 'cache-set',
        namespace: 'git-warp/materializations',
        locator: 'refs/cas/caches/git-warp/materializations',
        generation: `generation:${suffix}`,
        path: 'root',
      }),
      observedAt: '1970-01-01T00:00:00.000Z',
    }),
  });
}

function partialRoots(): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: MaterializationRoot.empty(),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: MaterializationRoot.empty(),
    properties: MaterializationRoot.unavailable(),
    provenanceSupport: MaterializationRoot.unavailable(),
    replayBasis: MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}
