import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Lifecycle', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('lifecycle');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('open → createPatch → addNode → commit → materialize → getNodes', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('user:alice')
      .setProperty('user:alice', 'name', 'Alice')
      .commit();

    await graph.materialize();
    const nodes = await graph.getNodes();
    expect(nodes).toContain('user:alice');
  });

  it('creates edges and retrieves them', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    await p1
      .addNode('user:alice')
      .addNode('user:bob')
      .addEdge('user:alice', 'user:bob', 'follows')
      .commit();

    await graph.materialize();
    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: 'user:alice',
      to: 'user:bob',
      label: 'follows',
    });
  });

  it('sets and retrieves node properties', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('user:alice')
      .setProperty('user:alice', 'name', 'Alice')
      .setProperty('user:alice', 'role', 'engineer')
      .commit();

    await graph.materialize();
    const props = await graph.getNodeProps('user:alice');
    expect(props.get('name')).toBe('Alice');
    expect(props.get('role')).toBe('engineer');
  });

  it('builds state across multiple patches', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    await p1.addNode('a').commit();

    const p2 = await graph.createPatch();
    await p2.addNode('b').addEdge('a', 'b', 'link').commit();

    await graph.materialize();
    const nodes = await graph.getNodes();
    expect(nodes).toContain('a');
    expect(nodes).toContain('b');
    expect(await graph.getEdges()).toHaveLength(1);
  });

  it('getPropertyCount returns correct count', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch
      .addNode('n1')
      .setProperty('n1', 'a', 1)
      .setProperty('n1', 'b', 2)
      .commit();

    await graph.materialize();
    const count = await graph.getPropertyCount();
    expect(count).toBe(2);
  });

  it('hasNode returns true for existing nodes and false for missing', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    await patch.addNode('exists').commit();

    await graph.materialize();
    expect(await graph.hasNode('exists')).toBe(true);
    expect(await graph.hasNode('missing')).toBe(false);
  });
});
