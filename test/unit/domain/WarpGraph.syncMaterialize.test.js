import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import Plumbing from '@git-stunts/plumbing';
import GitGraphAdapter from '../../../src/infrastructure/adapters/GitGraphAdapter.js';
import WarpGraph from '../../../src/domain/WarpGraph.js';

async function createRepo() {
  const tempDir = await mkdtemp(join(tmpdir(), 'emptygraph-syncmat-'));
  const plumbing = Plumbing.createDefault({ cwd: tempDir });
  await plumbing.execute({ args: ['init'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  const persistence = new GitGraphAdapter({ plumbing });

  return {
    tempDir,
    persistence,
    async cleanup() {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

describe('syncWith({ materialize }) option', () => {
  it('syncWith(peer, { materialize: true }) returns fresh state in result', async () => {
    const repoA = await createRepo();
    const repoB = await createRepo();

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
      expect(result.state.nodeAlive).toBeDefined();
      const aliveNodes = [...result.state.nodeAlive.entries.keys()];
      expect(aliveNodes).toContain('node:bob-1');
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  }, { timeout: 20000 });

  it('syncWith(peer) (default) does NOT auto-materialize — result has no state field', async () => {
    const repoA = await createRepo();
    const repoB = await createRepo();

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
    const repoA = await createRepo();
    const repoB = await createRepo();

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
      expect(result.state.nodeAlive).toBeDefined();
      expect([...result.state.nodeAlive.entries.keys()]).toHaveLength(0);
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  }, { timeout: 20000 });
});
