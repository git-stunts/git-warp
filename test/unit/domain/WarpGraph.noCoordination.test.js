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

  describe('Lamport clock global-max monotonicity', () => {
    it('first-time writer beats existing writer when it materializes first', async () => {
      // Regression: when writer B makes its very first commit to a repo where writer A
      // has already committed at tick N, B must commit at tick > N so its operations
      // win the LWW CRDT tiebreaker — not lose to A's tick-1 commit.
      const repo = await createGitRepo('lamport-mono');
      try {
        // Writer A seeds a node
        const graphA = await WarpGraph.open({
          persistence: repo.persistence,
          graphName: 'test',
          writerId: 'writer-zzz', // alphabetically > writer-aaa so A would win ties
          autoMaterialize: true,
        });
        const pA = await graphA.createPatch();
        pA.addNode('node:shared')
          .setProperty('node:shared', 'value', 'from-A');
        await pA.commit();

        // Writer B opens a fresh handle, materializes to observe A, then mutates
        const graphB = await WarpGraph.open({
          persistence: repo.persistence,
          graphName: 'test',
          writerId: 'writer-aaa', // alphabetically < writer-zzz, would LOSE tick ties
          autoMaterialize: true,
        });
        await graphB.syncCoverage();
        await graphB.materialize(); // observes A's tick-1 patch → _maxObservedLamport = 1

        const pB = await graphB.createPatch();
        pB.setProperty('node:shared', 'value', 'from-B'); // must be at tick >= 2 to win
        await pB.commit();

        // B's own state should reflect its own mutation
        const propsB = await graphB.getNodeProps('node:shared');
        expect(propsB?.get('value')).toBe('from-B');

        // A fresh reader that sees both writers must also resolve to B's value
        const graphReader = await WarpGraph.open({
          persistence: repo.persistence,
          graphName: 'test',
          writerId: 'reader',
          autoMaterialize: true,
        });
        await graphReader.syncCoverage();
        await graphReader.materialize();
        const propsReader = await graphReader.getNodeProps('node:shared');
        expect(propsReader?.get('value')).toBe('from-B');
      } finally {
        await repo.cleanup();
      }
    }, { timeout: 20000 });

    it('_maxObservedLamport is updated after each commit on the same instance', async () => {
      const repo = await createGitRepo('lamport-mono');
      try {
        const graph = await WarpGraph.open({
          persistence: repo.persistence,
          graphName: 'test',
          writerId: 'writer-a',
          autoMaterialize: true,
        });

        expect(graph._maxObservedLamport).toBe(0);

        const p1 = await graph.createPatch();
        p1.addNode('node:x').setProperty('node:x', 'v', '1');
        await p1.commit();

        expect(graph._maxObservedLamport).toBe(1);

        const p2 = await graph.createPatch();
        p2.setProperty('node:x', 'v', '2');
        await p2.commit();

        expect(graph._maxObservedLamport).toBe(2);
      } finally {
        await repo.cleanup();
      }
    }, { timeout: 10000 });

    it('materialize updates _maxObservedLamport from observed patches', async () => {
      const repo = await createGitRepo('lamport-mono');
      try {
        // Seed with writer-z at tick 1
        const graphZ = await WarpGraph.open({
          persistence: repo.persistence,
          graphName: 'test',
          writerId: 'writer-z',
          autoMaterialize: true,
        });
        const p = await graphZ.createPatch();
        p.addNode('node:x').setProperty('node:x', 'v', 'z');
        await p.commit();

        // Fresh writer-a: before materialize, max is 0
        const graphA = await WarpGraph.open({
          persistence: repo.persistence,
          graphName: 'test',
          writerId: 'writer-a',
          autoMaterialize: true,
        });
        expect(graphA._maxObservedLamport).toBe(0);

        await graphA.syncCoverage();
        await graphA.materialize();

        // After materialize, should have observed tick 1 from writer-z
        expect(graphA._maxObservedLamport).toBe(1);
      } finally {
        await repo.cleanup();
      }
    }, { timeout: 10000 });
  });

});
