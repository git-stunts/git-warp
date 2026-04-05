import { describe, it, expect } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

describe('Auto-materialize on remove (DX/AUTOMAT/1)', { timeout: 15000 }, () => {
  it('removeNode works without explicit materialize when autoMaterialize is true', async () => {
    const repo = await createGitRepo('automat-remove');
    try {
      const graph = await WarpRuntime.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      // Add a node
      await (await graph.createPatch()).addNode('alice').commit();

      // Do NOT call materialize() explicitly.
      // createPatch should auto-materialize so removeNode has state.
      const patch = await graph.createPatch();
      patch.removeNode('alice');

      const ops = patch.ops;
      expect(ops).toHaveLength(1);
      const op0 = /** @type {any} */ (ops[0]);
      expect(op0.type).toBe('NodeRemove');
      expect(op0.observedDots.length).toBeGreaterThan(0);

      await patch.commit();

      // Verify the node is actually gone
      await graph.materialize();
      const nodes = graph.getNodes();
      expect(nodes).not.toContain('alice');
    } finally {
      await repo.cleanup();
    }
  });

  it('removeEdge works without explicit materialize when autoMaterialize is true', async () => {
    const repo = await createGitRepo('automat-edge');
    try {
      const graph = await WarpRuntime.open({
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

      // No explicit materialize — createPatch should handle it
      const patch = await graph.createPatch();
      patch.removeEdge('a', 'b', 'knows');

      const ops = patch.ops;
      expect(ops).toHaveLength(1);
      const op0 = /** @type {any} */ (ops[0]);
      expect(op0.type).toBe('EdgeRemove');
      expect(op0.observedDots.length).toBeGreaterThan(0);
    } finally {
      await repo.cleanup();
    }
  });

  it('still throws E_PATCH_NO_STATE when autoMaterialize is false', async () => {
    const repo = await createGitRepo('automat-off');
    try {
      const graph = await WarpRuntime.open({
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
