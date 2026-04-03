import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';
import BitmapNeighborProvider from '../../../src/domain/services/index/BitmapNeighborProvider.js';

describe('API: MaterializedView', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('materialized-view');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('attaches a BitmapNeighborProvider to _materializedGraph after materialize', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('A')
      .addNode('B')
      .addEdge('A', 'B', 'knows')
      .setProperty('A', 'name', 'Alice')
      .commit();

    await graph.materialize();

    expect(graph._materializedGraph).not.toBeNull();
    expect(graph._materializedGraph.provider).toBeInstanceOf(BitmapNeighborProvider);
    expect(typeof graph._materializedGraph.provider.getNeighbors).toBe('function');
  });

  it('populates _logicalIndex and _propertyReader after materialize', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('A')
      .addNode('B')
      .addEdge('A', 'B', 'knows')
      .setProperty('A', 'name', 'Alice')
      .commit();

    await graph.materialize();

    expect(graph._logicalIndex).not.toBeNull();
    expect(graph._logicalIndex.isAlive('A')).toBe(true);
    expect(graph._logicalIndex.isAlive('B')).toBe(true);
    expect(graph._logicalIndex.isAlive('nonexistent')).toBe(false);

    expect(graph._propertyReader).not.toBeNull();
  });

  it('logicalIndex.isAlive matches getNodes', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    await p1.addNode('X').addNode('Y').addNode('Z').commit();

    // Materialize so removeNode can observe the add-dots for Y
    await graph.materialize();

    const p2 = await graph.createPatch();
    await p2.removeNode('Y').commit();

    await graph.materialize();

    const nodes = await graph.getNodes();

    // Every node returned by getNodes must be alive in the index
    for (const nodeId of nodes) {
      expect(graph._logicalIndex.isAlive(nodeId)).toBe(true);
    }

    // Removed node must not appear in getNodes and must not be alive
    expect(nodes).not.toContain('Y');
    expect(graph._logicalIndex.isAlive('Y')).toBe(false);

    // Surviving nodes must appear in both
    expect(nodes).toContain('X');
    expect(nodes).toContain('Z');
  });
});
