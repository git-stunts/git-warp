import { describe, it, expect } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { createGitRepo } from '../../helpers/warpGraphTestUtils.ts';

describe('Cascade delete mode (HS/DELGUARD/3)', { timeout: 15000 }, () => {
  it('cascade delete generates EdgeRemove ops for 3 connected edges + NodeRemove', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      expect((nodeRemoves[0] as any)?.node).toBe('A');

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
  });

  it('materialized state has no dangling edges after cascade delete', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      (await graph.materialize() as any);

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
  });

  it('cascade delete on node with no edges produces only NodeRemove', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      const op0 = (ops[0] as any);
      expect(op0?.type).toBe('NodeRemove');
      expect(op0?.node).toBe('lonely');
    } finally {
      await repo.cleanup();
    }
  });

  it('cascade delete handles both incoming and outgoing edges', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
  });

  it('cascade delete handles self-loop edge correctly', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      const selfEdge = /** @type {{ from: string, to: string, label: string }} */ (edgeRemoves[0]);
      expect(selfEdge!.from).toBe('A');
      expect(selfEdge!.to).toBe('A');
      expect(selfEdge!.label).toBe('self');
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
  });

  it('generated EdgeRemove ops appear in committed patch (auditable)', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      const lastEntry = /** @type {{ patch: { ops: Array<Record<string, unknown>> } }} */ ((patches[patches.length - 1] as unknown));
      const lastPatch = (lastEntry as any).patch;

      // The cascade patch should contain EdgeRemove + NodeRemove
      const edgeRemoves = lastPatch.ops.filter(op => op['type'] === 'EdgeRemove');
      const nodeRemoves = lastPatch.ops.filter(op => op['type'] === 'NodeRemove');

      expect(edgeRemoves).toHaveLength(1);
      const er0 = /** @type {{ from: string, to: string, label: string }} */ (edgeRemoves[0]);
      expect(er0.from).toBe('X');
      expect(er0.to).toBe('Y');
      expect(er0.label).toBe('link');
      expect(nodeRemoves).toHaveLength(1);
      expect(/** @type {{ node: string }} */ (nodeRemoves[0]).node).toBe('X');
    } finally {
      await repo.cleanup();
    }
  });

  it('cascade mode preserves unrelated edges', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      const edge0 = /** @type {{ from: string, to: string }} */ (edges[0]);
      expect(edge0!.from).toBe('C');
      expect(edge0!.to).toBe('D');
    } finally {
      await repo.cleanup();
    }
  });

  it('without cascade mode, removeNode does not generate EdgeRemove ops', async () => {
    const repo = await createGitRepo('cascade');
    try {
      const graph = await openRuntimeHostProduct({
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
      expect((ops[0] as any)?.type).toBe('NodeRemove');
    } finally {
      await repo.cleanup();
    }
  });
});
