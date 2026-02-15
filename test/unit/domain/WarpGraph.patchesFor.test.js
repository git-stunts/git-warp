import { describe, it, expect, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodeCheckpointMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { encodeEdgeKey, createEmptyStateV5 } from '../../../src/domain/services/JoinReducer.js';
import { serializeFullStateV5, serializeAppliedVV, computeAppliedVV } from '../../../src/domain/services/CheckpointSerializerV5.js';
import { serializeFrontier } from '../../../src/domain/services/Frontier.js';
import { ProvenanceIndex } from '../../../src/domain/services/ProvenanceIndex.js';

// Shared test utilities - generators are designed for parallel-safety
// (each test gets its own generator instance to avoid cross-test interference)
import {
  createOidGenerator,
  createHashGenerator,
  createMockPersistence,
  createMockPatchWithIO,
  createDot,
} from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph.patchesFor() (HG/IO/2)', () => {
  /** @type {any} */
  let persistence;
  // Parallel-safe generators: each test gets fresh instances via beforeEach
  /** @type {any} */
  let oidGen;
  /** @type {any} */
  let hashGen;

  beforeEach(() => {
    persistence = createMockPersistence();
    oidGen = createOidGenerator();
    hashGen = createHashGenerator();
  });

  describe('patchesFor()', () => {
    it('throws if not materialized and autoMaterialize is off', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
        autoMaterialize: false,
      });

      await expect(graph.patchesFor('node:a')).rejects.toThrow('No materialized state');
    });

    it('returns empty array for unknown entity after materialize', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      expect(await graph.patchesFor('unknown')).toEqual([]);
    });

    it('returns patch SHAs that wrote a node', async () => {
      const sha1 = oidGen.next();
      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: createDot('alice', 1) }],
        reads: [],
        writes: ['user:alice'],
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha1;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch1.nodeInfo);
      persistence.showNode.mockResolvedValue(patch1.message);
      persistence.readBlob.mockResolvedValue(patch1.patchBuffer);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      const shas = await graph.patchesFor('user:alice');
      expect(shas).toContain(sha1);
      expect(shas.length).toBe(1);
    });

    it('returns multiple patch SHAs for node affected by multiple patches', async () => {
      const sha1 = oidGen.next();
      const sha2 = oidGen.next();
      const sha3 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: createDot('alice', 1) }],
        writes: ['user:alice'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'alice',
        lamport: 2,
        ops: [{ type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' }],
        reads: ['user:alice'],
        writes: ['user:alice'],
        parentSha: sha1,
      }, oidGen.next);

      const patch3 = createMockPatchWithIO({
        sha: sha3,
        graphName: 'test',
        writerId: 'alice',
        lamport: 3,
        ops: [{ type: 'PropSet', node: 'user:alice', key: 'email', value: 'alice@example.com' }],
        reads: ['user:alice'],
        writes: ['user:alice'],
        parentSha: sha2,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha3;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

      // Walk chain: sha3 -> sha2 -> sha1 - need to handle by SHA
      persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha3) return patch3.nodeInfo;
        if (sha === sha2) return patch2.nodeInfo;
        if (sha === sha1) return patch1.nodeInfo;
        return null;
      });

      persistence.showNode.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha3) return patch3.message;
        if (sha === sha2) return patch2.message;
        if (sha === sha1) return patch1.message;
        return '';
      });

      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === patch3.patchOid) return patch3.patchBuffer;
        if (oid === patch2.patchOid) return patch2.patchBuffer;
        if (oid === patch1.patchOid) return patch1.patchBuffer;
        return null;
      });

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      const shas = await graph.patchesFor('user:alice');
      expect(shas).toContain(sha1);
      expect(shas).toContain(sha2);
      expect(shas).toContain(sha3);
      expect(shas.length).toBe(3);
    });

    it('tracks patches that read a node (for edges)', async () => {
      const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
      const sha1 = oidGen.next();
      const sha2 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'user:alice', dot: createDot('alice', 1) },
          { type: 'NodeAdd', node: 'user:bob', dot: createDot('alice', 2) },
        ],
        writes: ['user:alice', 'user:bob'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'alice',
        lamport: 2,
        ops: [{ type: 'EdgeAdd', from: 'user:alice', to: 'user:bob', label: 'follows', dot: createDot('alice', 3) }],
        reads: ['user:alice', 'user:bob'],
        writes: [edgeKey],
        parentSha: sha1,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha2;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

      persistence.getNodeInfo
        .mockResolvedValueOnce(patch2.nodeInfo)
        .mockResolvedValueOnce(patch1.nodeInfo);

      persistence.showNode.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha2) return patch2.message;
        if (sha === sha1) return patch1.message;
        return '';
      });

      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === patch2.patchOid) return patch2.patchBuffer;
        if (oid === patch1.patchOid) return patch1.patchBuffer;
        return null;
      });

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      // Both endpoint nodes should have the edge patch in their provenance
      const aliceShas = await graph.patchesFor('user:alice');
      const bobShas = await graph.patchesFor('user:bob');

      expect(aliceShas).toContain(sha2); // edge reads alice
      expect(bobShas).toContain(sha2); // edge reads bob
    });

    it('tracks patches for edge keys', async () => {
      const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
      const sha1 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'EdgeAdd', from: 'user:alice', to: 'user:bob', label: 'follows', dot: createDot('alice', 1) }],
        reads: ['user:alice', 'user:bob'],
        writes: [edgeKey],
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha1;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

      persistence.getNodeInfo.mockResolvedValue(patch1.nodeInfo);
      persistence.showNode.mockResolvedValue(patch1.message);
      persistence.readBlob.mockResolvedValue(patch1.patchBuffer);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      const edgeShas = await graph.patchesFor(edgeKey);
      expect(edgeShas).toContain(sha1);
    });

    it('golden path: 3 patches affecting node X', async () => {
      const sha1 = oidGen.next();
      const sha2 = oidGen.next();
      const sha3 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'node:X', dot: createDot('alice', 1) }],
        writes: ['node:X'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'alice',
        lamport: 2,
        ops: [{ type: 'PropSet', node: 'node:X', key: 'value', value: 100 }],
        reads: ['node:X'],
        writes: ['node:X'],
        parentSha: sha1,
      }, oidGen.next);

      const patch3 = createMockPatchWithIO({
        sha: sha3,
        graphName: 'test',
        writerId: 'alice',
        lamport: 3,
        ops: [{ type: 'PropSet', node: 'node:X', key: 'value', value: 200 }],
        reads: ['node:X'],
        writes: ['node:X'],
        parentSha: sha2,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha3;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

      // Walk chain: sha3 -> sha2 -> sha1 - need to handle by SHA
      persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha3) return patch3.nodeInfo;
        if (sha === sha2) return patch2.nodeInfo;
        if (sha === sha1) return patch1.nodeInfo;
        return null;
      });

      persistence.showNode.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha3) return patch3.message;
        if (sha === sha2) return patch2.message;
        if (sha === sha1) return patch1.message;
        return '';
      });

      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === patch3.patchOid) return patch3.patchBuffer;
        if (oid === patch2.patchOid) return patch2.patchBuffer;
        if (oid === patch1.patchOid) return patch1.patchBuffer;
        return null;
      });

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      const shas = await graph.patchesFor('node:X');
      expect(shas.length).toBe(3);
      expect(shas).toContain(sha1);
      expect(shas).toContain(sha2);
      expect(shas).toContain(sha3);
    });
  });

  describe('provenanceIndex getter', () => {
    it('returns null before materialization', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      expect(graph.provenanceIndex).toBeNull();
    });

    it('returns index after materialization', async () => {
      const sha1 = oidGen.next();
      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: createDot('alice', 1) }],
        writes: ['user:alice'],
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha1;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch1.nodeInfo);
      persistence.showNode.mockResolvedValue(patch1.message);
      persistence.readBlob.mockResolvedValue(patch1.patchBuffer);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      expect(graph.provenanceIndex).not.toBeNull();
      expect(/** @type {any} */ (graph.provenanceIndex).size).toBeGreaterThan(0);
    });
  });

  describe('multi-writer scenarios', () => {
    it('tracks patches from multiple writers for same node', async () => {
      const sha1 = oidGen.next();
      const sha2 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'shared', dot: createDot('alice', 1) }],
        writes: ['shared'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'bob',
        lamport: 2,
        ops: [{ type: 'PropSet', node: 'shared', key: 'owner', value: 'bob' }],
        reads: ['shared'],
        writes: ['shared'],
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue([
        'refs/warp/test/writers/alice',
        'refs/warp/test/writers/bob',
      ]);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha1;
        if (ref === 'refs/warp/test/writers/bob') return sha2;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

      persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha1) return patch1.nodeInfo;
        if (sha === sha2) return patch2.nodeInfo;
        return null;
      });

      persistence.showNode.mockImplementation((/** @type {any} */ sha) => {
        if (sha === sha1) return patch1.message;
        if (sha === sha2) return patch2.message;
        return '';
      });

      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === patch1.patchOid) return patch1.patchBuffer;
        if (oid === patch2.patchOid) return patch2.patchBuffer;
        return null;
      });

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      const shas = await graph.patchesFor('shared');
      expect(shas).toContain(sha1);
      expect(shas).toContain(sha2);
    });
  });

  describe('checkpoint persistence', () => {
    it('loads provenance index from checkpoint', async () => {
      const sha1 = oidGen.next();
      const sha2 = oidGen.next();
      const checkpointSha = oidGen.next();

      // Create a checkpoint with provenance index
      const index = new ProvenanceIndex();
      index.addPatch(sha1, [], ['user:alice']);
      index.addPatch(sha2, ['user:alice'], ['user:alice']);

      const state = createEmptyStateV5();
      const frontier = new Map([['alice', sha2]]);
      const appliedVV = computeAppliedVV(state);

      const stateBuffer = serializeFullStateV5(state);
      const frontierBuffer = serializeFrontier(frontier);
      const appliedVVBuffer = serializeAppliedVV(appliedVV);
      const provenanceIndexBuffer = index.serialize();

      const stateHash = hashGen.next();
      const checkpointMessage = encodeCheckpointMessage({
        graph: 'test',
        stateHash,
        frontierOid: oidGen.next(),
        indexOid: oidGen.next(),
        schema: 2,
      });

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/checkpoints/head') return checkpointSha;
        if (ref === 'refs/warp/test/writers/alice') return sha2;
        return null;
      });
      persistence.showNode.mockResolvedValue(checkpointMessage);
      persistence.readTreeOids.mockResolvedValue({
        'state.cbor': 'state-oid',
        'frontier.cbor': 'frontier-oid',
        'appliedVV.cbor': 'applied-oid',
        'provenanceIndex.cbor': 'provenance-oid',
      });
      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === 'state-oid') return stateBuffer;
        if (oid === 'frontier-oid') return frontierBuffer;
        if (oid === 'applied-oid') return appliedVVBuffer;
        if (oid === 'provenance-oid') return provenanceIndexBuffer;
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue({ sha: sha2, message: '', parents: [] });

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'bob',
      });

      await graph.materialize();

      // Should have the provenance index from checkpoint
      const shas = await graph.patchesFor('user:alice');
      expect(shas).toContain(sha1);
      expect(shas).toContain(sha2);
    });
  });

  describe('edge cases', () => {
    it('handles node with no patches (empty graph)', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      expect(await graph.patchesFor('nonexistent')).toEqual([]);
    });

    it('handles legacy patches without reads/writes', async () => {
      const sha1 = oidGen.next();
      // Legacy patch without reads/writes fields
      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: createDot('alice', 1) }],
        // No reads/writes - legacy patch
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha1;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });
      persistence.getNodeInfo.mockResolvedValue(patch1.nodeInfo);
      persistence.showNode.mockResolvedValue(patch1.message);
      persistence.readBlob.mockResolvedValue(patch1.patchBuffer);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      // Should still work, just won't have any provenance for this patch
      expect(await graph.patchesFor('user:alice')).toEqual([]);
    });
  });
});
