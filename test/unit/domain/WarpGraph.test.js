import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { PatchBuilderV2 } from '../../../src/domain/services/PatchBuilderV2.js';

import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage, encodeCheckpointMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createEmptyStateV5 } from '../../../src/domain/services/JoinReducer.js';
import { createORSet, orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';
import { serializeFullStateV5, serializeAppliedVV, computeAppliedVV } from '../../../src/domain/services/CheckpointSerializerV5.js';
import { serializeFrontier } from '../../../src/domain/services/Frontier.js';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

/**
 * Creates a mock persistence adapter for testing.
 * @returns {any} Mock persistence adapter
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
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock patch commit structure for testing.
 * @param {object} options
 * @param {string} options.sha - The commit SHA
 * @param {string} options.graphName - The graph name
 * @param {string} options.writerId - The writer ID
 * @param {number} options.lamport - The lamport timestamp
 * @param {string} options.patchOid - The patch blob OID
 * @param {any[]} options.ops - The operations in the patch (schema:2 format with dots)
 * @param {string|null} [options.parentSha] - The parent commit SHA
 * @param {any} [options.context] - The context VV for schema:2 patches
 * @returns {any} Mock patch data for testing
 */
function createMockPatch({ sha, graphName, writerId, lamport, patchOid, ops, parentSha = null, context = null }) {
  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    context: context || { [writerId]: lamport },
    ops,
  };
  const patchBuffer = encode(patch);
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    lamport,
    patchOid,
    schema: 2,
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

describe('WarpGraph', () => {
  describe('open', () => {
    it('creates a graph instance with valid parameters', async () => {
      const persistence = createMockPersistence();

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      expect(graph).toBeInstanceOf(WarpGraph);
      expect(graph.graphName).toBe('events');
      expect(graph.writerId).toBe('node-1');
      expect(graph.persistence).toBe(persistence);
    });

    it('rejects invalid graph name', async () => {
      const persistence = createMockPersistence();

      await expect(
        WarpGraph.open({
          persistence,
          graphName: '../etc',
          writerId: 'node-1',
        })
      ).rejects.toThrow('path traversal');
    });

    it('rejects empty graph name', async () => {
      const persistence = createMockPersistence();

      await expect(
        WarpGraph.open({
          persistence,
          graphName: '',
          writerId: 'node-1',
        })
      ).rejects.toThrow('cannot be empty');
    });

    it('rejects invalid writer ID', async () => {
      const persistence = createMockPersistence();

      await expect(
        WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node/1',
        })
      ).rejects.toThrow('forward slash');
    });

    it('rejects empty writer ID', async () => {
      const persistence = createMockPersistence();

      await expect(
        WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: '',
        })
      ).rejects.toThrow('cannot be empty');
    });

    it('rejects missing persistence', async () => {
      await expect(
        WarpGraph.open(/** @type {any} */ ({
          persistence: null,
          graphName: 'events',
          writerId: 'node-1',
        }))
      ).rejects.toThrow('persistence is required');
    });

    it('accepts valid graph names', async () => {
      const persistence = createMockPersistence();
      const validNames = ['events', 'my-graph', 'Graph_v2', 'team/shared'];

      for (const graphName of validNames) {
        const graph = await WarpGraph.open({
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
        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId,
        });
        expect(graph.writerId).toBe(writerId);
      }
    });
  });

  describe('createPatch', () => {
    it('returns a PatchBuilderV2 instance for schema:2 (default)', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const patchBuilder = await graph.createPatch();

      expect(patchBuilder).toBeInstanceOf(PatchBuilderV2);
    });

    it('creates a PatchBuilderV2 with correct configuration', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'my-events',
        writerId: 'writer-42',
        schema: 2,
      }));

      // Set up mock responses for commit
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('a'.repeat(40));
      persistence.writeTree.mockResolvedValue('a'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('a'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const patchBuilder = await graph.createPatch();
      patchBuilder.addNode('test');
      await patchBuilder.commit();

      // Verify the ref was updated with correct graph/writer path
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/warp/my-events/writers/writer-42',
        expect.any(String)
      );
    });

    it('uses correct lamport from existing writer ref (first commit)', async () => {
      const persistence = createMockPersistence();
      // No existing ref - first commit
      persistence.readRef.mockResolvedValue(null);

      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        schema: 2,
      }));

      const patchBuilder = await graph.createPatch();

      // First commit should have lamport 1
      expect(patchBuilder._lamport).toBe(1);
    });

    it('uses correct lamport from existing writer ref (continuing)', async () => {
      const persistence = createMockPersistence();
      const existingSha = 'd'.repeat(40);
      const existingPatchOid = 'e'.repeat(40);

      // During open(): checkpoint check returns null
      // During createPatch(): _nextLamport calls readRef(writerRef) which returns existingSha
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref.includes('checkpoints')) return Promise.resolve(null);
        if (ref.includes('writers')) return Promise.resolve(existingSha);
        return Promise.resolve(null);
      });

      persistence.listRefs.mockResolvedValue([]);

      persistence.showNode.mockResolvedValue(
        `warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: 7\neg-patch-oid: ${existingPatchOid}\neg-schema: 2`
      );

      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        schema: 2,
      }));

      const patchBuilder = await graph.createPatch();

      // Should be 7 + 1 = 8
      expect(patchBuilder._lamport).toBe(8);
    });

    it('throws error on malformed lamport trailer', async () => {
      const persistence = createMockPersistence();
      const existingSha = 'd'.repeat(40);

      // During open(): checkpoint check returns null, listRefs returns []
      // During createPatch(): _nextLamport calls readRef(writerRef)
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref.includes('checkpoints')) return Promise.resolve(null);
        if (ref.includes('writers')) return Promise.resolve(existingSha);
        return Promise.resolve(null);
      });

      persistence.listRefs.mockResolvedValue([]);

      // Malformed message - eg-lamport has non-integer value
      persistence.showNode.mockResolvedValue(
        'warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: not-a-number\neg-patch-oid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\neg-schema: 2'
      );

      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        schema: 2,
      }));

      await expect(graph.createPatch()).rejects.toThrow(/Failed to parse lamport/);
    });
  });

  describe('discoverWriters', () => {
    it('returns sorted array of writer IDs from refs', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([
        'refs/warp/events/writers/writer-b',
        'refs/warp/events/writers/writer-a',
      ]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual(['writer-a', 'writer-b']);
      expect(persistence.listRefs).toHaveBeenCalledWith('refs/warp/events/writers/');
    });

    it('returns empty array when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      persistence.listRefs.mockResolvedValue([
        'refs/warp/events/writers/valid-writer',
        'refs/warp/events/checkpoints/head', // Not a writer ref
      ]);

      const writers = await graph.discoverWriters();

      expect(writers).toEqual(['valid-writer']);
    });
  });

  describe('materialize', () => {
    it('returns empty state when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      }));

      persistence.listRefs.mockResolvedValue([]);

      const state = /** @type {any} */ (await graph.materialize());

      expect(state.nodeAlive).toBeDefined();
      expect(state.edgeAlive).toBeDefined();
      expect(state.prop).toBeInstanceOf(Map);
    });

    it('materializes state from single writer', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      }));

      const patchOid = 'a'.repeat(40);
      const commitSha = 'b'.repeat(40);

      // Create a patch that adds a node (schema:2 format with dot)
      const mockPatch = createMockPatch({
        sha: commitSha,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: 'writer-1:1' }],
        parentSha: null,
      });

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(commitSha);
      persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
      persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

      const state = /** @type {any} */ (await graph.materialize());

      // V5 state uses ORSet - check using ORSet API
      expect(state.nodeAlive.entries.has('user:alice')).toBe(true);
    });

    it('materializes state from multiple writers', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      }));

      const patchOid1 = 'a'.repeat(40);
      const commitSha1 = 'b'.repeat(40);
      const patchOid2 = 'c'.repeat(40);
      const commitSha2 = 'd'.repeat(40);

      // Create patches for two writers (schema:2 format with dots)
      const mockPatch1 = createMockPatch({
        sha: commitSha1,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: patchOid1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: 'writer-1:1' }],
        parentSha: null,
      });

      const mockPatch2 = createMockPatch({
        sha: commitSha2,
        graphName: 'events',
        writerId: 'writer-2',
        lamport: 1,
        patchOid: patchOid2,
        ops: [{ type: 'NodeAdd', node: 'user:bob', dot: 'writer-2:1' }],
        parentSha: null,
      });

      persistence.listRefs.mockResolvedValue([
        'refs/warp/events/writers/writer-1',
        'refs/warp/events/writers/writer-2',
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

      const state = /** @type {any} */ (await graph.materialize());

      // V5 state uses ORSet
      expect(state.nodeAlive.entries.has('user:alice')).toBe(true);
      expect(state.nodeAlive.entries.has('user:bob')).toBe(true);
    });

    it('materializes chain of patches from single writer', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      }));

      const patchOid1 = 'a'.repeat(40);
      const commitSha1 = 'b'.repeat(40);
      const patchOid2 = 'c'.repeat(40);
      const commitSha2 = 'd'.repeat(40);

      // Create two patches in a chain (schema:2 format with dots)
      const mockPatch1 = createMockPatch({
        sha: commitSha1,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: patchOid1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: 'writer-1:1' }],
        parentSha: null,
      });

      const mockPatch2 = createMockPatch({
        sha: commitSha2,
        graphName: 'events',
        writerId: 'writer-1',
        lamport: 2,
        patchOid: patchOid2,
        ops: [{ type: 'NodeAdd', node: 'user:bob', dot: 'writer-1:2' }],
        parentSha: commitSha1,
        context: { 'writer-1': 2 },
      });

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(commitSha2); // tip is the second commit

      // getNodeInfo is called for each commit in the chain (newest first)
      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch2.nodeInfo) // First call for tip
        .mockResolvedValueOnce(mockPatch1.nodeInfo); // Second call for parent

      persistence.readBlob
        .mockResolvedValueOnce(mockPatch2.patchBuffer)
        .mockResolvedValueOnce(mockPatch1.patchBuffer);

      const state = /** @type {any} */ (await graph.materialize());

      // V5 state uses ORSet
      expect(state.nodeAlive.entries.has('user:alice')).toBe(true);
      expect(state.nodeAlive.entries.has('user:bob')).toBe(true);
    });

    it('returns empty state when writer ref returns null', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open(/** @type {any} */ ({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        schema: 2,
      }));

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(null);

      const state = /** @type {any} */ (await graph.materialize());

      // V5 state uses ORSet
      expect(state.nodeAlive.entries.size).toBe(0);
    });
  });

  describe('materializeAt', () => {
    it('calls materializeIncremental with correct parameters', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
      });

      const checkpointSha = 'a'.repeat(40);
      const writerTipSha = 'b'.repeat(40);
      const indexOid = 'e'.repeat(40);
      const stateBlobOid = 'f'.repeat(40);
      const frontierBlobOid = 'g'.repeat(40);
      const appliedVVBlobOid = 'h'.repeat(40);

      // Mock checkpoint data (schema:2 required)
      const checkpointMessage = `warp:checkpoint

eg-kind: checkpoint
eg-graph: events
eg-state-hash: ${'c'.repeat(64)}
eg-frontier-oid: ${'d'.repeat(40)}
eg-index-oid: ${indexOid}
eg-schema: 2`;

      persistence.listRefs.mockResolvedValue(['refs/warp/events/writers/writer-1']);
      persistence.readRef.mockResolvedValue(writerTipSha);
      persistence.showNode.mockResolvedValue(checkpointMessage);
      persistence.getNodeInfo.mockResolvedValue({
        sha: checkpointSha,
        message: checkpointMessage,
        parents: [],
      });

      // Mock tree read for checkpoint (schema:2 tree structure)
      persistence.readTreeOids.mockResolvedValue({
        'state.cbor': stateBlobOid,
        'frontier.cbor': frontierBlobOid,
        'appliedVV.cbor': appliedVVBlobOid,
      });

      // Create V5 state for mock
      const v5State = createEmptyStateV5();
      const stateBuffer = serializeFullStateV5(v5State);
      const frontierBuffer = serializeFrontier(new Map([['writer-1', writerTipSha]]));
      const appliedVV = computeAppliedVV(v5State);
      const appliedVVBuffer = serializeAppliedVV(appliedVV);

      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === frontierBlobOid) return Promise.resolve(frontierBuffer);
        if (oid === stateBlobOid) return Promise.resolve(stateBuffer);
        if (oid === appliedVVBlobOid) return Promise.resolve(appliedVVBuffer);
        throw new Error(`Unknown oid: ${oid}`);
      });

      const state = await graph.materializeAt(checkpointSha);

      // Verify V5 state is returned
      expect(state).toBeDefined();
      expect(state.nodeAlive).toBeDefined();
      expect(state.nodeAlive.entries).toBeDefined(); // V5 ORSet has entries property
    });
  });

  describe('property accessors', () => {
    it('exposes graphName', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'my-graph',
        writerId: 'node-1',
      });

      expect(graph.graphName).toBe('my-graph');
    });

    it('exposes writerId', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'my-writer',
      });

      expect(graph.writerId).toBe('my-writer');
    });

    it('exposes persistence', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
        message: expect.stringContaining('warp:anchor'),
        parents: [writer1Sha, writer2Sha],
      });
    });

    it('updates coverage ref', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
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
        'refs/warp/events/coverage/head',
        anchorSha
      );
    });

    it('does nothing when no writers exist', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
        message: expect.stringContaining('warp:anchor'),
        parents: [writerSha],
      });
    });
  });

  describe('createCheckpoint', () => {
    it('creates valid checkpoint', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      // Mock materialize to return V5 state (with ORSet structure)
      vi.spyOn(graph, 'materialize').mockResolvedValue(createEmptyStateV5());

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
          message: expect.stringContaining('warp:checkpoint'),
        })
      );
    });

    it('updates checkpoint ref', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      // Mock materialize to return V5 state (with ORSet structure)
      vi.spyOn(graph, 'materialize').mockResolvedValue(createEmptyStateV5());

      persistence.readRef.mockResolvedValue(writerSha);
      persistence.writeBlob.mockResolvedValue(blobOid);
      persistence.writeTree.mockResolvedValue(treeOid);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);
      persistence.updateRef.mockResolvedValue(undefined);

      await graph.createCheckpoint();

      // Verify updateRef was called with the correct checkpoint ref
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/warp/events/checkpoints/head',
        checkpointSha
      );
    });

    it('returns checkpoint SHA', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      const checkpointSha = 'f'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      // Mock materialize to return V5 state (with ORSet structure)
      vi.spyOn(graph, 'materialize').mockResolvedValue(createEmptyStateV5());

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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const writer1Sha = 'a'.repeat(40);
      const writer2Sha = 'b'.repeat(40);
      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1', 'writer-2']);
      // Mock materialize to return V5 state (with ORSet structure)
      vi.spyOn(graph, 'materialize').mockResolvedValue(createEmptyStateV5());

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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'events',
        writerId: 'node-1',
        crypto,
      });

      const checkpointSha = 'c'.repeat(40);
      const blobOid = 'd'.repeat(40);
      const treeOid = 'e'.repeat(40);

      vi.spyOn(graph, 'discoverWriters').mockResolvedValue(['writer-1']);
      // Mock materialize to return V5 state (with ORSet structure)
      vi.spyOn(graph, 'materialize').mockResolvedValue(createEmptyStateV5());

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
      it('schema 2 (default) uses PatchBuilderV2', async () => {
        const persistence = createMockPersistence();
        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const patchBuilder = await graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilderV2);
      });

      it('schema 2 (explicit) uses PatchBuilderV2', async () => {
        const persistence = createMockPersistence();
        // No writers, no checkpoint - fresh graph
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const patchBuilder = await graph.createPatch();

        expect(patchBuilder).toBeInstanceOf(PatchBuilderV2);
      });
    });

    describe('migration boundary validation', () => {
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
        persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
          if (ref === 'refs/warp/events/checkpoints/head') {
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

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        expect(graph).toBeInstanceOf(WarpGraph);
      });

      it('allows schema:2 on fresh graph with no history', async () => {
        const persistence = createMockPersistence();

        // No writers, no checkpoint
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        expect(graph).toBeInstanceOf(WarpGraph);
      });
    });
  });

  describe('backfill rejection and divergence detection', () => {
    describe('_isAncestor', () => {
      it('returns true when ancestorSha equals descendantSha', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const sha = 'a'.repeat(40);
        const result = await /** @type {any} */ (graph)._isAncestor(sha, sha);

        expect(result).toBe(true);
      });

      it('returns true when ancestorSha is parent of descendantSha', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const ancestorSha = 'a'.repeat(40);
        const descendantSha = 'b'.repeat(40);

        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: descendantSha,
          parents: [ancestorSha],
        });

        const result = await /** @type {any} */ (graph)._isAncestor(ancestorSha, descendantSha);

        expect(result).toBe(true);
      });

      it('returns true for multi-hop ancestor relationship', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const ancestorSha = 'a'.repeat(40);
        const middleSha = 'b'.repeat(40);
        const descendantSha = 'c'.repeat(40);

        persistence.getNodeInfo
          .mockResolvedValueOnce({ sha: descendantSha, parents: [middleSha] })
          .mockResolvedValueOnce({ sha: middleSha, parents: [ancestorSha] });

        const result = await /** @type {any} */ (graph)._isAncestor(ancestorSha, descendantSha);

        expect(result).toBe(true);
      });

      it('returns false when not an ancestor', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const sha1 = 'a'.repeat(40);
        const sha2 = 'b'.repeat(40);

        // sha2 has no parents - end of chain
        persistence.getNodeInfo.mockResolvedValue({
          sha: sha2,
          parents: [],
        });

        const result = await /** @type {any} */ (graph)._isAncestor(sha1, sha2);

        expect(result).toBe(false);
      });

      it('returns false for null inputs', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        expect(await /** @type {any} */ (graph)._isAncestor(null, 'a'.repeat(40))).toBe(false);
        expect(await /** @type {any} */ (graph)._isAncestor('a'.repeat(40), null)).toBe(false);
        expect(await /** @type {any} */ (graph)._isAncestor(null, null)).toBe(false);
      });
    });

    describe('_relationToCheckpointHead', () => {
      it('returns "same" when shas are equal', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const sha = 'a'.repeat(40);
        const result = await /** @type {any} */ (graph)._relationToCheckpointHead(sha, sha);

        expect(result).toBe('same');
      });

      it('returns "ahead" when incoming extends checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const ckHead = 'a'.repeat(40);
        const incomingSha = 'b'.repeat(40);

        // incoming has ckHead as parent (incoming is ahead)
        persistence.getNodeInfo.mockResolvedValueOnce({
          sha: incomingSha,
          parents: [ckHead],
        });

        const result = await /** @type {any} */ (graph)._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('ahead');
      });

      it('returns "behind" when incoming is ancestor of checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

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

        const result = await /** @type {any} */ (graph)._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('behind');
      });

      it('returns "diverged" when neither is ancestor of the other', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

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

        const result = await /** @type {any} */ (graph)._relationToCheckpointHead(ckHead, incomingSha);

        expect(result).toBe('diverged');
      });
    });

    describe('_validatePatchAgainstCheckpoint', () => {
      it('does not throw for schema:1 checkpoint', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const checkpoint = { schema: 1, frontier: new Map() };

        // Should not throw
        await expect(
          /** @type {any} */ (graph)._validatePatchAgainstCheckpoint('writer-1', 'a'.repeat(40), checkpoint)
        ).resolves.toBeUndefined();
      });

      it('does not throw when writer not in checkpoint frontier', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const checkpoint = {
          schema: 2,
          frontier: new Map([['other-writer', 'b'.repeat(40)]]),
        };

        // writer-1 not in checkpoint - should succeed
        await expect(
          /** @type {any} */ (graph)._validatePatchAgainstCheckpoint('writer-1', 'a'.repeat(40), checkpoint)
        ).resolves.toBeUndefined();
      });

      it('allows patch ahead of checkpoint frontier', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

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
          /** @type {any} */ (graph)._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).resolves.toBeUndefined();
      });

      it('rejects patch same as checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        const sha = 'a'.repeat(40);

        const checkpoint = {
          schema: 2,
          frontier: new Map([['writer-1', sha]]),
        };

        await expect(
          /** @type {any} */ (graph)._validatePatchAgainstCheckpoint('writer-1', sha, checkpoint)
        ).rejects.toThrow('Backfill rejected for writer writer-1: incoming patch is same checkpoint frontier');
      });

      it('rejects patch behind checkpoint head', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

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
          /** @type {any} */ (graph)._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).rejects.toThrow('Backfill rejected for writer writer-1: incoming patch is behind checkpoint frontier');
      });

      it('rejects diverged patch (fork) with different error', async () => {
        const persistence = createMockPersistence();
        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

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
          /** @type {any} */ (graph)._validatePatchAgainstCheckpoint('writer-1', incomingSha, checkpoint)
        ).rejects.toThrow('Writer fork detected for writer-1: incoming patch does not extend checkpoint head');
      });
    });
  });

  describe('version vector correctness (Task 3)', () => {
    describe('VV updates after materialize', () => {
      it('updates _versionVector to match state.observedFrontier', async () => {
        const persistence = createMockPersistence();
        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        // Before materialize, VV should be empty
        expect(/** @type {any} */ (graph)._versionVector.size).toBe(0);

        // Create patches with context VVs that will merge into observedFrontier
        const patchOidA = 'a'.repeat(40);
        const commitShaA = 'b'.repeat(40);
        const patchOidB = 'c'.repeat(40);
        const commitShaB = 'd'.repeat(40);

        // Patch from writer-a with context {writer-a: 3}
        const patchA = {
          schema: 2,
          writer: 'writer-a',
          lamport: 3,
          context: { 'writer-a': 3 },
          ops: [{ type: 'NodeAdd', node: 'user:alice', dot: 'writer-a:3' }],
        };
        const patchBufferA = encode(patchA);
        const messageA = encodePatchMessage({
          graph: 'events',
          writer: 'writer-a',
          lamport: 3,
          patchOid: patchOidA,
          schema: 2,
        });

        // Patch from writer-b with context {writer-b: 2}
        const patchB = {
          schema: 2,
          writer: 'writer-b',
          lamport: 2,
          context: { 'writer-b': 2 },
          ops: [{ type: 'NodeAdd', node: 'user:bob', dot: 'writer-b:2' }],
        };
        const patchBufferB = encode(patchB);
        const messageB = encodePatchMessage({
          graph: 'events',
          writer: 'writer-b',
          lamport: 2,
          patchOid: patchOidB,
          schema: 2,
        });

        persistence.listRefs.mockResolvedValue([
          'refs/warp/events/writers/writer-a',
          'refs/warp/events/writers/writer-b',
        ]);

        persistence.readRef
          .mockResolvedValueOnce(null) // checkpoint ref (none)
          .mockResolvedValueOnce(commitShaA) // writer-a tip
          .mockResolvedValueOnce(commitShaB); // writer-b tip

        persistence.getNodeInfo
          .mockResolvedValueOnce({
            sha: commitShaA,
            message: messageA,
            parents: [],
          })
          .mockResolvedValueOnce({
            sha: commitShaB,
            message: messageB,
            parents: [],
          });

        persistence.readBlob
          .mockResolvedValueOnce(patchBufferA)
          .mockResolvedValueOnce(patchBufferB);

        await graph.materialize();

        // After materialize, VV should reflect merged observedFrontier: {writer-a: 3, writer-b: 2}
        expect(/** @type {any} */ (graph)._versionVector.get('writer-a')).toBe(3);
        expect(/** @type {any} */ (graph)._versionVector.get('writer-b')).toBe(2);
      });

      it('VV is empty for empty graph', async () => {
        const persistence = createMockPersistence();
        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
          schema: 2,
        }));

        persistence.listRefs.mockResolvedValue([]);
        persistence.readRef.mockResolvedValue(null);

        await graph.materialize();

        expect(/** @type {any} */ (graph)._versionVector.size).toBe(0);
      });
    });

    describe('VV updates after commit', () => {
      it('increments local writer counter in VV after successful commit', async () => {
        const persistence = createMockPersistence();
        persistence.readRef.mockResolvedValue(null); // No existing commits

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        }));

        // VV starts empty
        expect(/** @type {any} */ (graph)._versionVector.get('writer-1')).toBeUndefined();

        // Setup mocks for commit
        persistence.writeBlob.mockResolvedValue('a'.repeat(40));
        persistence.writeTree.mockResolvedValue('b'.repeat(40));
        persistence.commitNodeWithTree.mockResolvedValue('c'.repeat(40));
        persistence.updateRef.mockResolvedValue(undefined);

        const builder = await graph.createPatch();
        builder.addNode('user:alice');
        await builder.commit();

        // After commit, VV should have writer-1: 1
        expect(/** @type {any} */ (graph)._versionVector.get('writer-1')).toBe(1);
      });

      it('increments only local writer counter, not others', async () => {
        const persistence = createMockPersistence();

        // Setup: VV starts with other writers' counters from materialize
        const patchOid = 'a'.repeat(40);
        const commitSha = 'b'.repeat(40);

        const patchFromOther = {
          schema: 2,
          writer: 'writer-other',
          lamport: 5,
          context: { 'writer-other': 5 },
          ops: [{ type: 'NodeAdd', node: 'user:bob', dot: 'writer-other:5' }],
        };
        const patchBuffer = encode(patchFromOther);
        const message = encodePatchMessage({
          graph: 'events',
          writer: 'writer-other',
          lamport: 5,
          patchOid,
          schema: 2,
        });

        persistence.listRefs.mockResolvedValue([
          'refs/warp/events/writers/writer-other',
        ]);
        persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
          if (ref.includes('checkpoints')) return Promise.resolve(null);
          if (ref.includes('writer-other')) return Promise.resolve(commitSha);
          if (ref.includes('writer-1')) return Promise.resolve(null);
          return Promise.resolve(null);
        });
        persistence.getNodeInfo.mockResolvedValue({
          sha: commitSha,
          message,
          parents: [],
        });
        persistence.readBlob.mockResolvedValue(patchBuffer);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        }));

        await graph.materialize();

        // VV should have writer-other: 5
        expect(/** @type {any} */ (graph)._versionVector.get('writer-other')).toBe(5);
        expect(/** @type {any} */ (graph)._versionVector.get('writer-1')).toBeUndefined();

        // Setup mocks for commit
        persistence.writeBlob.mockResolvedValue('c'.repeat(40));
        persistence.writeTree.mockResolvedValue('d'.repeat(40));
        persistence.commitNodeWithTree.mockResolvedValue('e'.repeat(40));
        persistence.updateRef.mockResolvedValue(undefined);

        const builder = await graph.createPatch();
        builder.addNode('user:alice');
        await builder.commit();

        // After commit: writer-1 has lamport 6 (max(0, maxObserved=5) + 1),
        // and observedFrontier (→ _versionVector) reflects the actual tick.
        // writer-other should still be 5.
        expect(/** @type {any} */ (graph)._versionVector.get('writer-1')).toBe(6);
        expect(/** @type {any} */ (graph)._versionVector.get('writer-other')).toBe(5);
      });
    });

    describe('race detection', () => {
      it('detects concurrent commit and throws error', async () => {
        const persistence = createMockPersistence();

        // First, no existing ref
        persistence.readRef.mockResolvedValueOnce(null); // During open() checkpoint check
        persistence.listRefs.mockResolvedValue([]);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        }));

        // createPatch reads ref (returns null - first commit)
        persistence.readRef.mockResolvedValueOnce(null);

        const builder1 = await graph.createPatch();
        builder1.addNode('user:alice');

        // Before builder1 commits, another commit happens
        // Simulate by making the ref return a different SHA when builder1 tries to commit
        const concurrentCommitSha = 'x'.repeat(40);
        persistence.readRef.mockResolvedValueOnce(concurrentCommitSha);

        await expect(builder1.commit()).rejects.toThrow(
          /Commit failed: writer ref was updated by another process/
        );
      });

      it('first builder commits OK, second builder fails with race detection', async () => {
        const persistence = createMockPersistence();

        persistence.readRef.mockResolvedValueOnce(null); // During open() checkpoint check
        persistence.listRefs.mockResolvedValue([]);

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        }));

        // Both builders read ref at creation time (both see null)
        persistence.readRef.mockResolvedValueOnce(null); // builder1 creation
        const builder1 = await graph.createPatch();
        builder1.addNode('user:alice');

        persistence.readRef.mockResolvedValueOnce(null); // builder2 creation
        const builder2 = await graph.createPatch();
        builder2.addNode('user:bob');

        // Setup mocks for builder1's commit
        persistence.readRef.mockResolvedValueOnce(null); // builder1 commit check - still null
        persistence.writeBlob.mockResolvedValue('a'.repeat(40));
        persistence.writeTree.mockResolvedValue('b'.repeat(40));
        const commit1Sha = 'c'.repeat(40);
        persistence.commitNodeWithTree.mockResolvedValue(commit1Sha);
        persistence.updateRef.mockResolvedValue(undefined);

        // builder1 commits successfully
        const sha1 = await builder1.commit();
        expect(sha1).toBe(commit1Sha);

        // Now builder2 tries to commit, but ref has advanced
        persistence.readRef.mockResolvedValueOnce(commit1Sha); // builder2 commit check - now points to commit1

        await expect(builder2.commit()).rejects.toThrow(
          /Commit failed: writer ref was updated by another process.*Re-materialize and retry/
        );
      });

      it('allows commit when ref matches expected parent', async () => {
        const persistence = createMockPersistence();
        const existingSha = 'd'.repeat(40);
        const existingPatchOid = 'e'.repeat(40);

        persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
          if (ref.includes('checkpoints')) return Promise.resolve(null);
          if (ref.includes('writers')) return Promise.resolve(existingSha);
          return Promise.resolve(null);
        });
        persistence.listRefs.mockResolvedValue([]);
        persistence.showNode.mockResolvedValue(
          `warp:patch\n\neg-kind: patch\neg-graph: events\neg-writer: writer-1\neg-lamport: 5\neg-patch-oid: ${existingPatchOid}\neg-schema: 2`
        );

        const graph = await WarpGraph.open(/** @type {any} */ ({
          persistence,
          graphName: 'events',
          writerId: 'writer-1',
          schema: 2,
        }));

        const builder = await graph.createPatch();
        builder.addNode('user:alice');

        // Setup mocks for commit - ref still matches
        persistence.writeBlob.mockResolvedValue('a'.repeat(40));
        persistence.writeTree.mockResolvedValue('b'.repeat(40));
        persistence.commitNodeWithTree.mockResolvedValue('c'.repeat(40));
        persistence.updateRef.mockResolvedValue(undefined);

        // Should succeed because ref hasn't changed
        const sha = await builder.commit();
        expect(sha).toBe('c'.repeat(40));
      });
    });
  });

  describe('writer factory methods', () => {
    describe('writer()', () => {
      it('uses explicit writerId when provided', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.writer('alice');

        expect(writer.writerId).toBe('alice');
        expect(writer.graphName).toBe('events');
        // configGet should not be called when explicit ID provided
        expect(persistence.configGet).not.toHaveBeenCalled();
        expect(persistence.configSet).not.toHaveBeenCalled();
      });

      it('resolves writerId from git config when not provided', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn().mockResolvedValue('stored-writer');
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.writer();

        expect(writer.writerId).toBe('stored-writer');
        expect(persistence.configGet).toHaveBeenCalledWith('warp.writerId.events');
        expect(persistence.configSet).not.toHaveBeenCalled();
      });

      it('generates and persists new canonical ID when config is empty', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn().mockResolvedValue(null);
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'my-graph',
          writerId: 'node-1',
        });

        const writer = await graph.writer();

        // Should generate canonical ID
        expect(writer.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
        // Should persist to config
        expect(persistence.configSet).toHaveBeenCalledWith(
          'warp.writerId.my-graph',
          writer.writerId
        );
      });

      it('validates explicit writerId for ref-safety', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        // Contains slash - invalid for ref-safety
        await expect(graph.writer('a/b')).rejects.toThrow('Invalid writer ID');
      });

      it('returns Writer instance with correct dependencies', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn().mockResolvedValue('test-writer');
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.writer();

        // Verify the writer has access to persistence (via head() call)
        persistence.readRef.mockResolvedValue('a'.repeat(40));
        const head = await writer.head();
        expect(head).toBe('a'.repeat(40));
        expect(persistence.readRef).toHaveBeenCalledWith('refs/warp/events/writers/test-writer');
      });
    });

    describe('createWriter()', () => {
      it('generates fresh canonical ID', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.createWriter();

        expect(writer.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
        // By default, should not persist
        expect(persistence.configSet).not.toHaveBeenCalled();
      });

      it('generates unique IDs on each call', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer1 = await graph.createWriter();
        const writer2 = await graph.createWriter();

        expect(writer1.writerId).not.toBe(writer2.writerId);
        expect(writer1.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
        expect(writer2.writerId).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      });

      it('persists to git config when persist: "config"', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'my-graph',
          writerId: 'node-1',
        });

        const writer = await graph.createWriter({ persist: 'config' });

        expect(persistence.configSet).toHaveBeenCalledWith(
          'warp.writerId.my-graph',
          writer.writerId
        );
      });

      it('uses alias for config key when provided', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        const writer = await graph.createWriter({ persist: 'config', alias: 'secondary' });

        expect(persistence.configSet).toHaveBeenCalledWith(
          'warp.writerId.secondary',
          writer.writerId
        );
      });

      it('does not persist when persist: "none" (default)', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'events',
          writerId: 'node-1',
        });

        await graph.createWriter({ persist: 'none' });

        expect(persistence.configSet).not.toHaveBeenCalled();
      });

      it('returns Writer instance with correct graphName', async () => {
        const persistence = createMockPersistence();
        persistence.configGet = vi.fn();
        persistence.configSet = vi.fn();

        const graph = await WarpGraph.open({
          persistence,
          graphName: 'my-events',
          writerId: 'node-1',
        });

        const writer = await graph.createWriter();

        expect(writer.graphName).toBe('my-events');
      });
    });
  });

  // ===========================================================================
  // patch() convenience wrapper
  // ===========================================================================
  describe('patch()', () => {
    /**
     * Helper: create a graph with commit-ready mocks.
     * @returns {Promise<{graph: WarpGraph, persistence: any}>}
     */
    async function openGraphWithCommitMocks() {
      const persistence = createMockPersistence();
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('b'.repeat(40));
      persistence.writeTree.mockResolvedValue('b'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('c'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'patch-test',
        writerId: 'w1',
      });
      return { graph, persistence };
    }

    it('commits with a sync callback and returns SHA', async () => {
      const { graph } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('n:1');
      });

      expect(typeof sha).toBe('string');
      expect(sha).toHaveLength(40);
    });

    it('commits with an async callback', async () => {
      const { graph } = await openGraphWithCommitMocks();

      const sha = await graph.patch(async p => {
        await Promise.resolve();
        p.addNode('n:2');
      });

      expect(typeof sha).toBe('string');
      expect(sha).toHaveLength(40);
    });

    it('rejects with empty patch error when callback adds nothing', async () => {
      const { graph } = await openGraphWithCommitMocks();

      await expect(graph.patch(() => {})).rejects.toThrow(/empty/i);
    });

    it('propagates callback errors without committing', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();
      const boom = new Error('user error');

      await expect(graph.patch(() => { throw boom; })).rejects.toThrow(boom);
      expect(persistence.commitNodeWithTree).not.toHaveBeenCalled();
    });

    it('supports chained operations in a single patch', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('user:alice')
          .setProperty('user:alice', 'name', 'Alice')
          .addNode('user:bob')
          .addEdge('user:alice', 'user:bob', 'follows');
      });

      expect(sha).toHaveLength(40);
      expect(persistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });

    it('returns a 40-hex-char commit SHA', async () => {
      const { graph } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('x');
      });

      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('commit occurs exactly once even when builder is captured externally', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();
      let captured;

      await graph.patch(p => {
        p.addNode('early');
        captured = p;
      });

      // patch() already committed — verify exactly one commit happened
      expect(persistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
      // The captured builder still exists but its commit already fired
      expect(captured).toBeDefined();
    });

    it('rejects nested patch() calls with reentrancy guard', async () => {
      const { graph } = await openGraphWithCommitMocks();

      await expect(graph.patch(async p => {
        p.addNode('outer');
        await graph.patch(inner => {
          inner.addNode('inner');
        });
      })).rejects.toThrow(/not reentrant|nested/i);
    });

    it('round-trips setEdgeProperty via createPatch', async () => {
      const { graph, persistence } = await openGraphWithCommitMocks();

      const sha = await graph.patch(p => {
        p.addNode('a')
          .addNode('b')
          .addEdge('a', 'b', 'rel')
          .setEdgeProperty('a', 'b', 'rel', 'weight', 42);
      });

      expect(sha).toHaveLength(40);
      expect(persistence.commitNodeWithTree).toHaveBeenCalledTimes(1);
    });
  });
});
