import { describe, it, expect } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { createGitRepo, createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

type RuntimeGraph = Awaited<ReturnType<typeof openRuntimeHostProduct>>;

const directReadCases = [
  {
    name: 'getNodes',
    read: (graph: RuntimeGraph) => graph.getNodes(),
  },
  {
    name: 'hasNode',
    read: (graph: RuntimeGraph) => graph.hasNode('test:x'),
  },
  {
    name: 'getEdges',
    read: (graph: RuntimeGraph) => graph.getEdges(),
  },
  {
    name: 'getNodeProps',
    read: (graph: RuntimeGraph) => graph.getNodeProps('test:x'),
  },
  {
    name: 'neighbors',
    read: (graph: RuntimeGraph) => graph.neighbors('test:x'),
  },
] as const;

async function openGraph(options: { autoMaterialize?: boolean } = {}): Promise<RuntimeGraph> {
  return await openRuntimeHostProduct({
    persistence: createMockPersistence(),
    graphName: 'test',
    writerId: 'writer-1',
    ...(options.autoMaterialize !== undefined ? { autoMaterialize: options.autoMaterialize } : {}),
  });
}

describe('v17 direct read basis contract', () => {
  it.each(directReadCases)(
    '$name rejects with E_NO_STATE when no reading basis exists',
    async ({ read }) => {
      const graph = await openGraph({ autoMaterialize: true });

      await expect(read(graph)).rejects.toMatchObject({ code: 'E_NO_STATE' });
    },
  );

  it('default autoMaterialize does not create a hidden reading basis', async () => {
    const graph = await openGraph();

    await expect(graph.hasNode('test:x')).rejects.toMatchObject({ code: 'E_NO_STATE' });
  });

  it('query builder reads require a live reading basis on RuntimeHostProduct', async () => {
    const graph = await openGraph({ autoMaterialize: true });

    await expect(graph.query().match('*').run()).rejects.toMatchObject({ code: 'E_NO_STATE' });
  });

  it('traversal reads require a live reading basis before node lookup', async () => {
    const graph = await openGraph({ autoMaterialize: true });

    await expect(graph.traverse.bfs('test:x')).rejects.toMatchObject({ code: 'E_NO_STATE' });
    await expect(
      graph.traverse.shortestPath('test:x', 'test:y'),
    ).rejects.toMatchObject({ code: 'E_NO_STATE' });
  });

  it('explicit internal materialization creates a basis for empty reads', async () => {
    const graph = await openGraph({ autoMaterialize: false });

    await graph.materialize();

    await expect(graph.getNodes()).resolves.toEqual([]);
    await expect(graph.hasNode('test:x')).resolves.toBe(false);
    await expect(graph.getEdges()).resolves.toEqual([]);
    await expect(graph.getNodeProps('test:x')).resolves.toBeNull();
    await expect(graph.neighbors('test:x')).resolves.toEqual([]);
  });

  it('explicit internal materialization creates a basis for data reads', async () => {
    const repo = await createGitRepo('v17-reading-basis-data');
    try {
      const graph = await openRuntimeHostProduct({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: false,
      });

      await graph.patch((patch) => {
        patch
          .addNode('test:alice')
          .addNode('test:bob')
          .addEdge('test:alice', 'test:bob', 'knows')
          .setProperty('test:alice', 'name', 'Alice');
      });

      await graph.materialize();

      await expect(graph.hasNode('test:alice')).resolves.toBe(true);
      await expect(graph.getNodes()).resolves.toEqual(['test:alice', 'test:bob']);
      await expect(graph.getNodeProps('test:alice')).resolves.toEqual({ name: 'Alice' });
      await expect(graph.getEdges()).resolves.toEqual([
        { from: 'test:alice', to: 'test:bob', label: 'knows', props: {} },
      ]);
      await expect(graph.neighbors('test:alice', 'outgoing')).resolves.toEqual([
        { nodeId: 'test:bob', label: 'knows', direction: 'outgoing' },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  it('stale cached direct reads reject with E_STALE_STATE', async () => {
    const graph = await openGraph({ autoMaterialize: true });
    await graph.materialize();

    graph._stateDirty = true;

    await expect(graph.getNodes()).rejects.toMatchObject({ code: 'E_STALE_STATE' });
  });

  it('traversal reaches node-not-found behavior after a basis exists', async () => {
    const graph = await openGraph({ autoMaterialize: true });
    await graph.materialize();

    await expect(graph.traverse.bfs('test:x')).rejects.toThrow('Start node not found');
  });
});
