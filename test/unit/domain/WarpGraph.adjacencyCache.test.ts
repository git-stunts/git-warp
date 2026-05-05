import { describe, it, expect } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.ts';

describe('WarpCore cached-basis neighbor reads', () => {
  it('returns stable neighbor results across repeated reads over one basis', async () => {
    const repo = await createGitRepo('cached-basis-stable-neighbors');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-1',
      });

      await graph.patch((patch) => {
        patch.addNode('node:a').addNode('node:b').addEdge('node:a', 'node:b', 'knows');
      });
      await graph.materialize();

      const first = await graph.neighbors('node:a', 'outgoing');
      const second = await graph.neighbors('node:a', 'outgoing');

      expect(first).toEqual([{ nodeId: 'node:b', label: 'knows', direction: 'outgoing' }]);
      expect(second).toEqual(first);
    } finally {
      await repo.cleanup();
    }
  });

  it('updates neighbor reads after a local patch extends a clean basis', async () => {
    const repo = await createGitRepo('cached-basis-updates-neighbors');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-1',
      });

      await graph.patch((patch) => {
        patch.addNode('node:a').addNode('node:b').addEdge('node:a', 'node:b', 'knows');
      });
      await graph.materialize();

      await graph.patch((patch) => {
        patch.addNode('node:c').addEdge('node:a', 'node:c', 'likes');
      });

      await expect(graph.neighbors('node:a', 'outgoing')).resolves.toEqual([
        { nodeId: 'node:b', label: 'knows', direction: 'outgoing' },
        { nodeId: 'node:c', label: 'likes', direction: 'outgoing' },
      ]);
    } finally {
      await repo.cleanup();
    }
  });
});
