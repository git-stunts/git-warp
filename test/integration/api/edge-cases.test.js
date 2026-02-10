import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Edge Cases', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('edge-cases');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('empty graph materializes with zero nodes', async () => {
    const graph = await repo.openGraph('empty', 'w1');
    await graph.materialize();
    const nodes = await graph.getNodes();
    expect(nodes).toHaveLength(0);
    const edges = await graph.getEdges();
    expect(edges).toHaveLength(0);
  });

  it('single node with no edges', async () => {
    const graph = await repo.openGraph('solo', 'w1');
    await (await graph.createPatch()).addNode('lonely').commit();
    await graph.materialize();

    expect(await graph.getNodes()).toEqual(['lonely']);
    expect(await graph.getEdges()).toHaveLength(0);
    expect(await graph.neighbors('lonely')).toHaveLength(0);
  });

  it('self-edges are supported', async () => {
    const graph = await repo.openGraph('self', 'w1');
    await (await graph.createPatch())
      .addNode('loop')
      .addEdge('loop', 'loop', 'self-ref')
      .commit();

    await graph.materialize();
    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: 'loop',
      to: 'loop',
      label: 'self-ref',
    });
  });

  it('unicode node IDs work correctly', async () => {
    const graph = await repo.openGraph('unicode', 'w1');
    await (await graph.createPatch())
      .addNode('user:café')
      .addNode('user:日本語')
      .setProperty('user:café', 'city', 'Paris')
      .commit();

    await graph.materialize();
    const nodes = await graph.getNodes();
    expect(nodes).toContain('user:café');
    expect(nodes).toContain('user:日本語');

    const props = await graph.getNodeProps('user:café');
    expect(props.get('city')).toBe('Paris');
  });

  it('large property values are stored and retrieved', async () => {
    const graph = await repo.openGraph('large', 'w1');
    const bigValue = 'x'.repeat(10000);

    await (await graph.createPatch())
      .addNode('big')
      .setProperty('big', 'data', bigValue)
      .commit();

    await graph.materialize();
    const props = await graph.getNodeProps('big');
    expect(props.get('data')).toBe(bigValue);
  });

  it('numeric and boolean property values', async () => {
    const graph = await repo.openGraph('types', 'w1');

    await (await graph.createPatch())
      .addNode('n')
      .setProperty('n', 'count', 42)
      .setProperty('n', 'pi', 3.14)
      .setProperty('n', 'active', true)
      .commit();

    await graph.materialize();
    const props = await graph.getNodeProps('n');
    expect(props.get('count')).toBe(42);
    expect(props.get('pi')).toBeCloseTo(3.14);
    expect(props.get('active')).toBe(true);
  });
});
