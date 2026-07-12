import { describe, expect, it } from 'vitest';
import { openWarpGraph } from '../../../src/domain/WarpGraph.ts';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.ts';

describe('WarpGraph public sync seam', { timeout: 20000 }, () => {
  it('does not expose _runtime on the public capability bag', async () => {
    const repo = await createGitRepo('warpgraph-public');

    try {
      const graph = await openWarpGraph({
        persistence: repo.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });

      expect(Object.prototype.hasOwnProperty.call(graph, '_runtime')).toBe(false);
      expect('_runtime' in graph).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });

  it('syncs directly with another WarpGraph capability bag', async () => {
    const repoA = await createGitRepo('warpgraph-public-sync');
    const repoB = await createGitRepo('warpgraph-public-sync');

    try {
      const alice = await openWarpGraph({
        persistence: repoA.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      const bob = await openWarpGraph({
        persistence: repoB.persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      await (await bob.patches.createPatch()).addNode('node:bob-1').commit();

      const result = await alice.sync.syncWith(bob, { materialize: true });

      expect(result.applied).toBeGreaterThanOrEqual(1);
      expect(result.attempts).toBe(1);
      expect(result.state).toBeDefined();
      expect(result.state?.nodeAlive.contains('node:bob-1')).toBe(true);
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  });
});
