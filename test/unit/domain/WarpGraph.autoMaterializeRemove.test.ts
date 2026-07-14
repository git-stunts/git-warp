import { describe, it, expect } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.ts';

describe('Remove operations require a reading basis', { timeout: 15000 }, () => {
  it('removeNode rejects without a basis even when autoMaterialize is true', async () => {
    const repo = await createGitRepo('automat-remove');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      // Add a node
      await (await graph.createPatch()).addNode('alice').commit();

      const patch = await graph.createPatch();
      expect(() => patch.removeNode('alice')).toThrow('must be materialized');
    } finally {
      await repo.cleanup();
    }
  });

  it('removeNode works after an explicit reading basis exists', async () => {
    const repo = await createGitRepo('remove-node-explicit-basis');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      await (await graph.createPatch()).addNode('alice').commit();
      await graph.materialize();

      const patch = await graph.createPatch();
      patch.removeNode('alice');
      await patch.commit();

      const nodes = await graph.getNodes();
      expect(nodes).not.toContain('alice');
    } finally {
      await repo.cleanup();
    }
  });

  it('removeEdge rejects without a basis even when autoMaterialize is true', async () => {
    const repo = await createGitRepo('automat-edge');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      await (await graph.createPatch())
        .addNode('a')
        .addNode('b')
        .addEdge('a', 'b', 'knows')
        .commit();

      const patch = await graph.createPatch();
      expect(() => patch.removeEdge('a', 'b', 'knows')).toThrow('must be materialized');
    } finally {
      await repo.cleanup();
    }
  });

  it('removeEdge works after an explicit reading basis exists', async () => {
    const repo = await createGitRepo('remove-edge-explicit-basis');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      await (await graph.createPatch())
        .addNode('a')
        .addNode('b')
        .addEdge('a', 'b', 'knows')
        .commit();
      await graph.materialize();

      const patch = await graph.createPatch();
      patch.removeEdge('a', 'b', 'knows');
      await patch.commit();

      const edges = await graph.getEdges();
      expect(edges).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  it('still throws E_PATCH_NO_STATE when autoMaterialize is false', async () => {
    const repo = await createGitRepo('automat-off');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: false,
      });

      await (await graph.createPatch()).addNode('alice').commit();

      // autoMaterialize is false, no explicit materialize
      const patch = await graph.createPatch();
      expect(() => patch.removeNode('alice')).toThrow('must be materialized');
    } finally {
      await repo.cleanup();
    }
  });
});
