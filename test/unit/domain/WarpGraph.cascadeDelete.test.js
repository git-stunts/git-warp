import { describe, it, expect } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.js';

describe('Cascade delete mode (HS/DELGUARD/3)', () => {
  it('cascade delete generates EdgeRemove ops for 3 connected edges + NodeRemove', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Build graph: A -> B, A -> C, A -> D (3 outgoing edges from A)
      await (await graph.createPatch())
        .addNode('A')
        .addNode('B')
        .addNode('C')
        .addNode('D')
        .addEdge('A', 'B', 'knows')
        .addEdge('A', 'C', 'knows')
        .addEdge('A', 'D', 'knows')
        .commit();

      await graph.materialize();

      // Cascade delete node A
      const builder = await graph.createPatch();
      builder.removeNode('A');

      // Check ops before commit: should have 3 EdgeRemove + 1 NodeRemove = 4 ops
      const ops = builder.ops;
      const edgeRemoves = ops.filter(op => op.type === 'EdgeRemove');
      const nodeRemoves = ops.filter(op => op.type === 'NodeRemove');

      expect(edgeRemoves).toHaveLength(3);
      expect(nodeRemoves).toHaveLength(1);
      expect(nodeRemoves[0].node).toBe('A');

      // Verify EdgeRemove ops target the correct edges
      const removedEdges = edgeRemoves.map(op => `${op.from}->${op.to}[${op.label}]`).sort();
      expect(removedEdges).toEqual([
        'A->B[knows]',
        'A->C[knows]',
        'A->D[knows]',
      ]);
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('materialized state has no dangling edges after cascade delete', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Build graph
      await (await graph.createPatch())
        .addNode('A')
        .addNode('B')
        .addNode('C')
        .addEdge('A', 'B', 'follows')
        .addEdge('A', 'C', 'manages')
        .setProperty('A', 'name', 'Alice')
        .commit();

      await graph.materialize();

      // Cascade delete node A
      await (await graph.createPatch()).removeNode('A').commit();
      const state = /** @type {any} */ (await graph.materialize());

      // Node A should be gone
      expect(await graph.hasNode('A')).toBe(false);

      // Nodes B and C should remain
      expect(await graph.hasNode('B')).toBe(true);
      expect(await graph.hasNode('C')).toBe(true);

      // No edges should remain (both edges touched A)
      const edges = await graph.getEdges();
      expect(edges).toHaveLength(0);
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('cascade delete on node with no edges produces only NodeRemove', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Add a lonely node with a property
      await (await graph.createPatch())
        .addNode('lonely')
        .setProperty('lonely', 'tag', 'solo')
        .commit();

      await graph.materialize();

      // Cascade delete the lonely node
      const builder = await graph.createPatch();
      builder.removeNode('lonely');

      const ops = builder.ops;
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('NodeRemove');
      expect(/** @type {any} */ (ops[0]).node).toBe('lonely');
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('cascade delete handles both incoming and outgoing edges', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Build graph: B -> A (incoming to A), A -> C (outgoing from A)
      await (await graph.createPatch())
        .addNode('A')
        .addNode('B')
        .addNode('C')
        .addEdge('B', 'A', 'incoming')
        .addEdge('A', 'C', 'outgoing')
        .commit();

      await graph.materialize();

      // Cascade delete node A
      const builder = await graph.createPatch();
      builder.removeNode('A');

      const ops = builder.ops;
      const edgeRemoves = ops.filter(op => op.type === 'EdgeRemove');
      const nodeRemoves = ops.filter(op => op.type === 'NodeRemove');

      expect(edgeRemoves).toHaveLength(2);
      expect(nodeRemoves).toHaveLength(1);

      // Verify both directions captured
      const removedEdges = edgeRemoves.map(op => `${op.from}->${op.to}[${op.label}]`).sort();
      expect(removedEdges).toEqual([
        'A->C[outgoing]',
        'B->A[incoming]',
      ]);

      // Commit and verify materialized state
      await builder.commit();
      await graph.materialize();

      expect(await graph.hasNode('A')).toBe(false);
      expect(await graph.hasNode('B')).toBe(true);
      expect(await graph.hasNode('C')).toBe(true);
      const edges = await graph.getEdges();
      expect(edges).toHaveLength(0);
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('cascade delete handles self-loop edge correctly', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Build graph with self-loop: A -> A
      await (await graph.createPatch())
        .addNode('A')
        .addEdge('A', 'A', 'self')
        .commit();

      await graph.materialize();

      // Cascade delete node A
      const builder = await graph.createPatch();
      builder.removeNode('A');

      const ops = builder.ops;
      const edgeRemoves = ops.filter(op => op.type === 'EdgeRemove');
      const nodeRemoves = ops.filter(op => op.type === 'NodeRemove');

      // Self-loop should produce exactly 1 EdgeRemove (not 2), because
      // findAttachedData collects unique edge keys and the self-loop is one edge
      expect(edgeRemoves).toHaveLength(1);
      expect(edgeRemoves[0].from).toBe('A');
      expect(edgeRemoves[0].to).toBe('A');
      expect(edgeRemoves[0].label).toBe('self');
      expect(nodeRemoves).toHaveLength(1);

      // Commit and verify materialized state
      await builder.commit();
      await graph.materialize();

      expect(await graph.hasNode('A')).toBe(false);
      const edges = await graph.getEdges();
      expect(edges).toHaveLength(0);
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('generated EdgeRemove ops appear in committed patch (auditable)', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Build graph
      await (await graph.createPatch())
        .addNode('X')
        .addNode('Y')
        .addEdge('X', 'Y', 'link')
        .commit();

      await graph.materialize();

      // Cascade delete node X and commit
      const sha = await (await graph.createPatch()).removeNode('X').commit();

      // Verify the SHA is a valid commit
      expect(sha).toMatch(/^[0-9a-f]{40}$/);

      // Load and verify the committed patches
      const patches = await graph.getWriterPatches('w1');
      const lastPatch = patches[patches.length - 1].patch;

      // The cascade patch should contain EdgeRemove + NodeRemove
      const edgeRemoves = lastPatch.ops.filter(op => op.type === 'EdgeRemove');
      const nodeRemoves = lastPatch.ops.filter(op => op.type === 'NodeRemove');

      expect(edgeRemoves).toHaveLength(1);
      expect(edgeRemoves[0].from).toBe('X');
      expect(edgeRemoves[0].to).toBe('Y');
      expect(edgeRemoves[0].label).toBe('link');
      expect(nodeRemoves).toHaveLength(1);
      expect(nodeRemoves[0].node).toBe('X');
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('cascade mode preserves unrelated edges', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'cascade',
      });

      // Build graph: A -> B, C -> D (two disconnected edges)
      await (await graph.createPatch())
        .addNode('A')
        .addNode('B')
        .addNode('C')
        .addNode('D')
        .addEdge('A', 'B', 'link')
        .addEdge('C', 'D', 'link')
        .commit();

      await graph.materialize();

      // Cascade delete A (should only remove A->B edge)
      await (await graph.createPatch()).removeNode('A').commit();
      await graph.materialize();

      // B, C, D should remain
      expect(await graph.hasNode('A')).toBe(false);
      expect(await graph.hasNode('B')).toBe(true);
      expect(await graph.hasNode('C')).toBe(true);
      expect(await graph.hasNode('D')).toBe(true);

      // Only C->D should remain
      const edges = await graph.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe('C');
      expect(edges[0].to).toBe('D');
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });

  it('without cascade mode, removeNode does not generate EdgeRemove ops', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await WarpGraph.open({
        persistence: repo.persistence,
        graphName: 'test',
        writerId: 'w1',
        onDeleteWithData: 'warn',
      });

      // Build graph
      await (await graph.createPatch())
        .addNode('A')
        .addNode('B')
        .addEdge('A', 'B', 'link')
        .commit();

      await graph.materialize();

      // Delete without cascade (warn mode)
      const builder = await graph.createPatch();
      builder.removeNode('A');

      const ops = builder.ops;
      // Should only have NodeRemove, no EdgeRemove
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('NodeRemove');
    } finally {
      await repo.cleanup();
    }
  }, { timeout: 15000 });
});
