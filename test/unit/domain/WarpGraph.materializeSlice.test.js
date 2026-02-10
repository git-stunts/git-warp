import { describe, it, expect, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodeEdgeKey, encodePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetContains } from '../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../src/domain/crdt/LWW.js';
import {
  createOidGenerator,
  createMockPersistence,
  createMockPatchWithIO,
  createDot,
} from '../../helpers/warpGraphTestUtils.js';

describe('WarpGraph.materializeSlice() (HG/SLICE/1)', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let oidGen;

  beforeEach(() => {
    persistence = createMockPersistence();
    oidGen = createOidGenerator();
  });

  describe('error handling', () => {
    it('throws E_NO_STATE if not materialized', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      // _ensureFreshState() is called first, which throws when no cached state exists
      await expect(graph.materializeSlice('node:a')).rejects.toThrow('No cached state');
    });
  });

  describe('empty graph', () => {
    it('returns empty state for unknown node', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      const slice = await graph.materializeSlice('unknown');
      expect(slice.patchCount).toBe(0);
      expect(slice.state.nodeAlive.entries.size).toBe(0);
    });
  });

  describe('single node slicing', () => {
    it('slices a single node with one patch', async () => {
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

      const slice = await graph.materializeSlice('user:alice');
      expect(slice.patchCount).toBe(1);
      expect(orsetContains(slice.state.nodeAlive, 'user:alice')).toBe(true);
    });

    it('slices a node with multiple property patches', async () => {
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

      const slice = await graph.materializeSlice('user:alice');
      expect(slice.patchCount).toBe(3);
      expect(orsetContains(slice.state.nodeAlive, 'user:alice')).toBe(true);

      // Check properties are set correctly
      const namePropKey = encodePropKey('user:alice', 'name');
      const emailPropKey = encodePropKey('user:alice', 'email');
      expect(lwwValue(slice.state.prop.get(namePropKey))).toBe('Alice');
      expect(lwwValue(slice.state.prop.get(emailPropKey))).toBe('alice@example.com');
    });
  });

  describe('causal cone computation', () => {
    it('includes read dependencies in the cone', async () => {
      // Scenario:
      // Patch 1: Create node A
      // Patch 2: Create node B
      // Patch 3: Create edge A->B (reads A and B)
      // Slicing for the edge should include all 3 patches

      const sha1 = oidGen.next();
      const sha2 = oidGen.next();
      const sha3 = oidGen.next();
      const edgeKey = encodeEdgeKey('node:A', 'node:B', 'connects');

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'node:A', dot: createDot('alice', 1) }],
        writes: ['node:A'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'alice',
        lamport: 2,
        ops: [{ type: 'NodeAdd', node: 'node:B', dot: createDot('alice', 2) }],
        writes: ['node:B'],
        parentSha: sha1,
      }, oidGen.next);

      const patch3 = createMockPatchWithIO({
        sha: sha3,
        graphName: 'test',
        writerId: 'alice',
        lamport: 3,
        ops: [{ type: 'EdgeAdd', from: 'node:A', to: 'node:B', label: 'connects', dot: createDot('alice', 3) }],
        reads: ['node:A', 'node:B'],
        writes: [edgeKey],
        parentSha: sha2,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha3;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

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

      // Slice for the edge - should include all 3 patches (edge + its endpoint dependencies)
      const slice = await graph.materializeSlice(edgeKey);
      expect(slice.patchCount).toBe(3);
      expect(orsetContains(slice.state.nodeAlive, 'node:A')).toBe(true);
      expect(orsetContains(slice.state.nodeAlive, 'node:B')).toBe(true);
      expect(orsetContains(slice.state.edgeAlive, edgeKey)).toBe(true);
    });

    it('slice is smaller than full materialization when nodes are independent', async () => {
      // Scenario:
      // Patch 1: Create node A
      // Patch 2: Create node B (independent of A)
      // Slicing for A should only include patch 1

      const sha1 = oidGen.next();
      const sha2 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'node:A', dot: createDot('alice', 1) }],
        writes: ['node:A'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'bob',
        lamport: 2,
        ops: [{ type: 'NodeAdd', node: 'node:B', dot: createDot('bob', 1) }],
        writes: ['node:B'],
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

      // Slice for node A should only include patch 1
      const sliceA = await graph.materializeSlice('node:A');
      expect(sliceA.patchCount).toBe(1);
      expect(orsetContains(sliceA.state.nodeAlive, 'node:A')).toBe(true);
      expect(orsetContains(sliceA.state.nodeAlive, 'node:B')).toBe(false);

      // Slice for node B should only include patch 2
      const sliceB = await graph.materializeSlice('node:B');
      expect(sliceB.patchCount).toBe(1);
      expect(orsetContains(sliceB.state.nodeAlive, 'node:B')).toBe(true);
      expect(orsetContains(sliceB.state.nodeAlive, 'node:A')).toBe(false);
    });
  });

  describe('multi-writer scenarios', () => {
    it('includes patches from multiple writers in the cone', async () => {
      // Scenario:
      // Writer alice: Create node A
      // Writer bob: Set property on A
      // Slicing for A should include both patches

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

      const slice = await graph.materializeSlice('shared');
      expect(slice.patchCount).toBe(2);
      expect(orsetContains(slice.state.nodeAlive, 'shared')).toBe(true);

      const propKey = encodePropKey('shared', 'owner');
      expect(lwwValue(slice.state.prop.get(propKey))).toBe('bob');
    });
  });

  describe('consistency with full materialization', () => {
    it('slice produces correct property values matching full materialization', async () => {
      const sha1 = oidGen.next();
      const sha2 = oidGen.next();
      const sha3 = oidGen.next();

      const patch1 = createMockPatchWithIO({
        sha: sha1,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'target', dot: createDot('alice', 1) },
          { type: 'PropSet', node: 'target', key: 'value', value: 100 },
        ],
        writes: ['target'],
      }, oidGen.next);

      const patch2 = createMockPatchWithIO({
        sha: sha2,
        graphName: 'test',
        writerId: 'alice',
        lamport: 2,
        ops: [{ type: 'PropSet', node: 'target', key: 'value', value: 200 }],
        reads: ['target'],
        writes: ['target'],
        parentSha: sha1,
      }, oidGen.next);

      const patch3 = createMockPatchWithIO({
        sha: sha3,
        graphName: 'test',
        writerId: 'alice',
        lamport: 3,
        ops: [{ type: 'PropSet', node: 'target', key: 'value', value: 300 }],
        reads: ['target'],
        writes: ['target'],
        parentSha: sha2,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha3;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

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

      const fullState = /** @type {any} */ (await graph.materialize());

      const slice = await graph.materializeSlice('target');

      // Property should have the final value (300) in both cases
      const propKey = encodePropKey('target', 'value');
      expect(lwwValue(slice.state.prop.get(propKey))).toBe(lwwValue(fullState.prop.get(propKey)));
      expect(lwwValue(slice.state.prop.get(propKey))).toBe(300);
    });
  });

  describe('receipts option', () => {
    it('returns receipts when requested', async () => {
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

      const slice = await graph.materializeSlice('user:alice', { receipts: true });
      expect(/** @type {any} */ (slice.receipts)).toBeDefined();
      expect(Array.isArray(/** @type {any} */ (slice.receipts))).toBe(true);
      expect(/** @type {any} */ (/** @type {any} */ (slice.receipts)).length).toBe(1);
    });

    it('does not include receipts when not requested', async () => {
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

      const slice = await graph.materializeSlice('user:alice');
      expect(/** @type {any} */ (slice.receipts)).toBeUndefined();
    });
  });

  describe('transitive dependencies', () => {
    it('includes transitive read dependencies', async () => {
      // Scenario: A chain of dependencies
      // Patch 1: Create node X
      // Patch 2: Create node Y, reads X
      // Patch 3: Create node Z, reads Y (transitively depends on X)
      // Slicing for Z should include all 3 patches

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
        ops: [{ type: 'NodeAdd', node: 'node:Y', dot: createDot('alice', 2) }],
        reads: ['node:X'],
        writes: ['node:Y'],
        parentSha: sha1,
      }, oidGen.next);

      const patch3 = createMockPatchWithIO({
        sha: sha3,
        graphName: 'test',
        writerId: 'alice',
        lamport: 3,
        ops: [{ type: 'NodeAdd', node: 'node:Z', dot: createDot('alice', 3) }],
        reads: ['node:Y'],
        writes: ['node:Z'],
        parentSha: sha2,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue(['refs/warp/test/writers/alice']);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return sha3;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

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

      // Slice for Z should include all 3 patches due to transitive dependencies
      const slice = await graph.materializeSlice('node:Z');
      expect(slice.patchCount).toBe(3);
      expect(orsetContains(slice.state.nodeAlive, 'node:X')).toBe(true);
      expect(orsetContains(slice.state.nodeAlive, 'node:Y')).toBe(true);
      expect(orsetContains(slice.state.nodeAlive, 'node:Z')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles legacy patches without reads/writes', async () => {
      // Legacy patches without reads/writes fields should not be included in the cone
      const sha1 = oidGen.next();
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

      // Legacy patch has no provenance entries, so slice returns empty
      const slice = await graph.materializeSlice('user:alice');
      expect(slice.patchCount).toBe(0);
    });

    it('handles diamond dependencies', async () => {
      // Diamond dependency pattern:
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      // D reads from both B and C, which both read from A
      // Slicing for D should include all 4 patches (no duplicates)

      const shaA = oidGen.next();
      const shaB = oidGen.next();
      const shaC = oidGen.next();
      const shaD = oidGen.next();

      const patchA = createMockPatchWithIO({
        sha: shaA,
        graphName: 'test',
        writerId: 'alice',
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'node:A', dot: createDot('alice', 1) }],
        writes: ['node:A'],
      }, oidGen.next);

      const patchB = createMockPatchWithIO({
        sha: shaB,
        graphName: 'test',
        writerId: 'alice',
        lamport: 2,
        ops: [{ type: 'NodeAdd', node: 'node:B', dot: createDot('alice', 2) }],
        reads: ['node:A'],
        writes: ['node:B'],
        parentSha: shaA,
      }, oidGen.next);

      const patchC = createMockPatchWithIO({
        sha: shaC,
        graphName: 'test',
        writerId: 'bob',
        lamport: 2,
        ops: [{ type: 'NodeAdd', node: 'node:C', dot: createDot('bob', 1) }],
        reads: ['node:A'],
        writes: ['node:C'],
      }, oidGen.next);

      const patchD = createMockPatchWithIO({
        sha: shaD,
        graphName: 'test',
        writerId: 'alice',
        lamport: 3,
        ops: [{ type: 'NodeAdd', node: 'node:D', dot: createDot('alice', 3) }],
        reads: ['node:B', 'node:C'],
        writes: ['node:D'],
        parentSha: shaB,
      }, oidGen.next);

      persistence.listRefs.mockResolvedValue([
        'refs/warp/test/writers/alice',
        'refs/warp/test/writers/bob',
      ]);
      persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
        if (ref === 'refs/warp/test/writers/alice') return shaD;
        if (ref === 'refs/warp/test/writers/bob') return shaC;
        if (ref === 'refs/warp/test/checkpoints/head') return null;
        return null;
      });

      persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
        if (sha === shaD) return patchD.nodeInfo;
        if (sha === shaC) return patchC.nodeInfo;
        if (sha === shaB) return patchB.nodeInfo;
        if (sha === shaA) return patchA.nodeInfo;
        return null;
      });

      persistence.showNode.mockImplementation((/** @type {any} */ sha) => {
        if (sha === shaD) return patchD.message;
        if (sha === shaC) return patchC.message;
        if (sha === shaB) return patchB.message;
        if (sha === shaA) return patchA.message;
        return '';
      });

      persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
        if (oid === patchD.patchOid) return patchD.patchBuffer;
        if (oid === patchC.patchOid) return patchC.patchBuffer;
        if (oid === patchB.patchOid) return patchB.patchBuffer;
        if (oid === patchA.patchOid) return patchA.patchBuffer;
        return null;
      });

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      await graph.materialize();

      // Slice for D should include all 4 patches (A, B, C, D)
      const slice = await graph.materializeSlice('node:D');
      expect(slice.patchCount).toBe(4);
      expect(orsetContains(slice.state.nodeAlive, 'node:A')).toBe(true);
      expect(orsetContains(slice.state.nodeAlive, 'node:B')).toBe(true);
      expect(orsetContains(slice.state.nodeAlive, 'node:C')).toBe(true);
      expect(orsetContains(slice.state.nodeAlive, 'node:D')).toBe(true);
    });
  });
});
