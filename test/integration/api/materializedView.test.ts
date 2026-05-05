import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.ts';

describe('API: MaterializedView', () => {
    let repo;

  beforeEach(async () => {
    repo = await createTestRepo('materialized-view');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('reads neighbors through the public query API after materialize', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('A')
      .addNode('B')
      .addEdge('A', 'B', 'knows')
      .setProperty('A', 'name', 'Alice')
      .commit();

    await graph.materialize();

    await expect(graph.neighbors('A', 'outgoing')).resolves.toEqual([
      { nodeId: 'B', label: 'knows', direction: 'outgoing' },
    ]);
    await expect(graph.neighbors('B', 'incoming')).resolves.toEqual([
      { nodeId: 'A', label: 'knows', direction: 'incoming' },
    ]);
  });

  it('reads node liveness and properties through the public query API after materialize', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('A')
      .addNode('B')
      .addEdge('A', 'B', 'knows')
      .setProperty('A', 'name', 'Alice')
      .commit();

    await graph.materialize();

    await expect(graph.hasNode('A')).resolves.toBe(true);
    await expect(graph.hasNode('B')).resolves.toBe(true);
    await expect(graph.hasNode('nonexistent')).resolves.toBe(false);
    await expect(graph.getNodeProps('A')).resolves.toMatchObject({ name: 'Alice' });
  });

  it('getNodes omits removed nodes after rematerializing', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    await p1.addNode('X').addNode('Y').addNode('Z').commit();

    // Materialize so removeNode can observe the add-dots for Y
    await graph.materialize();

    const p2 = await graph.createPatch();
    await p2.removeNode('Y').commit();

    await graph.materialize();

    const nodes = await graph.getNodes();

    expect(nodes).not.toContain('Y');
    expect(nodes).toContain('X');
    expect(nodes).toContain('Z');
    await expect(graph.hasNode('Y')).resolves.toBe(false);
  });
});
