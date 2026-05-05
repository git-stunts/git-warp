import { describe, expect, it } from 'vitest';
import { openWarpGraphRuntime } from '../../../../src/domain/warp/WarpGraphRuntimeBridge.ts';
import { createInMemoryRepo } from '../../../helpers/warpGraphTestUtils.ts';

describe('WarpGraphRuntimeBridge', () => {
  it('returns a graph runtime surface with the structural graph methods', async () => {
    const repo = createInMemoryRepo();

    try {
      const runtimeSurface = await openWarpGraphRuntime({
        persistence: repo.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });

      expect(runtimeSurface.graphName).toBe('shared');
      expect(runtimeSurface.writerId).toBe('alice');
      expect(typeof runtimeSurface.hasNode).toBe('function');
      expect(typeof runtimeSurface.syncWith).toBe('function');
    } finally {
      await repo.cleanup();
    }
  });
});
