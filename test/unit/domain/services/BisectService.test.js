import { describe, it, expect } from 'vitest';
import WarpGraph from '../../../../src/domain/WarpGraph.js';
import BisectService from '../../../../src/domain/services/BisectService.js';
import { orsetContains } from '../../../../src/domain/crdt/ORSet.js';
import { createGitRepo } from '../../../helpers/warpGraphTestUtils.js';

describe('BisectService', { timeout: 30000 }, () => {
  it('vector 1: linear chain — finds first bad patch', async () => {
    const repo = await createGitRepo('bisect-linear');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      // Create 5 patches: A, B, C (introduces 'bug'), D, E
      const shas = [];
      shas.push(await graph.patch(p => { p.addNode('n:1'); }));        // A
      shas.push(await graph.patch(p => { p.addNode('n:2'); }));        // B
      shas.push(await graph.patch(p => { p.addNode('bug'); }));        // C — first bad
      shas.push(await graph.patch(p => { p.addNode('n:3'); }));        // D
      shas.push(await graph.patch(p => { p.addNode('n:4'); }));        // E

      const bisect = new BisectService({ graph });
      const result = await bisect.run({
        good: shas[0],    // A
        bad: shas[4],     // E
        writerId: 'w1',
        testFn: async (state) => {
          // "good" means 'bug' node is NOT alive
          return !orsetContains(state.nodeAlive, 'bug');
        },
      });

      expect(result.result).toBe('found');
      expect(result.firstBadPatch).toBe(shas[2]); // C
      expect(result.writerId).toBe('w1');
      expect(result.steps).toBeLessThanOrEqual(2);
      expect(result.totalCandidates).toBe(4); // B, C, D, E
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 2: same good and bad — range-error', async () => {
    const repo = await createGitRepo('bisect-same');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const sha = await graph.patch(p => { p.addNode('n:1'); });

      const bisect = new BisectService({ graph });
      const result = await bisect.run({
        good: sha,
        bad: sha,
        writerId: 'w1',
        testFn: async () => true,
      });

      expect(result.result).toBe('range-error');
      expect(result.message).toBe('good and bad SHAs are the same');
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 3: single step — A→B, good=A bad=B → result=B, 0 steps', async () => {
    const repo = await createGitRepo('bisect-single');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const shaA = await graph.patch(p => { p.addNode('n:1'); });  // A — good
      const shaB = await graph.patch(p => { p.addNode('bug'); });   // B — bad

      const bisect = new BisectService({ graph });
      const result = await bisect.run({
        good: shaA,
        bad: shaB,
        writerId: 'w1',
        testFn: async (state) => {
          return !orsetContains(state.nodeAlive, 'bug');
        },
      });

      expect(result.result).toBe('found');
      expect(result.firstBadPatch).toBe(shaB);
      expect(result.writerId).toBe('w1');
      expect(result.steps).toBe(0);
      expect(result.totalCandidates).toBe(1);
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 4: good is not ancestor of bad — range-error', async () => {
    const repo = await createGitRepo('bisect-reversed');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const shaA = await graph.patch(p => { p.addNode('n:1'); });
      const shaB = await graph.patch(p => { p.addNode('n:2'); });

      const bisect = new BisectService({ graph });
      // Reversed: good=B (later), bad=A (earlier)
      const result = await bisect.run({
        good: shaB,
        bad: shaA,
        writerId: 'w1',
        testFn: async () => true,
      });

      expect(result.result).toBe('range-error');
      expect(result.message).toBe('good is not an ancestor of bad');
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 5: SHA not found in chain — range-error', async () => {
    const repo = await createGitRepo('bisect-notfound');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const sha = await graph.patch(p => { p.addNode('n:1'); });
      const fakeSha = 'deadbeef'.repeat(5);

      const bisect = new BisectService({ graph });
      const result = await bisect.run({
        good: sha,
        bad: fakeSha,
        writerId: 'w1',
        testFn: async () => true,
      });

      expect(result.result).toBe('range-error');
      expect(result.message).toBe('good or bad SHA not found in writer chain');
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 6: testFn receives candidate SHA', async () => {
    const repo = await createGitRepo('bisect-sha-arg');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const shas = [];
      shas.push(await graph.patch(p => { p.addNode('n:1'); }));   // A — good
      shas.push(await graph.patch(p => { p.addNode('n:2'); }));   // B
      shas.push(await graph.patch(p => { p.addNode('bug'); }));   // C — first bad
      shas.push(await graph.patch(p => { p.addNode('n:3'); }));   // D — bad

      /** @type {string[]} */ const observedShas = [];

      const bisect = new BisectService({ graph });
      const result = await bisect.run({
        good: shas[0],
        bad: shas[3],
        writerId: 'w1',
        testFn: async (state, sha) => {
          observedShas.push(sha);
          return !orsetContains(state.nodeAlive, 'bug');
        },
      });

      expect(result.result).toBe('found');
      expect(result.firstBadPatch).toBe(shas[2]); // C
      // Every SHA passed to testFn must be a real candidate SHA
      for (const observed of observedShas) {
        expect(shas.slice(1)).toContain(observed);
      }
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 7: all-bad — first candidate after good is the first bad patch', async () => {
    const repo = await createGitRepo('bisect-all-bad');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const shas = [];
      shas.push(await graph.patch(p => { p.addNode('n:1'); }));  // A — good
      shas.push(await graph.patch(p => { p.addNode('n:2'); }));  // B — bad
      shas.push(await graph.patch(p => { p.addNode('n:3'); }));  // C — bad
      shas.push(await graph.patch(p => { p.addNode('n:4'); }));  // D — bad

      const bisect = new BisectService({ graph });
      const result = await bisect.run({
        good: shas[0],
        bad: shas[3],
        writerId: 'w1',
        testFn: async () => false, // every state is "bad"
      });

      expect(result.result).toBe('found');
      expect(result.firstBadPatch).toBe(shas[1]); // B — first candidate after good
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 8: testFn throws — promise rejects with same error', async () => {
    const repo = await createGitRepo('bisect-throws');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      const shas = [];
      shas.push(await graph.patch(p => { p.addNode('n:1'); }));
      shas.push(await graph.patch(p => { p.addNode('n:2'); }));
      shas.push(await graph.patch(p => { p.addNode('n:3'); }));

      const testError = new Error('test function exploded');
      const bisect = new BisectService({ graph });

      await expect(bisect.run({
        good: shas[0],
        bad: shas[2],
        writerId: 'w1',
        testFn: async () => { throw testError; },
      })).rejects.toThrow(testError);
    } finally {
      await repo.cleanup();
    }
  });

  it('vector 9: empty writer chain — range-error', async () => {
    const repo = await createGitRepo('bisect-empty-writer');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        autoMaterialize: true,
      });

      // Write patches as w1
      const sha1 = await graph.patch(p => { p.addNode('n:1'); });
      const sha2 = await graph.patch(p => { p.addNode('n:2'); });

      const bisect = new BisectService({ graph });
      // Bisect on w2 who has no patches — SHAs won't be found in w2's chain
      const result = await bisect.run({
        good: sha1,
        bad: sha2,
        writerId: 'w2',
        testFn: async () => true,
      });

      expect(result.result).toBe('range-error');
      expect(result.message).toBe('good or bad SHA not found in writer chain');
    } finally {
      await repo.cleanup();
    }
  });
});
