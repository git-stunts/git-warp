import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Tombstone & GC', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('tombstone-gc');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('removeNode tombstones a node', async () => {
    const graph = await repo.openGraph('test', 'alice');

    await (await graph.createPatch())
      .addNode('temp')
      .setProperty('temp', 'data', 'value')
      .commit();

    await graph.materialize();
    expect(await graph.hasNode('temp')).toBe(true);

    await (await graph.createPatch()).removeNode('temp').commit();
    await graph.materialize();
    expect(await graph.hasNode('temp')).toBe(false);
  });

  it('removeEdge tombstones an edge', async () => {
    const graph = await repo.openGraph('test', 'alice');

    await (await graph.createPatch())
      .addNode('a')
      .addNode('b')
      .addEdge('a', 'b', 'link')
      .commit();

    await graph.materialize();
    expect(await graph.getEdges()).toHaveLength(1);

    await (await graph.createPatch()).removeEdge('a', 'b', 'link').commit();
    await graph.materialize();
    expect(await graph.getEdges()).toHaveLength(0);
  });

  it('GC metrics reflect tombstone ratio', async () => {
    const graph = await repo.openGraph('test', 'alice');

    await (await graph.createPatch())
      .addNode('alive')
      .addNode('dead')
      .commit();

    await graph.materialize();
    await (await graph.createPatch()).removeNode('dead').commit();
    await graph.materialize();

    const metrics = graph.getGCMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics.tombstoneRatio).toBe('number');
  });

  it('node can be re-added after removal', async () => {
    const graph = await repo.openGraph('test', 'alice');

    await (await graph.createPatch()).addNode('phoenix').commit();
    await graph.materialize();

    await (await graph.createPatch()).removeNode('phoenix').commit();
    await graph.materialize();
    expect(await graph.hasNode('phoenix')).toBe(false);

    await (await graph.createPatch()).addNode('phoenix').commit();
    await graph.materialize();
    expect(await graph.hasNode('phoenix')).toBe(true);
  });
});
