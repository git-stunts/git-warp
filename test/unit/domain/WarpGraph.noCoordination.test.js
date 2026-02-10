import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

async function assertLinearWriterChain(/** @type {any} */ persistence, /** @type {any} */ graphName, /** @type {any} */ writerId) {
  const writerRef = buildWriterRef(graphName, writerId);
  let current = await persistence.readRef(writerRef);

  while (current) {
    const info = await persistence.getNodeInfo(current);
    expect(info.parents.length).toBeLessThanOrEqual(1);
    current = info.parents[0] || null;
  }
}

describe('No-coordination regression suite', () => {
  it('keeps writer refs linear after sync cycles', async () => {
    const repoA = await createGitRepo('nocoord');
    const repoB = await createGitRepo('nocoord');

    try {
      const alice = await WarpGraph.open({
        persistence: repoA.persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      const bob = await WarpGraph.open({
        persistence: repoB.persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      await (await alice.createPatch()).addNode('node:alice-1').commit();
      await (await bob.createPatch()).addNode('node:bob-1').commit();

      await alice.syncWith(bob);
      await bob.syncWith(alice);

      const aliceHeadBefore = await repoA.persistence.readRef(
        buildWriterRef('shared', 'alice')
      );
      const bobHeadBefore = await repoB.persistence.readRef(
        buildWriterRef('shared', 'bob')
      );

      await (await alice.createPatch()).addNode('node:alice-2').commit();
      await (await bob.createPatch()).addNode('node:bob-2').commit();

      const aliceHeadAfter = await repoA.persistence.readRef(
        buildWriterRef('shared', 'alice')
      );
      const bobHeadAfter = await repoB.persistence.readRef(
        buildWriterRef('shared', 'bob')
      );

      const aliceInfo = await repoA.persistence.getNodeInfo(aliceHeadAfter);
      const bobInfo = await repoB.persistence.getNodeInfo(bobHeadAfter);

      expect(aliceInfo.parents).toEqual(aliceHeadBefore ? [aliceHeadBefore] : []);
      expect(bobInfo.parents).toEqual(bobHeadBefore ? [bobHeadBefore] : []);

      await assertLinearWriterChain(repoA.persistence, 'shared', 'alice');
      await assertLinearWriterChain(repoB.persistence, 'shared', 'bob');
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  }, { timeout: 20000 });

  it('does not enumerate other writer heads during commit', async () => {
    const repo = await createGitRepo('nocoord');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'writer-1',
      });

      const listRefsSpy = vi.spyOn(repo.persistence, 'listRefs');
      listRefsSpy.mockClear();

      await (await graph.createPatch()).addNode('node:solo').commit();

      expect(listRefsSpy).not.toHaveBeenCalled();
    } finally {
      await repo.cleanup();
    }
  });

  it('survives random sync/commit interleavings without merge commits', async () => {
    const opArb = fc.array(
      fc.constantFrom('commitA', 'commitB', 'syncAB', 'syncBA'),
      { minLength: 1, maxLength: 6 }
    );

    await fc.assert(
      fc.asyncProperty(opArb, async (ops) => {
        const repoA = await createGitRepo('nocoord');
        const repoB = await createGitRepo('nocoord');

        try {
          const alice = await WarpGraph.open({
            persistence: repoA.persistence,
            graphName: 'shared',
            writerId: 'alice',
          });
          const bob = await WarpGraph.open({
            persistence: repoB.persistence,
            graphName: 'shared',
            writerId: 'bob',
          });

          let aCounter = 0;
          let bCounter = 0;

          for (const op of ops) {
            if (op === 'commitA') {
              aCounter += 1;
              await (await alice.createPatch()).addNode(`node:alice-${aCounter}`).commit();
            } else if (op === 'commitB') {
              bCounter += 1;
              await (await bob.createPatch()).addNode(`node:bob-${bCounter}`).commit();
            } else if (op === 'syncAB') {
              await alice.syncWith(bob);
            } else if (op === 'syncBA') {
              await bob.syncWith(alice);
            }
          }

          await assertLinearWriterChain(repoA.persistence, 'shared', 'alice');
          await assertLinearWriterChain(repoB.persistence, 'shared', 'bob');
        } finally {
          await repoA.cleanup();
          await repoB.cleanup();
        }
      }),
      { seed: 4242, numRuns: 8 }
    );
  }, { timeout: 30000 });
});
