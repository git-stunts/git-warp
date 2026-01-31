import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock GitGraphAdapter to avoid loading @git-stunts/alfred which may not be available
vi.mock('../../../src/infrastructure/adapters/GitGraphAdapter.js', () => ({
  default: class MockGitGraphAdapter {},
}));

import EmptyGraph from '../../../index.js';

describe('EmptyGraph manual mode', () => {
  let mockPersistence;

  beforeEach(() => {
    let shaCounter = 0;
    mockPersistence = {
      commitNode: vi.fn().mockImplementation(async () => `sha-${shaCounter++}`),
      showNode: vi.fn().mockResolvedValue('node-content'),
      getNodeInfo: vi.fn().mockResolvedValue({
        sha: 'abc123',
        message: 'test message',
        author: 'Test Author',
        date: '2026-01-29 10:00:00 -0500',
        parents: [],
      }),
      nodeExists: vi.fn().mockResolvedValue(true),
      logNodesStream: vi.fn(),
      readRef: vi.fn().mockResolvedValue(null),
      updateRef: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('manual mode createNode does not update ref', () => {
    it('does not call updateRef when mode=manual and autoSync=manual', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
        autoSync: 'manual',
      });

      await graph.createNode({ message: 'test node' });

      // In manual mode, no ref update should occur
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();
    });

    it('creates the node successfully without ref management', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
        autoSync: 'manual',
      });

      const sha = await graph.createNode({ message: 'test node' });

      expect(sha).toBe('sha-0');
      expect(mockPersistence.commitNode).toHaveBeenCalledWith({
        message: 'test node',
        parents: [],
        sign: false,
      });
    });

    it('does not update ref even after multiple createNode calls', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
        autoSync: 'manual',
      });

      await graph.createNode({ message: 'node 1' });
      await graph.createNode({ message: 'node 2' });
      await graph.createNode({ message: 'node 3' });

      expect(mockPersistence.updateRef).not.toHaveBeenCalled();
    });
  });

  describe('sync() updates ref to specified SHA', () => {
    it('updates ref to specified SHA in managed mode with autoSync=manual', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      // Create nodes A and B
      const shaA = await graph.createNode({ message: 'Node A' });
      const shaB = await graph.createNode({ message: 'Node B', parents: [shaA] });

      // No ref updates should have happened yet (autoSync=manual)
      expect(mockPersistence.updateRef).not.toHaveBeenCalled();

      // Now sync to B's sha
      const result = await graph.sync(shaB);

      // Ref should now point to B (or an anchor including B)
      expect(result.updated).toBe(true);
      expect(mockPersistence.updateRef).toHaveBeenCalled();
      // The sha should be either shaB directly or an anchor that includes it
      expect(result.sha).toBeDefined();
    });

    it('returns anchor=false when ref did not exist', async () => {
      mockPersistence.readRef.mockResolvedValue(null);

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      const sha = await graph.createNode({ message: 'First node' });
      const result = await graph.sync(sha);

      expect(result.anchor).toBe(false);
      expect(result.sha).toBe(sha);
    });

    it('creates anchor when ref already points to different commit', async () => {
      // Ref already points to some other commit
      mockPersistence.readRef.mockResolvedValue('existing-tip-sha');

      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      const sha = await graph.createNode({ message: 'Disconnected node' });
      const result = await graph.sync(sha);

      // Should create an anchor since the new node is disconnected from existing tip
      expect(result.anchor).toBe(true);
      expect(result.updated).toBe(true);
    });
  });

  describe('sync() throws without managed mode', () => {
    it('throws error when called on graph created via constructor', async () => {
      // Create graph via constructor (not open()) - no managed mode
      const graph = new EmptyGraph({ persistence: mockPersistence });

      await expect(graph.sync('some-sha')).rejects.toThrow(
        'sync() requires managed mode. Use EmptyGraph.open() with mode="managed".'
      );
    });

    it('throws error when mode is manual', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'manual',
        autoSync: 'manual',
      });

      await expect(graph.sync('some-sha')).rejects.toThrow(
        'sync() requires managed mode. Use EmptyGraph.open() with mode="managed".'
      );
    });
  });

  describe('sync() throws without SHA argument', () => {
    it('throws error when called without sha argument', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      await expect(graph.sync()).rejects.toThrow('sha is required for sync()');
    });

    it('throws error when called with undefined sha', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      await expect(graph.sync(undefined)).rejects.toThrow('sha is required for sync()');
    });

    it('throws error when called with null sha', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      await expect(graph.sync(null)).rejects.toThrow('sha is required for sync()');
    });

    it('throws error when called with empty string sha', async () => {
      const graph = await EmptyGraph.open({
        persistence: mockPersistence,
        ref: 'refs/empty-graph/test',
        mode: 'managed',
        autoSync: 'manual',
      });

      await expect(graph.sync('')).rejects.toThrow('sha is required for sync()');
    });
  });
});
