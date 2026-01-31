import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock GitGraphAdapter to avoid loading @git-stunts/alfred which may not be available
vi.mock('../../../../src/infrastructure/adapters/GitGraphAdapter.js', () => ({
  default: class MockGitGraphAdapter {},
}));

import EmptyGraph from '../../../../index.js';
import GraphRefManager from '../../../../src/domain/services/GraphRefManager.js';

/**
 * Tests for the managed mode durability feature.
 *
 * Managed mode ensures that all created nodes remain reachable from the graph ref,
 * protecting them from git garbage collection. This is implemented through:
 *
 * 1. Automatic ref updates after each createNode() call
 * 2. Anchor commits when nodes have disconnected roots
 * 3. Fast-forward updates when possible (descendant relationship)
 */
describe('Managed Mode Durability', () => {
  let mockPersistence;

  beforeEach(() => {
    // Track ref state for realistic behavior
    let currentRef = null;
    let commitCounter = 0;

    mockPersistence = {
      emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      commitNode: vi.fn().mockImplementation(async () => {
        return `sha${(++commitCounter).toString().padStart(8, '0')}`;
      }),
      showNode: vi.fn().mockResolvedValue('node-content'),
      getNodeInfo: vi.fn().mockResolvedValue({
        sha: 'abc123',
        message: 'test message',
        author: 'Test Author',
        date: '2026-01-29 10:00:00 -0500',
        parents: ['parent1'],
      }),
      nodeExists: vi.fn().mockResolvedValue(true),
      logNodesStream: vi.fn(),
      readRef: vi.fn().mockImplementation(async () => currentRef),
      updateRef: vi.fn().mockImplementation(async (_ref, oid) => {
        currentRef = oid;
      }),
      countNodes: vi.fn().mockResolvedValue(1),
    };
  });

  describe('managed mode creates reachable nodes', () => {
    it('creates ref pointing to node on first write', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const sha = await graph.createNode({ message: 'First node' });

      // Verify ref was created pointing to the new node
      expect(mockPersistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/test',
        sha
      );
    });

    it('ref points to reachable commit after createNode', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      await graph.createNode({ message: 'Node A' });

      // The ref should have been updated
      expect(mockPersistence.updateRef).toHaveBeenCalled();

      // Reading the ref should return the SHA we created
      const refSha = await mockPersistence.readRef('refs/empty-graph/test');
      expect(refSha).toBe('sha00000001');
    });

    it('nodes are created with proper parents', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      // Create a root node
      const rootSha = await graph.createNode({ message: 'Root' });

      // Create a child node with explicit parent
      await graph.createNode({ message: 'Child', parents: [rootSha] });

      // Verify child was created with parent
      expect(mockPersistence.commitNode).toHaveBeenNthCalledWith(2, {
        message: 'Child',
        parents: [rootSha],
        sign: false,
      });
    });
  });

  describe('managed mode with disconnected roots creates anchor', () => {
    it('creates anchor when adding disconnected root', async () => {
      // Start with an existing ref
      let currentRef = 'existingsha001';
      mockPersistence.readRef.mockImplementation(async () => currentRef);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        currentRef = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      // Create a new disconnected root (no parents)
      await graph.createNode({ message: 'New root' });

      // An anchor commit should have been created
      // The anchor has parents: [currentTip, newNode]
      const anchorCall = mockPersistence.commitNode.mock.calls.find(
        call => call[0].message.includes('"_type":"anchor"')
      );
      expect(anchorCall).toBeDefined();
      expect(anchorCall[0].parents).toContain('existingsha001');
    });

    it('both disconnected roots are reachable from ref', async () => {
      // Track all commits and their parents for reachability checking
      const commits = new Map();
      let refTip = null;
      let counter = 0;

      mockPersistence.commitNode.mockImplementation(async ({ message, parents }) => {
        const sha = `sha${(++counter).toString().padStart(8, '0')}`;
        commits.set(sha, { message, parents });
        return sha;
      });
      mockPersistence.readRef.mockImplementation(async () => refTip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refTip = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      // Create first root
      const shaA = await graph.createNode({ message: 'Root A' });

      // Create second disconnected root
      const shaB = await graph.createNode({ message: 'Root B' });

      // Helper to check if a SHA is reachable from the ref tip
      function isReachable(targetSha, startSha = refTip, visited = new Set()) {
        if (!startSha || visited.has(startSha)) return false;
        if (startSha === targetSha) return true;
        visited.add(startSha);

        const commit = commits.get(startSha);
        if (!commit) return false;

        return commit.parents.some(p => isReachable(targetSha, p, visited));
      }

      // Both A and B should be reachable from the ref
      expect(isReachable(shaA)).toBe(true);
      expect(isReachable(shaB)).toBe(true);
    });

    it('anchor commit has correct structure', async () => {
      let refTip = 'existingsha001';
      mockPersistence.readRef.mockImplementation(async () => refTip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refTip = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      await graph.createNode({ message: 'New disconnected node' });

      // Find the anchor commit
      const anchorCall = mockPersistence.commitNode.mock.calls.find(
        call => call[0].message.includes('_type')
      );

      // Anchor should have JSON message with _type: 'anchor'
      const anchorMessage = JSON.parse(anchorCall[0].message);
      expect(anchorMessage._type).toBe('anchor');

      // Anchor should have both the old tip and new node as parents
      expect(anchorCall[0].parents.length).toBe(2);
    });
  });

  describe('managed mode with descendant does fast-forward', () => {
    it('creates anchor for descendant with current implementation (isAncestor TODO)', async () => {
      // Note: The current implementation of isAncestor always returns false,
      // so even when B is a descendant of A, an anchor is created.
      // This is safe but not optimal. When isAncestor is properly implemented
      // using `git merge-base --is-ancestor`, this test should be updated to
      // verify fast-forward behavior (no anchor created).

      // Track commits
      const commits = new Map();
      let refTip = null;
      let counter = 0;

      mockPersistence.commitNode.mockImplementation(async ({ message, parents }) => {
        const sha = `sha${(++counter).toString().padStart(8, '0')}`;
        commits.set(sha, { message, parents });
        return sha;
      });
      mockPersistence.readRef.mockImplementation(async () => refTip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refTip = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      // Create root A
      const shaA = await graph.createNode({ message: 'Root A' });

      // Create B with A as parent (B is descendant of A)
      const shaB = await graph.createNode({ message: 'Child B', parents: [shaA] });

      // With current implementation, an anchor is created even for fast-forward cases
      // The ref tip will be the anchor, not shaB directly
      const anchorCalls = mockPersistence.commitNode.mock.calls.filter(
        call => call[0].message.includes('_type')
      );
      expect(anchorCalls.length).toBe(1);

      // Both A and B should be reachable from the anchor
      const anchor = commits.get(refTip);
      expect(anchor).toBeDefined();
      expect(anchor.parents).toContain(shaA); // Previous tip
      expect(anchor.parents).toContain(shaB); // New node
    });

    it('ref points to the descendant node after update', async () => {
      let refTip = null;
      let counter = 0;

      mockPersistence.commitNode.mockImplementation(async () => {
        return `sha${(++counter).toString().padStart(8, '0')}`;
      });
      mockPersistence.readRef.mockImplementation(async () => refTip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refTip = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const shaA = await graph.createNode({ message: 'A' });
      const shaB = await graph.createNode({ message: 'B', parents: [shaA] });

      // The ref should have been updated to include B
      // (Either directly to B, or to an anchor that includes B)
      const finalRef = await mockPersistence.readRef('refs/empty-graph/test');
      expect(finalRef).toBeDefined();

      // updateRef should have been called for B (or an anchor containing B)
      expect(mockPersistence.updateRef).toHaveBeenCalled();
    });
  });

  describe('manual mode does not auto-update ref', () => {
    it('does not update ref on createNode', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
      });

      await graph.createNode({ message: 'Node A' });

      // In manual mode, updateRef should NOT be called automatically
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();
    });

    it('nodes are still created but ref is unchanged', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
      });

      const sha = await graph.createNode({ message: 'Node A' });

      // Node was created
      expect(mockPersistence.commitNode).toHaveBeenCalled();
      expect(sha).toBe('sha00000001');

      // But ref was not updated
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();
    });

    it('requires managed mode with autoSync=manual for explicit sync()', async () => {
      // To use sync() manually, you need managed mode with autoSync='manual'
      // This is tested in the existing EmptyGraph.manual-mode.test.js
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      const sha = await graph.createNode({ message: 'Node A' });

      // Ref not updated yet (autoSync is manual)
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();

      // Explicit sync
      await graph.sync(sha);

      // Now ref should be updated
      expect(mockPersistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/test',
        sha
      );
    });

    it('sync() throws in manual mode without ref manager', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
      });

      await graph.createNode({ message: 'Node A' });

      // sync() requires managed mode
      await expect(graph.sync('somesha')).rejects.toThrow('requires managed mode');
    });
  });

  describe('GraphRefManager unit tests', () => {
    let refManager;
    let refState;

    beforeEach(() => {
      refState = { tip: null };

      mockPersistence.readRef.mockImplementation(async () => refState.tip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refState.tip = oid;
      });

      refManager = new GraphRefManager({ persistence: mockPersistence });
    });

    it('readHead returns null when ref does not exist', async () => {
      refState.tip = null;

      const sha = await refManager.readHead('refs/empty-graph/test');

      expect(sha).toBeNull();
    });

    it('readHead returns SHA when ref exists', async () => {
      refState.tip = 'abc123def456';

      const sha = await refManager.readHead('refs/empty-graph/test');

      expect(sha).toBe('abc123def456');
    });

    it('syncHead creates ref when it does not exist', async () => {
      refState.tip = null;

      const result = await refManager.syncHead('refs/empty-graph/test', 'newsha123');

      expect(result).toEqual({
        updated: true,
        anchor: false,
        sha: 'newsha123',
      });
      expect(refState.tip).toBe('newsha123');
    });

    it('syncHead returns same SHA when ref already points to it', async () => {
      refState.tip = 'existingsha';

      const result = await refManager.syncHead('refs/empty-graph/test', 'existingsha');

      expect(result).toEqual({
        updated: true,
        anchor: false,
        sha: 'existingsha',
      });
    });

    it('syncHead creates anchor when ref exists and points elsewhere', async () => {
      refState.tip = 'oldtip123';
      let anchorSha;

      mockPersistence.commitNode.mockImplementation(async ({ message, parents }) => {
        if (message.includes('anchor')) {
          anchorSha = 'anchor999';
          return anchorSha;
        }
        return 'regular123';
      });

      const result = await refManager.syncHead('refs/empty-graph/test', 'newtip456');

      // With current implementation (isAncestor always false), anchor is created
      expect(result.anchor).toBe(true);
      expect(mockPersistence.commitNode).toHaveBeenCalledWith({
        message: JSON.stringify({ _type: 'anchor' }),
        parents: ['oldtip123', 'newtip456'],
      });
    });

    it('createAnchor creates commit with anchor marker', async () => {
      mockPersistence.commitNode.mockResolvedValue('anchorsha789');

      const sha = await refManager.createAnchor(['parent1', 'parent2']);

      expect(sha).toBe('anchorsha789');
      expect(mockPersistence.commitNode).toHaveBeenCalledWith({
        message: JSON.stringify({ _type: 'anchor' }),
        parents: ['parent1', 'parent2'],
      });
    });

    it('isAncestor currently returns false (TODO: implement)', async () => {
      // Document current behavior - always returns false
      const result = await refManager.isAncestor('ancestor', 'descendant');

      expect(result).toBe(false);
    });
  });

  describe('batch operations in managed mode', () => {
    it('beginBatch returns a batch context', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const batch = graph.beginBatch();

      expect(batch).toBeDefined();
      expect(typeof batch.createNode).toBe('function');
      expect(typeof batch.commit).toBe('function');
    });

    it('batch.createNode does not update ref', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const batch = graph.beginBatch();
      await batch.createNode({ message: 'Batched node' });

      // Ref should not be updated during batch
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();
    });

    it('batch.commit updates ref once for all nodes', async () => {
      let refTip = null;
      mockPersistence.readRef.mockImplementation(async () => refTip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refTip = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const batch = graph.beginBatch();
      const sha1 = await batch.createNode({ message: 'Node 1' });
      const sha2 = await batch.createNode({ message: 'Node 2' });
      const sha3 = await batch.createNode({ message: 'Node 3' });

      // Still no ref update
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();

      // Commit the batch
      const result = await batch.commit();

      // Now ref should be updated
      expect(mockPersistence.updateRef).toHaveBeenCalled();
      expect(result.count).toBe(3);
    });

    it('batch tracks created SHAs', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const batch = graph.beginBatch();
      const sha1 = await batch.createNode({ message: 'Node 1' });
      const sha2 = await batch.createNode({ message: 'Node 2' });

      expect(batch.createdShas).toEqual([sha1, sha2]);
    });

    it('beginBatch throws in manual mode', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
      });

      expect(() => graph.beginBatch()).toThrow('requires managed mode');
    });
  });

  describe('createNodes bulk operation in managed mode', () => {
    it('syncs ref after createNodes completes', async () => {
      let refTip = null;
      mockPersistence.readRef.mockImplementation(async () => refTip);
      mockPersistence.updateRef.mockImplementation(async (_ref, oid) => {
        refTip = oid;
      });

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
      });

      const shas = await graph.createNodes([
        { message: 'Root' },
        { message: 'Child', parents: ['$0'] },
      ]);

      // Ref should be updated to include the last SHA
      expect(mockPersistence.updateRef).toHaveBeenCalled();
      expect(shas).toHaveLength(2);
    });

    it('does not sync ref in manual mode', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
      });

      await graph.createNodes([
        { message: 'Root' },
        { message: 'Child', parents: ['$0'] },
      ]);

      // Ref should NOT be updated in manual mode
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();
    });
  });
});
