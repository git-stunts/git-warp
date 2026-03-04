import { describe, it, expect } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph.patchMany()', { timeout: 30000 }, () => {
  it('returns empty array when called with no arguments', async () => {
    const repo = await createGitRepo('patchMany-empty');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-a',
        autoMaterialize: true,
      });
      const shas = await graph.patchMany();
      expect(shas).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  it('applies a single patch and returns its SHA', async () => {
    const repo = await createGitRepo('patchMany-single');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-a',
        autoMaterialize: true,
      });
      const shas = await graph.patchMany(
        (p) => { p.addNode('n:1').setProperty('n:1', 'k', 'v'); },
      );
      expect(shas).toHaveLength(1);
      expect(typeof shas[0]).toBe('string');
      expect(shas[0]).toHaveLength(40);

      const props = await graph.getNodeProps('n:1');
      expect(props?.k).toBe('v');
    } finally {
      await repo.cleanup();
    }
  });

  it('applies multiple patches sequentially', async () => {
    const repo = await createGitRepo('patchMany-multi');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-a',
        autoMaterialize: true,
      });
      const shas = await graph.patchMany(
        (p) => { p.addNode('n:1').setProperty('n:1', 'role', 'admin'); },
        (p) => { p.addNode('n:2').setProperty('n:2', 'role', 'user'); },
        (p) => { p.addEdge('n:1', 'n:2', 'manages'); },
      );
      expect(shas).toHaveLength(3);

      const nodes = await graph.getNodes();
      expect(nodes.sort()).toEqual(['n:1', 'n:2']);

      const edges = await graph.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe('n:1');
      expect(edges[0].to).toBe('n:2');
    } finally {
      await repo.cleanup();
    }
  });

  it('each callback sees state from previous patches', async () => {
    const repo = await createGitRepo('patchMany-sees-prior');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-a',
        autoMaterialize: true,
      });

      // First patch creates node, second patch sets a property that depends on it
      const shas = await graph.patchMany(
        (p) => { p.addNode('n:1').setProperty('n:1', 'step', 1); },
        async (p) => {
          // Verify node from first patch is visible
          const has = await graph.hasNode('n:1');
          expect(has).toBe(true);
          p.setProperty('n:1', 'step', 2);
        },
      );
      expect(shas).toHaveLength(2);

      const props = await graph.getNodeProps('n:1');
      expect(props?.step).toBe(2);
    } finally {
      await repo.cleanup();
    }
  });

  it('propagates error from failing callback without applying further patches', async () => {
    const repo = await createGitRepo('patchMany-error');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-a',
        autoMaterialize: true,
      });

      await expect(
        graph.patchMany(
          (p) => { p.addNode('n:1'); },
          () => { throw new Error('deliberate'); },
          (p) => { p.addNode('n:3'); }, // should never run
        ),
      ).rejects.toThrow('deliberate');

      // First patch was applied; third was not
      expect(await graph.hasNode('n:1')).toBe(true);
      expect(await graph.hasNode('n:3')).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });

  it('triggers reentrancy guard when nesting patch inside patchMany callback', async () => {
    const repo = await createGitRepo('patchMany-reentrant');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-a',
        autoMaterialize: true,
      });

      await expect(
        graph.patchMany(
          async () => {
            // Nesting patch() inside patchMany should trigger reentrancy guard
            await graph.patch((p) => { p.addNode('sneaky'); });
          },
        ),
      ).rejects.toThrow(/not reentrant/);
    } finally {
      await repo.cleanup();
    }
  });
});
