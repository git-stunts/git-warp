import { expect, it } from 'vitest';
import { createTestRepo } from './helpers/setup.ts';

it('preserves stale and concurrent node/edge semantics through public GC, checkpoint reopen and later writer replay', async () => {
  const repo = await createTestRepo('membership-compaction-safety');
  try {
    const alice = await repo.openGraph('safety', 'alice');
    await (await alice.createPatch())
      .addNode('a').addNode('b').addNode('n').addEdge('a', 'b', 'link').commit();
    await alice.materialize();
    const staleReader = await repo.openGraph('safety', 'stale-reader');
    const stale = await staleReader.materialize();
    const edge = 'a\0b\0link';
    expect(stale.nodeAlive.contains('n')).toBe(true);
    expect(stale.edgeAlive.contains(edge)).toBe(true);

    // Capture a second writer's addition while the removal is still unobserved.
    const bob = await repo.openGraph('safety', 'bob');
    const concurrent = (await bob.createPatch()).addNode('n').addEdge('a', 'b', 'link');
    await (await alice.createPatch()).removeNode('n').removeEdge('a', 'b', 'link').commit();
    await alice.materialize();
    expect(alice.runGC().tombstonesRemoved).toBe(0);
    await alice.createCheckpoint();

    const reopened = await repo.openGraph('safety', 'reader');
    const restored = await reopened.materialize();
    expect(await reopened.hasNode('n')).toBe(false);
    expect(await reopened.getEdges()).toEqual([]);
    const refreshed = await staleReader.materialize();
    expect(refreshed.nodeAlive.contains('n')).toBe(false);
    expect(refreshed.edgeAlive.contains(edge)).toBe(false);
    expect(restored.nodeAlive.countTombstones()).toBe(1);
    expect(restored.edgeAlive.countTombstones()).toBe(1);

    await concurrent.commit();
    const afterReplay = await repo.openGraph('safety', 'reader-after-replay');
    const live = await afterReplay.materialize();
    expect(await afterReplay.hasNode('n')).toBe(true);
    expect(await afterReplay.getEdges()).toHaveLength(1);
    expect(live.nodeAlive.getDots('n')).toEqual(['bob:1']);
    expect(live.edgeAlive.getDots(edge)).toEqual(['bob:2']);
    for (const dot of stale.nodeAlive.getDots('n')) expect(live.nodeAlive.isTombstoned(dot)).toBe(true);
    for (const dot of stale.edgeAlive.getDots(edge)) expect(live.edgeAlive.isTombstoned(dot)).toBe(true);
  } finally {
    await repo.cleanup();
  }
});
