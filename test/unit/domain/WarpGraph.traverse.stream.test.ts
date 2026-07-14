import { describe, expect, it } from 'vitest';

import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.ts';

async function collectNodes(stream: AsyncIterable<string>): Promise<string[]> {
  const nodes: string[] = [];
  for await (const node of stream) {
    nodes.push(node);
  }
  return nodes;
}

async function seedTraversalState(graph: Awaited<ReturnType<typeof openRuntimeHostProduct>>): Promise<void> {
  await graph.patch((patch) => {
    patch.addNode('node:a');
    patch.addNode('node:b');
    patch.addNode('node:c');
    patch.addNode('node:d');
    patch.addEdge('node:a', 'node:c', 'z');
    patch.addEdge('node:a', 'node:b', 'a');
    patch.addEdge('node:b', 'node:d', 'a');
    patch.addEdge('node:c', 'node:d', 'z');
  });
  await graph.materialize();
}

describe('WarpCore logical traversal streams', () => {
  it('exposes BFS as a public async traversal stream', async () => {
    const repo = await createGitRepo('traverse-bfs-stream');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-1',
      });
      await seedTraversalState(graph);

      const streamed = await collectNodes(graph.traverse.bfsStream('node:a', { dir: 'out' }));
      const collected = await graph.traverse.bfs('node:a', { dir: 'out' });

      expect(streamed).toEqual(['node:a', 'node:b', 'node:c', 'node:d']);
      expect(streamed).toEqual(collected);
    } finally {
      await repo.cleanup();
    }
  });

  it('exposes DFS as a public async traversal stream', async () => {
    const repo = await createGitRepo('traverse-dfs-stream');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-1',
      });
      await seedTraversalState(graph);

      const streamed = await collectNodes(graph.traverse.dfsStream('node:a', { dir: 'out' }));
      const collected = await graph.traverse.dfs('node:a', { dir: 'out' });

      expect(streamed).toEqual(collected);
    } finally {
      await repo.cleanup();
    }
  });
});
