import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Sync', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('sync');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('syncCoverage creates coverage anchor with all writer tips', async () => {
    const alice = await repo.openGraph('test', 'alice');
    const bob = await repo.openGraph('test', 'bob');

    await (await alice.createPatch()).addNode('a').commit();
    await (await bob.createPatch()).addNode('b').commit();

    await alice.syncCoverage();

    const coverageSha = await repo.persistence.readRef(
      'refs/warp/test/coverage/head',
    );
    expect(coverageSha).toBeTruthy();
  });

  it('syncNeeded detects when frontier has changed', async () => {
    const alice = await repo.openGraph('test', 'alice');
    await (await alice.createPatch()).addNode('a').commit();
    await alice.materialize();

    // After materialize, hasFrontierChanged should be false
    const changed1 = await alice.hasFrontierChanged();
    expect(changed1).toBe(false);

    // Add another patch from bob
    const bob = await repo.openGraph('test', 'bob');
    await (await bob.createPatch()).addNode('b').commit();

    // Now alice's frontier has changed
    const changed2 = await alice.hasFrontierChanged();
    expect(changed2).toBe(true);
  });

  it('createSyncRequest returns valid request object', async () => {
    const graph = await repo.openGraph('test', 'alice');
    await (await graph.createPatch()).addNode('a').commit();
    await graph.materialize();

    const request = await graph.createSyncRequest();
    expect(request).toBeDefined();
    expect(request.type).toBe('sync-request');
    expect(request.frontier).toBeDefined();
  });

  it('direct sync between two graph instances in same repo', async () => {
    const alice = await repo.openGraph('test', 'alice');
    const bob = await repo.openGraph('test', 'bob');

    await (await alice.createPatch())
      .addNode('from-alice')
      .commit();

    await (await bob.createPatch())
      .addNode('from-bob')
      .commit();

    // Sync alice -> bob (both in same repo, direct mode)
    await alice.syncWith(bob);

    // Both should see each other's data
    await bob.materialize();
    const nodesB = await bob.getNodes();
    expect(nodesB).toContain('from-alice');
    expect(nodesB).toContain('from-bob');
  });
});
