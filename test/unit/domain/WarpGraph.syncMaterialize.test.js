import { describe, it, expect } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

describe('syncWith({ materialize }) option', () => {
  it('syncWith(peer, { materialize: true }) returns fresh state in result', async () => {
    const repoA = await createGitRepo('syncmat');
    const repoB = await createGitRepo('syncmat');

    try {
      const alice = await WarpGraph.open({
        persistence: repoA.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      const bob = await WarpGraph.open({
        persistence: repoB.persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      // Bob creates a node
      await (await bob.createPatch()).addNode('node:bob-1').commit();

      // Alice syncs from Bob with materialize: true
      const result = await alice.syncWith(bob, { materialize: true });

      expect(result.applied).toBeGreaterThanOrEqual(1);
      expect(result.attempts).toBe(1);
      expect(result.state).toBeDefined();

      // The materialized state should contain bob's node
      const state1 = /** @type {any} */ (result.state);
      expect(state1.nodeAlive).toBeDefined();
      const aliveNodes = [...state1.nodeAlive.entries.keys()];
      expect(aliveNodes).toContain('node:bob-1');
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  }, { timeout: 20000 });

  it('syncWith(peer) (default) does NOT auto-materialize — result has no state field', async () => {
    const repoA = await createGitRepo('syncmat');
    const repoB = await createGitRepo('syncmat');

    try {
      const alice = await WarpGraph.open({
        persistence: repoA.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      const bob = await WarpGraph.open({
        persistence: repoB.persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      // Bob creates a node
      await (await bob.createPatch()).addNode('node:bob-1').commit();

      // Alice syncs from Bob without materialize option
      const result = await alice.syncWith(bob);

      expect(result.applied).toBeGreaterThanOrEqual(1);
      expect(result.attempts).toBe(1);
      expect(result).not.toHaveProperty('state');
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  }, { timeout: 20000 });

  it('sync applies 0 patches + materialize:true — materialize still runs', async () => {
    const repoA = await createGitRepo('syncmat');
    const repoB = await createGitRepo('syncmat');

    try {
      const alice = await WarpGraph.open({
        persistence: repoA.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      const bob = await WarpGraph.open({
        persistence: repoB.persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      // Neither writer has committed anything — sync should apply 0 patches
      const result = await alice.syncWith(bob, { materialize: true });

      expect(result.applied).toBe(0);
      expect(result.attempts).toBe(1);
      expect(result.state).toBeDefined();

      // State should be a valid empty materialized state
      const state2 = /** @type {any} */ (result.state);
      expect(state2.nodeAlive).toBeDefined();
      expect([...state2.nodeAlive.entries.keys()]).toHaveLength(0);
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  }, { timeout: 20000 });
});
