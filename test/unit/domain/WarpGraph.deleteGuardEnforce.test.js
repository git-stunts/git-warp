import { describe, it, expect, vi, afterEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph deleteGuard enforcement (HS/DELGUARD/2)', () => {
  /** @type {any} */
  let repo;

  afterEach(async () => {
    if (repo) {
      await repo.cleanup();
      repo = null;
    }
  });

  // ---------------------------------------------------------------------------
  // Reject mode
  // ---------------------------------------------------------------------------

  describe('reject mode', () => {
    it('throws when deleting a node that has properties', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Create a node with a property
      await (await graph.createPatch())
        .addNode('n1')
        .setProperty('n1', 'color', 'red')
        .commit();

      await graph.materialize();

      // Attempt to delete should throw
      const patch = await graph.createPatch();
      expect(() => patch.removeNode('n1')).toThrow(
        /Cannot delete node 'n1': node has attached data.*propert/
      );
    }, { timeout: 15000 });

    it('throws when deleting a node that has edges', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Create nodes and an edge
      await (await graph.createPatch())
        .addNode('n1')
        .addNode('n2')
        .addEdge('n1', 'n2', 'likes')
        .commit();

      await graph.materialize();

      // Attempt to delete source node should throw
      const patch = await graph.createPatch();
      expect(() => patch.removeNode('n1')).toThrow(
        /Cannot delete node 'n1': node has attached data.*edge/
      );
    }, { timeout: 15000 });

    it('throws when deleting a node that is an edge target', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Create nodes and an edge
      await (await graph.createPatch())
        .addNode('n1')
        .addNode('n2')
        .addEdge('n1', 'n2', 'likes')
        .commit();

      await graph.materialize();

      // Attempt to delete target node should also throw
      const patch = await graph.createPatch();
      expect(() => patch.removeNode('n2')).toThrow(
        /Cannot delete node 'n2': node has attached data.*edge/
      );
    }, { timeout: 15000 });

    it('succeeds when deleting a node with no attached data', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Create a bare node (no props, no edges)
      await (await graph.createPatch())
        .addNode('n1')
        .commit();

      await graph.materialize();

      // Delete should succeed
      const sha = await (await graph.createPatch())
        .removeNode('n1')
        .commit();

      expect(typeof sha).toBe('string');
      expect(sha.length).toBe(40);
    }, { timeout: 15000 });

    it('mentions both edges and properties in error when both exist', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Create node with both property and edge
      await (await graph.createPatch())
        .addNode('n1')
        .addNode('n2')
        .setProperty('n1', 'name', 'Alice')
        .addEdge('n1', 'n2', 'knows')
        .commit();

      await graph.materialize();

      const patch = await graph.createPatch();
      expect(() => patch.removeNode('n1')).toThrow(
        /1 edge\(s\) and 1 propert/
      );
    }, { timeout: 15000 });

    it('error message suggests cascade mode', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      await (await graph.createPatch())
        .addNode('n1')
        .setProperty('n1', 'x', 1)
        .commit();

      await graph.materialize();

      const patch = await graph.createPatch();
      expect(() => patch.removeNode('n1')).toThrow(
        /set onDeleteWithData to 'cascade'/
      );
    }, { timeout: 15000 });
  });

  // ---------------------------------------------------------------------------
  // Warn mode
  // ---------------------------------------------------------------------------

  describe('warn mode', () => {
    it('logs console.warn and commits when deleting node with properties', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'warn',
      });

      // Create a node with a property
      await (await graph.createPatch())
        .addNode('n1')
        .setProperty('n1', 'color', 'red')
        .commit();

      await graph.materialize();

      // Spy on console.warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const sha = await (await graph.createPatch())
          .removeNode('n1')
          .commit();

        expect(typeof sha).toBe('string');
        expect(sha.length).toBe(40);

        // Verify warning was logged
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toMatch(/Deleting node 'n1'/);
        expect(warnSpy.mock.calls[0][0]).toMatch(/propert/);
      } finally {
        warnSpy.mockRestore();
      }
    }, { timeout: 15000 });

    it('logs console.warn when deleting node with edges', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'warn',
      });

      await (await graph.createPatch())
        .addNode('n1')
        .addNode('n2')
        .addEdge('n1', 'n2', 'follows')
        .commit();

      await graph.materialize();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const sha = await (await graph.createPatch())
          .removeNode('n1')
          .commit();

        expect(typeof sha).toBe('string');
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toMatch(/edge/);
      } finally {
        warnSpy.mockRestore();
      }
    }, { timeout: 15000 });

    it('does not warn when deleting node with no attached data', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'warn',
      });

      // Create a bare node
      await (await graph.createPatch())
        .addNode('n1')
        .commit();

      await graph.materialize();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const sha = await (await graph.createPatch())
          .removeNode('n1')
          .commit();

        expect(typeof sha).toBe('string');
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    }, { timeout: 15000 });
  });

  // ---------------------------------------------------------------------------
  // Writer API (passes option through)
  // ---------------------------------------------------------------------------

  describe('Writer API', () => {
    it('reject mode works through writer().beginPatch()', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Setup: create node with property
      await (await graph.createPatch())
        .addNode('n1')
        .setProperty('n1', 'key', 'val')
        .commit();

      await graph.materialize();

      const writer = await graph.writer('w1');
      const patch = await writer.beginPatch();

      expect(() => patch.removeNode('n1')).toThrow(
        /Cannot delete node 'n1'/
      );
    }, { timeout: 15000 });

    it('warn mode works through writer().commitPatch()', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'warn',
      });

      await (await graph.createPatch())
        .addNode('n1')
        .setProperty('n1', 'key', 'val')
        .commit();

      await graph.materialize();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const writer = await graph.writer('w1');
        const sha = await writer.commitPatch(p => {
          p.removeNode('n1');
        });

        expect(typeof sha).toBe('string');
        // Filter out deprecated warnings from createWriter
        const delGuardWarns = warnSpy.mock.calls.filter(c =>
          typeof c[0] === 'string' && c[0].includes('Deleting node')
        );
        expect(delGuardWarns.length).toBe(1);
        expect(delGuardWarns[0][0]).toMatch(/propert/);
      } finally {
        warnSpy.mockRestore();
      }
    }, { timeout: 15000 });
  });

  // ---------------------------------------------------------------------------
  // Cascade mode (no validation)
  // ---------------------------------------------------------------------------

  describe('cascade mode (validation skipped)', () => {
    it('does not throw or warn when deleting node with attached data', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      await (await graph.createPatch())
        .addNode('n1')
        .setProperty('n1', 'color', 'blue')
        .addNode('n2')
        .addEdge('n1', 'n2', 'links')
        .commit();

      await graph.materialize();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        // Should not throw and should not warn (cascade skips validation)
        const sha = await (await graph.createPatch())
          .removeNode('n1')
          .commit();

        expect(typeof sha).toBe('string');
        // No delete-guard warnings should have been emitted
        const delGuardWarns = warnSpy.mock.calls.filter(c =>
          typeof c[0] === 'string' && c[0].includes('Deleting node')
        );
        expect(delGuardWarns.length).toBe(0);
      } finally {
        warnSpy.mockRestore();
      }
    }, { timeout: 15000 });
  });

  // ---------------------------------------------------------------------------
  // No state scenario (best-effort skips validation)
  // ---------------------------------------------------------------------------

  describe('no cached state', () => {
    it('reject mode does not throw when no state is available', async () => {
      repo = await createGitRepo('delguard');
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'reject',
      });

      // Don't materialize — no cached state
      // removeNode should not throw because there's no state to check against
      const patch = await graph.createPatch();
      expect(() => patch.removeNode('n1')).not.toThrow();
    }, { timeout: 15000 });
  });
});
