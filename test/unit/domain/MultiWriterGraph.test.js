import { describe, it, expect, vi, beforeEach } from 'vitest';
import MultiWriterGraph from '../../../src/domain/MultiWriterGraph.js';
import PatchBuilder from '../../../src/domain/services/PatchBuilder.js';
import { PatchBuilderV2 } from '../../../src/domain/services/PatchBuilderV2.js';

import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage, encodeCheckpointMessage } from '../../../src/domain/services/WarpMessageCodec.js';

/**
 * Creates a mock persistence adapter for testing.
 * @returns {Object} Mock persistence adapter
 */
function createMockPersistence() {
  return {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn(),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  };
}

/**
 * Creates a mock patch commit structure for testing.
 * @param {Object} options
 * @param {string} options.sha - The commit SHA
 * @param {string} options.graphName - The graph name
 * @param {string} options.writerId - The writer ID
 * @param {number} options.lamport - The lamport timestamp
 * @param {string} options.patchOid - The patch blob OID
 * @param {Array} options.ops - The operations in the patch
 * @param {string|null} [options.parentSha] - The parent commit SHA
 * @returns {Object} Mock patch data for testing
 */
function createMockPatch({ sha, graphName, writerId, lamport, patchOid, ops, parentSha = null }) {
  const patch = {
    schema: 1,
    writer: writerId,
    lamport,
    ops,
  };
  const patchBuffer = encode(patch);
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    lamport,
    patchOid,
  });

  return {
    sha,
    patchOid,
    patchBuffer,
    message,
    parentSha,
    nodeInfo: {
      sha,
      message,
      author: 'Test <test@example.com>',
      date: new Date().toISOString(),
      parents: parentSha ? [parentSha] : [],
    },
  };
}

describe('MultiWriterGraph', () => {
  describe('open', () => {
    it('creates a graph instance with valid parameters', async () => {
      const persistence = createMockPersistence();

      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      expect(graph).toBeInstanceOf(MultiWriterGraph);
      expect(graph.graphName).toBe('events');
      expect(graph.writerId).toBe('node-1');
      expect(graph.persistence).toBe(persistence);
    });

    it('rejects invalid graph name', async () => {
      const persistence = createMockPersistence();

      await expect(
        MultiWriterGraph.open({
          persistence,
          graphName: '../etc',
          writerId: 'node-1',
        })
      ).rejects.toThrow('path traversal');
    });

    it('rejects empty graph name', async () => {
      const persistence = createMockPersistence();

      await expect(
        MultiWriterGraph.open({
          persistence,
          graphName: '',
          writerId: 'node-1',
        })
      ).rejects.toThrow('cannot be empty');
    });

    it('rejects invalid writer ID', async () => {
      const persistence = createMockPersistence();

      await expect(
        MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node/1',
        })
      ).rejects.toThrow('forward slash');
    });

    it('rejects empty writer ID', async () => {
      const persistence = createMockPersistence();

      await expect(
        MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: '',
        })
      ).rejects.toThrow('cannot be empty');
    });

    it('rejects missing persistence', async () => {
      await expect(
        MultiWriterGraph.open({
          persistence: null,
          graphName: 'events',
          writerId: 'node-1',
        })
      ).rejects.toThrow('persistence is required');
    });

    it('accepts valid graph names', async () => {
      const persistence = createMockPersistence();
      const validNames = ['events', 'my-graph', 'Graph_v2', 'team/shared'];

      for (const graphName of validNames) {
        const graph = await MultiWriterGraph.open({
          persistence,
          graphName,
          writerId: 'node-1',
        });
        expect(graph.graphName).toBe(graphName);
      }
    });

    it('accepts valid writer IDs', async () => {
      const persistence = createMockPersistence();
      const validIds = ['node-1', 'writer_01', 'Producer.v2', 'a'];

      for (const writerId of validIds) {
        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId,
        });
        expect(graph.writerId).toBe(writerId);
      }
    });
  });

  describe('createPatch', () => {
    it('returns a PatchBuilder instance', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const patchBuilder = graph.createPatch();

      expect(patchBuilder).toBeInstanceOf(PatchBuilder);
    });

    it('creates a PatchBuilder with correct configuration', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'my-events',
        writerId: 'writer-42',
      });

      // Set up mock responses for commit
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('a'.repeat(40));
      persistence.writeTree.mockResolvedValue('a'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('a'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const patchBuilder = graph.createPatch();
      patchBuilder.addNode('test');
      await patchBuilder.commit();

      // Verify the ref was updated with correct graph/writer path
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/my-events/writers/writer-42',
        expect.any(String)
      );
    });
  });

  describe('discoverWriters', () => {
    it('returns sorted array of writer IDs from refs', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([
        'refs/empty-graph/events/writers/writer-b',
        'refs/empty-graph/events/writers/writer-a',
      ]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual(['writer-a', 'writer-b']);
      expect(persistence.listRefs).toHaveBeenCalledWith('refs/empty-graph/events/writers/');
    });

    it('returns empty array when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual([]);
    });

    it('filters out invalid writer IDs from refs', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([
        'refs/empty-graph/events/writers/valid-writer',
        'refs/empty-graph/events/checkpoints/head', // Not a writer ref
      ]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual(['valid-writer']);
    });
  });

  describe('materialize', () => {
    it('returns empty state when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([]);

      const state = await graph.materialize();

      expect(state.nodeAlive).toBeInstanceOf(Map);
      expect(state.edgeAlive).toBeInstanceOf(Map);
      expect(state.prop).toBeInstanceOf(Map);
      expect(state.nodeAlive.size).toBe(0);
    });

    it('materializes state from single writer', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const patchOid = 'a'.repeat(40);
      const commitSha = 'b'.repeat(40);

      // Create a patch that adds a node
      const mockPatch = createMockPatch({
        sha: commitSha,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid,
        ops: [{ type: 'NodeAdd', node: 'user:alice' }],
        parentSha: null,
      });

      persistence.listRefs.mockResolvedValue(['refs/empty-graph/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(commitSha);
      persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
      persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

      const state = await graph.materialize();

      expect(state.nodeAlive.has('user:alice')).toBe(true);
      expect(state.nodeAlive.get('user:alice').value).toBe(true);
    });

    it('materializes state from multiple writers', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const patchOid1 = 'a'.repeat(40);
      const commitSha1 = 'b'.repeat(40);
      const patchOid2 = 'c'.repeat(40);
      const commitSha2 = 'd'.repeat(40);

      // Create patches for two writers
      const mockPatch1 = createMockPatch({
        sha: commitSha1,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: patchOid1,
        ops: [{ type: 'NodeAdd', node: 'user:alice' }],
        parentSha: null,
      });

      const mockPatch2 = createMockPatch({
        sha: commitSha2,
        graphName: 'events',
        writerId: 'writer-2',
        lamport: 1,
        patchOid: patchOid2,
        ops: [{ type: 'NodeAdd', node: 'user:bob' }],
        parentSha: null,
      });

      persistence.listRefs.mockResolvedValue([
        'refs/empty-graph/events/writers/writer-1',
        'refs/empty-graph/events/writers/writer-2',
      ]);

      // materialize() now checks for checkpoint first, then reads writer tips
      persistence.readRef
        .mockResolvedValueOnce(null)       // checkpoint ref (none)
        .mockResolvedValueOnce(commitSha1) // writer-1 tip
        .mockResolvedValueOnce(commitSha2); // writer-2 tip

      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch1.nodeInfo)
        .mockResolvedValueOnce(mockPatch2.nodeInfo);

      persistence.readBlob
        .mockResolvedValueOnce(mockPatch1.patchBuffer)
        .mockResolvedValueOnce(mockPatch2.patchBuffer);

      const state = await graph.materialize();

      expect(state.nodeAlive.has('user:alice')).toBe(true);
      expect(state.nodeAlive.has('user:bob')).toBe(true);
    });

    it('materializes chain of patches from single writer', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const patchOid1 = 'a'.repeat(40);
      const commitSha1 = 'b'.repeat(40);
      const patchOid2 = 'c'.repeat(40);
      const commitSha2 = 'd'.repeat(40);

      // Create two patches in a chain
      const mockPatch1 = createMockPatch({
        sha: commitSha1,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: patchOid1,
        ops: [{ type: 'NodeAdd', node: 'user:alice' }],
        parentSha: null,
      });

      const mockPatch2 = createMockPatch({
        sha: commitSha2,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 2,
        patchOid: patchOid2,
        ops: [{ type: 'NodeAdd', node: 'user:bob' }],
        parentSha: commitSha1,
      });

      persistence.listRefs.mockResolvedValue(['refs/empty-graph/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(commitSha2); // tip is the second commit

      // getNodeInfo is called for each commit in the chain (newest first)
      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch2.nodeInfo) // First call for tip
        .mockResolvedValueOnce(mockPatch1.nodeInfo); // Second call for parent

      persistence.readBlob
        .mockResolvedValueOnce(mockPatch2.patchBuffer)
        .mockResolvedValueOnce(mockPatch1.patchBuffer);

      const state = await graph.materialize();

      expect(state.nodeAlive.has('user:alice')).toBe(true);
      expect(state.nodeAlive.has('user:bob')).toBe(true);
    });

    it('returns empty state when writer ref returns null', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue(['refs/empty-graph/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(null);

      const state = await graph.materialize();

      expect(state.nodeAlive.size).toBe(0);
    });
  });

  describe('materializeAt', () => {
    it('calls materializeIncremental with correct parameters', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const checkpointSha = 'a'.repeat(40);
      const writerTipSha = 'b'.repeat(40);
      const indexOid = 'e'.repeat(40);

      // Mock checkpoint data
      const checkpointMessage = `empty-graph:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-state-hash: ${'c'.repeat(64)}
eg-frontier-oid: ${'d'.repeat(40)}
eg-index-oid: ${indexOid}
eg-schema: 1`;

      persistence.listRefs.mockResolvedValue(['refs/empty-graph/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(writerTipSha);
      persistence.showNode.mockResolvedValue(checkpointMessage);
      persistence.getNodeInfo.mockResolvedValue({
        sha: checkpointSha,
        message: checkpointMessage,
        parents: [],
      });

      // Mock tree read for checkpoint
      persistence.readTreeOids.mockResolvedValue({
        'state.cbor': 'f'.repeat(40),
        'frontier.cbor': 'g'.repeat(40),
      });

      // Mock blobs - state and frontier
      const stateData = { nodes: [], edges: [], props: [] };
      const frontierData = { 'writer-1': writerTipSha };

      persistence.readBlob
        .mockResolvedValueOnce(encode(frontierData)) // frontier.cbor
        .mockResolvedValueOnce(encode(stateData)); // state.cbor

      const state = await graph.materializeAt(checkpointSha);

      // Verify state is returned (even if empty since no new patches)
      expect(state).toBeDefined();
      expect(state.nodeAlive).toBeInstanceOf(Map);
    });
  });

  describe('property accessors', () => {
    it('exposes graphName', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'my-graph',
        writerId: 'node-1',
      });

      expect(graph.graphName).toBe('my-graph');
    });

    it('exposes writerId', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'my-writer',
      });

      expect(graph.writerId).toBe('my-writer');
    });

    it('exposes persistence', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      expect(graph.persistence).toBe(persistence);
    });
  });

  describe('syncCoverage', () => {
    it('creates anchor with correct parents', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      // Mock discoverWriters to return multiple writers
      const writer1Sha = 'a'.repeat(40);
      const writer2Sha = 'b'.repeat(40);
      const anchorSha = 'c'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);

      persistence.readRef
        .mockResolvedValueOnce(writer1Sha) // writer-1 ref
        .mockResolvedValueOnce(writer2Sha); // writer-2 ref
      persistence.commitNode.mockResolvedValue(anchorSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.syncCoverage();

      // Verify commitNode was called with both parents
      expect(persistence.commitNode).toHaveBeenCalledWith({
        message: expect.stringContaining('empty-graph:anchor'),
        parents: [writer1Sha, writer2Sha],
      });
    });

    it('updates coverage ref', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const anchorSha = 'c'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.commitNode.mockResolvedValue(anchorSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.syncCoverage();

      // Verify updateRef was called with the correct coverage ref
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/events/coverage/head',
        anchorSha
      );
    });

    it('does nothing when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue([]);

      await graph.syncCoverage();

      // Should not call commitNode or updateRef
      expect(persistence.commitNode).not.toHaveBeenCalled();
      expect(persistence.updateRef).not.toHaveBeenCalled();
    });

    it('does nothing when all writer refs return null', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);

      persistence.readRef.mockResolvedValue(null); // All refs return null

      await graph.syncCoverage();

      // Should not call commitNode or updateRef
      expect(persistence.commitNode).not.toHaveBeenCalled();
      expect(persistence.updateRef).not.toHaveBeenCalled();
    });

    it('only includes writers with existing refs as parents', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const anchorSha = 'c'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);

      persistence.readRef
        .mockResolvedValueOnce(writerSha) // writer-1 has a ref
        .mockResolvedValueOnce(null);      // writer-2 does not
      persistence.commitNode.mockResolvedValue(anchorSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.syncCoverage();

      // Verify commitNode was called with only writer-1's SHA
      expect(persistence.commitNode).toHaveBeenCalledWith({
        message: expect.stringContaining('empty-graph:anchor'),
        parents: [writerSha],
      });
    });
  });

  describe('createCheckpoint', () => {
    it('creates valid checkpoint', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      vi.spyOn(graph, 'materialize').mockResolvedValue({
        nodeAlive: new Map(),
        edgeAlive: new Map(),
        prop: new Map(),
      });

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
      // Verify commitNodeWithTree was called with correct parents
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [writerSha],
          message: expect.stringContaining('empty-graph:checkpoint'),
        })
      );
    });

    it('updates checkpoint ref', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      vi.spyOn(graph, 'materialize').mockResolvedValue({
        nodeAlive: new Map(),
        edgeAlive: new Map(),
        prop: new Map(),
      });

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.createCheckpoint();

      // Verify updateRef was called with the correct checkpoint ref
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/events/checkpoints/head',
        checkpointSha
      );
    });

    it('returns checkpoint SHA', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'f'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      vi.spyOn(graph, 'materialize').mockResolvedValue({
        nodeAlive: new Map(),
        edgeAlive: new Map(),
        prop: new Map(),
      });

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
    });

    it('builds frontier from all writer tips', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const writer1Sha = 'a'.repeat(40);
      const writer2Sha = 'b'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);
      vi.spyOn(graph, 'materialize').mockResolvedValue({
        nodeAlive: new Map(),
        edgeAlive: new Map(),
        prop: new Map(),
      });

      persistence.readRef
        .mockResolvedValueOnce(writer1Sha)
        .mockResolvedValueOnce(writer2Sha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.createCheckpoint();

      // Verify checkpoint was created with both parents
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [writer1Sha, writer2Sha],
        })
      );
    });

    it('creates checkpoint with empty frontier when no writers have refs', async () => {
      const persistence = createMockPersistence();
      const graph = await MultiWriterGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      vi.spyOn(graph, 'materialize').mockResolvedValue({
        nodeAlive: new Map(),
        edgeAlive: new Map(),
        prop: new Map(),
      });

      persistence.readRef.mockResolvedValue(null); // No refs exist
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
      // Verify checkpoint was created with empty parents
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [],
        })
      );
    });
  });

  describe('schema version selection (WARP v5)', () => {
    describe('createPatch with schema selection', () => {
      it('schema 1 (default) uses PatchBuilder', async () => {
        const persistence = createMockPersistence();
        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const patchBuilder = graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilder);
      });

      it('schema 1 (explicit) uses PatchBuilder', async () => {
        const persistence = createMockPersistence();
        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 1,
        });

        const patchBuilder = graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilder);
      });

      it('schema 2 uses PatchBuilderV2', async () => {
        const persistence = createMockPersistence();
        // No writers, no checkpoint - fresh graph
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const patchBuilder = graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilderV2);
      });
    });

    describe('migration boundary validation', () => {
      it('throws error if schema:2 with v1 history and no migration checkpoint', async () => {
        const persistence = createMockPersistence();

        // Setup: There's a writer with schema:1 patches, but no migration checkpoint
        const patchOid = 'a'.repeat(40);
        const commitSha = 'b'.repeat(40);
        const mockPatch = createMockPatch({
          sha: commitSha,
          graphName: 'events',
          writerId: 'writer-1',
          lamport: 1,
          patchOid,
          ops: [{ type: 'NodeAdd', node: 'user:alice' }],
          parentSha: null,
        });

        persistence.listRefs.mockResolvedValue(['refs/empty-graph/events/writers/writer-1']);
        persistence.readRef.mockImplementation((ref) => {
          if (ref === 'refs/empty-graph/events/checkpoints/head') {
            return Promise.resolve(null); // No checkpoint
          }
          return Promise.resolve(commitSha); // Writer has patches
        });
        persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
        persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

        await expect(
          MultiWriterGraph.open({
            persistence,
            graphName: 'events',
            writerId: 'node-1',
            schema: 2,
          })
        ).rejects.toThrow('Cannot open schema:2 graph with v1 history');
      });

      it('allows schema:2 when checkpoint has schema:2', async () => {
        const persistence = createMockPersistence();

        const checkpointSha = 'c'.repeat(40);
        const indexOid = 'd'.repeat(40);

        // Checkpoint with schema:2 exists
        const checkpointMessage = encodeCheckpointMessage({
          graph: 'events',
          stateHash: 'e'.repeat(64),
          frontierOid: 'f'.repeat(40),
          indexOid,
          schema: 2,
        });

        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockImplementation((ref) => {
          if (ref === 'refs/empty-graph/events/checkpoints/head') {
            return Promise.resolve(checkpointSha);
          }
          return Promise.resolve(null);
        });
        persistence.showNode.mockResolvedValue(checkpointMessage);
        persistence.getNodeInfo.mockResolvedValue({
          sha: checkpointSha,
          message: checkpointMessage,
          parents: [],
        });
        persistence.readTreeOids.mockResolvedValue({
          'state.cbor': 'g'.repeat(40),
          'frontier.cbor': 'h'.repeat(40),
        });
        persistence.readBlob
          .mockResolvedValueOnce(encode({})) // frontier
          .mockResolvedValueOnce(encode({ nodes: [], edges: [], props: [] })); // state

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        expect(graph).toBeInstanceOf(MultiWriterGraph);
      });

      it('allows schema:2 on fresh graph with no history', async () => {
        const persistence = createMockPersistence();

        // No writers, no checkpoint
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        expect(graph).toBeInstanceOf(MultiWriterGraph);
      });

      it('schema:1 does not validate migration boundary', async () => {
        const persistence = createMockPersistence();

        // Even with v1 patches, schema:1 should work
        const patchOid = 'a'.repeat(40);
        const commitSha = 'b'.repeat(40);
        const mockPatch = createMockPatch({
          sha: commitSha,
          graphName: 'events',
          writerId: 'writer-1',
          lamport: 1,
          patchOid,
          ops: [{ type: 'NodeAdd', node: 'user:alice' }],
          parentSha: null,
        });

        persistence.listRefs.mockResolvedValue(['refs/empty-graph/events/writers/writer-1']);
        persistence.readRef.mockResolvedValue(commitSha);
        persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
        persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

        // Should not throw for schema:1
        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 1,
        });

        expect(graph).toBeInstanceOf(MultiWriterGraph);
      });
    });
  });

  describe('backfill rejection and divergence detection', () => {
    describe('_isAncestor', () => {
      it('returns true when ancestorSha equals descendantSha', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const sha = 'a'.repeat(40);
        const result = await graph._isAncestor(sha, sha);

        expect(result).toBe(true);
      });

      it('returns true when ancestorSha is parent of descendantSha', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const ancestorSha = 'a'.repeat(40);
        const descendantSha = 'b'.repeat(40);

        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: descendantSha,
          parents: [ancestorSha],
        });

        const result = await graph._isAncestor(ancestorSha, descendantSha);

        expect(result).toBe(true);
      });

      it('returns true for multi-hop ancestor relationship', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const ancestorSha = 'a'.repeat(40);
        const middleSha = 'b'.repeat(40);
        const descendantSha = 'c'.repeat(40);

        persistence.getNodeInfo
          .mockResolvedValueOnce({ sha: descendantSha, parents: [middleSha] })
          .mockResolvedValueOnce({ sha: middleSha, parents: [ancestorSha] });

        const result = await graph._isAncestor(ancestorSha, descendantSha);

        expect(result).toBe(true);
      });

      it('returns false when not an ancestor', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const sha1 = 'a'.repeat(40);
        const sha2 = 'b'.repeat(40);

        // sha2 has no parents - end of chain
        persistence.getNodeInfo.mockResolvedValue({
          sha: sha2,
          parents: [],
        });

        const result = await graph._isAncestor(sha1, sha2);

        expect(result).toBe(false);
      });

      it('returns false for null inputs', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        expect(await graph._isAncestor(null, 'a'.repeat(40))).toBe(false);
        expect(await graph._isAncestor('a'.repeat(40), null)).toBe(false);
        expect(await graph._isAncestor(null, null)).toBe(false);
      });
    });

    describe('_relationToCheckpointHead', () => {
      it('returns "same" when shas are equal', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const sha = 'a'.repeat(40);
        const result = await graph._relationToCheckpointHead(sha, sha);

        expect(result).toBe('same');
      });

      it('returns "ahead" when incoming extends checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);

        // incoming has ckHead as parent (incoming is ahead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [ckHead],
        });

        const result = await graph._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('ahead');
      });

      it('returns "behind" when incoming is ancestor of checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const incomingSha = 'a'.repeat(40);
        const ckHead = 'b'.repeat(40);

        // First call for _isAncestor(ckHead, incomingSha) - false
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - true
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [incomingSha],
        });

        const result = await graph._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('behind');
      });

      it('returns "diverged" when neither is ancestor of the other', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);
        const commonAncestor = 'c'.repeat(40);

        // First call for _isAncestor(ckHead, incomingSha) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });

        const result = await graph._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('diverged');
      });
    });

    describe('_validatePatchAgainstCheckpoint', () => {
      it('does not throw for schema:1 checkpoint', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const checkpoint = { schema: 1, frontier: new Map() };

        // Should not throw
        await expect(
          graph._validatePatchAgainstCheckpoint('writer-1', 'a'.repeat(40), checkpoint)
        ).resolves.toBeUndefined();
      });

      it('does not throw when writer not in checkpoint frontier', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const checkpoint = {
          schema: 2,
          frontier: new Map([['other-writer', 'b'.repeat(40)]]),
        };

        // writer-1 not in checkpoint - should succeed
        await expect(
          graph._validatePatchAgainstCheckpoint('writer-1', 'a'.repeat(40), checkpoint)
        ).resolves.toBeUndefined();
      });

      it('allows patch ahead of checkpoint frontier', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);

        const checkpoint = {
          schema: 2,
          frontier: new Map([['writer-1', ckHead]]),
        };

        // incoming has ckHead as parent (ahead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [ckHead],
        });

        await expect(
          graph._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).resolves.toBeUndefined();
      });

      it('rejects patch same as checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const sha = 'a'.repeat(40);

        const checkpoint = {
          schema: 2,
          frontier: new Map([['writer-1', sha]]),
        };

        await expect(
          graph._validatePatchAgainstCheckpoint('writer-1', sha, checkpoint)
        ).rejects.toThrow('Backfill rejected for writer writer-1: incoming patch is same checkpoint frontier');
      });

      it('rejects patch behind checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const incomingSha = 'a'.repeat(40);
        const ckHead = 'b'.repeat(40);

        const checkpoint = {
          schema: 2,
          frontier: new Map([['writer-1', ckHead]]),
        };

        // First call for _isAncestor(ckHead, incomingSha) - false
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - true (incoming is parent of ckHead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [incomingSha],
        });

        await expect(
          graph._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).rejects.toThrow('Backfill rejected for writer writer-1: incoming patch is behind checkpoint frontier');
      });

      it('rejects diverged patch (fork) with different error', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await MultiWriterGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        });

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);
        const commonAncestor = 'c'.repeat(40);

        const checkpoint = {
          schema: 2,
          frontier: new Map([['writer-1', ckHead]]),
        };

        // First call for _isAncestor(ckHead, incomingSha) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });
        // Second call for _isAncestor(incomingSha, ckHead) - walks to commonAncestor
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: ckHead,
          parents: [commonAncestor],
        });
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: commonAncestor,
          parents: [],
        });

        await expect(
          graph._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).rejects.toThrow('Writer fork detected for writer-1: incoming patch does not extend checkpoint head');
      });
    });
  });
});
