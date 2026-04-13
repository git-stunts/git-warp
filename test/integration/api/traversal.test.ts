import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Traversal', () => {
  /** @type {any} */
  let repo;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    repo = await createTestRepo('traversal');
    graph = await repo.openGraph('test', 'alice');

    // Build a linear chain: a -> b -> c -> d
    const p1 = await graph.createPatch();
    await p1
      .addNode('a')
      .addNode('b')
      .addNode('c')
      .addNode('d')
      .addEdge('a', 'b', 'next')
      .addEdge('b', 'c', 'next')
      .addEdge('c', 'd', 'next')
      .commit();

    await graph.materialize();
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('BFS visits nodes in breadth-first order', async () => {
    const visited = await graph.traverse.bfs('a', { dir: 'out' });
    expect(visited).toEqual(['a', 'b', 'c', 'd']);
  });

  it('DFS visits nodes in depth-first order', async () => {
    const visited = await graph.traverse.dfs('a', { dir: 'out' });
    expect(visited).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shortestPath finds path between two nodes', async () => {
    const result = await graph.traverse.shortestPath('a', 'd', { dir: 'out' });
    expect(result.found).toBe(true);
    expect(result.path).toEqual(['a', 'b', 'c', 'd']);
    expect(result.length).toBe(3);
  });

  it('shortestPath returns not found when no path exists', async () => {
    const result = await graph.traverse.shortestPath('d', 'a', { dir: 'out' });
    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.length).toBe(-1);
  });

  it('BFS respects maxDepth', async () => {
    const visited = await graph.traverse.bfs('a', { dir: 'out', maxDepth: 2 });
    expect(visited).toEqual(['a', 'b', 'c']);
    expect(visited).not.toContain('d');
  });

  it('BFS respects labelFilter', async () => {
    // Add a differently-labeled edge
    const p2 = await graph.createPatch();
    await p2.addNode('x').addEdge('a', 'x', 'other').commit();
    await graph.materialize();

    const visited = await graph.traverse.bfs('a', {
      dir: 'out',
      labelFilter: 'next',
    });
    expect(visited).toContain('b');
    expect(visited).not.toContain('x');
  });

  it('connectedComponent finds all reachable nodes', async () => {
    const component = await graph.traverse.connectedComponent('b');
    expect(component.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
