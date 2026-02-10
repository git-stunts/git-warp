import { describe, it, expect, vi } from 'vitest';
import { PatchBuilderV2 } from '../../../../src/domain/services/PatchBuilderV2.js';
import { createVersionVector, vvClone } from '../../../../src/domain/crdt/VersionVector.js';
import { createORSet, orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.js';
import { decodePatchMessage } from '../../../../src/domain/services/WarpMessageCodec.js';
import { decode } from '../../../../src/infrastructure/codecs/CborCodec.js';

/**
 * Creates a mock V5 state for testing.
 * @returns {any} Mock state with nodeAlive and edgeAlive ORSets
 */
function createMockState() {
  return {
    nodeAlive: createORSet(),
    edgeAlive: createORSet(),
    prop: new Map(),
    observedFrontier: createVersionVector(),
  };
}

/**
 * Creates a mock persistence adapter for testing commit().
 * @returns {any} Mock persistence with standard methods stubbed
 */
function createMockPersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    showNode: vi.fn(),
    writeBlob: vi.fn().mockResolvedValue('a'.repeat(40)), // Valid 40-char hex OID
    writeTree: vi.fn().mockResolvedValue('b'.repeat(40)),
    commitNodeWithTree: vi.fn().mockResolvedValue('c'.repeat(40)),
    updateRef: vi.fn().mockResolvedValue(undefined),
  };
}

describe('PatchBuilderV2', () => {
  describe('building patch with node add', () => {
    it('creates NodeAdd operation with dot', () => {
      const vv = createVersionVector();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.addNode('x');

      const patch = builder.build();
      expect(patch.schema).toBe(2);
      expect(patch.writer).toBe('writer1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('NodeAdd');
      expect(/** @type {any} */ (patch.ops[0]).node).toBe('x');
      expect(/** @type {any} */ (patch.ops[0]).dot).toEqual({ writerId: 'writer1', counter: 1 });
    });

    it('returns this for chaining', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      const result = builder.addNode('x');
      expect(result).toBe(builder);
    });
  });

  describe('building patch with node remove', () => {
    it('creates NodeRemove operation with observedDots from state', () => {
      const state = createMockState();
      // Add a node with a dot to the mock state
      const existingDot = createDot('otherWriter', 5);
      orsetAdd(state.nodeAlive, 'x', existingDot);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 2,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      builder.removeNode('x');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('NodeRemove');
      expect(/** @type {any} */ (patch.ops[0]).node).toBe('x');
      // orsetGetDots returns already-encoded dots (strings like "writerId:counter")
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toEqual(['otherWriter:5']);
    });

    it('includes multiple observed dots when node has multiple adds', () => {
      const state = createMockState();
      const dot1 = createDot('writerA', 1);
      const dot2 = createDot('writerB', 2);
      orsetAdd(state.nodeAlive, 'x', dot1);
      orsetAdd(state.nodeAlive, 'x', dot2);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 3,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      builder.removeNode('x');

      const patch = builder.build();
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toHaveLength(2);
      // orsetGetDots returns already-encoded dots (strings like "writerId:counter")
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toContain('writerA:1');
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toContain('writerB:2');
    });

    it('returns this for chaining', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      const result = builder.removeNode('x');
      expect(result).toBe(builder);
    });
  });

  describe('building patch with edge add/remove', () => {
    it('creates EdgeAdd operation with dot', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addEdge('a', 'b', 'follows');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('EdgeAdd');
      expect(/** @type {any} */ (patch.ops[0]).from).toBe('a');
      expect(/** @type {any} */ (patch.ops[0]).to).toBe('b');
      expect(/** @type {any} */ (patch.ops[0]).label).toBe('follows');
      expect(/** @type {any} */ (patch.ops[0]).dot).toEqual({ writerId: 'writer1', counter: 1 });
    });

    it('creates EdgeRemove operation with observedDots from state', () => {
      const state = createMockState();
      const existingDot = createDot('otherWriter', 3);
      const edgeKey = encodeEdgeKey('a', 'b', 'follows');
      orsetAdd(state.edgeAlive, edgeKey, existingDot);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 2,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      builder.removeEdge('a', 'b', 'follows');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('EdgeRemove');
      expect(/** @type {any} */ (patch.ops[0]).from).toBe('a');
      expect(/** @type {any} */ (patch.ops[0]).to).toBe('b');
      expect(/** @type {any} */ (patch.ops[0]).label).toBe('follows');
      // orsetGetDots returns already-encoded dots (strings like "writerId:counter")
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toEqual(['otherWriter:3']);
    });

    it('addEdge returns this for chaining', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      expect(builder.addEdge('a', 'b', 'rel')).toBe(builder);
    });

    it('removeEdge returns this for chaining', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      expect(builder.removeEdge('a', 'b', 'rel')).toBe(builder);
    });
  });

  describe('building patch with property set', () => {
    it('creates PropSet operation without dot', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.setProperty('x', 'name', 'Alice');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('PropSet');
      expect(/** @type {any} */ (patch.ops[0]).node).toBe('x');
      expect(/** @type {any} */ (patch.ops[0]).key).toBe('name');
      expect(/** @type {any} */ (patch.ops[0]).value).toBe('Alice');
      // PropSet should NOT have a dot field
      expect(/** @type {any} */ (patch.ops[0]).dot).toBeUndefined();
    });

    it('does not increment version vector for props', () => {
      const vv = createVersionVector();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.setProperty('x', 'name', 'Alice');
      builder.setProperty('x', 'age', 30);

      // Version vector should be unchanged (props don't use dots)
      expect(builder.versionVector.get('writer1')).toBeUndefined();
    });

    it('returns this for chaining', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      expect(builder.setProperty('x', 'name', 'Alice')).toBe(builder);
    });

    it('handles various value types', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder
        .setProperty('node', 'string', 'hello')
        .setProperty('node', 'number', 42)
        .setProperty('node', 'boolean', true)
        .setProperty('node', 'null', null)
        .setProperty('node', 'array', [1, 2, 3])
        .setProperty('node', 'object', { key: 'value' });

      const patch = builder.build();
      expect(patch.ops).toHaveLength(6);
      expect(/** @type {any} */ (patch.ops[0]).value).toBe('hello');
      expect(/** @type {any} */ (patch.ops[1]).value).toBe(42);
      expect(/** @type {any} */ (patch.ops[2]).value).toBe(true);
      expect(/** @type {any} */ (patch.ops[3]).value).toBe(null);
      expect(/** @type {any} */ (patch.ops[4]).value).toEqual([1, 2, 3]);
      expect(/** @type {any} */ (patch.ops[5]).value).toEqual({ key: 'value' });
    });
  });

  describe('multiple operations increment the VersionVector', () => {
    it('increments version vector for each add operation', () => {
      const vv = createVersionVector();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.addNode('a');
      expect(builder.versionVector.get('writer1')).toBe(1);

      builder.addNode('b');
      expect(builder.versionVector.get('writer1')).toBe(2);

      builder.addEdge('a', 'b', 'link');
      expect(builder.versionVector.get('writer1')).toBe(3);
    });

    it('assigns sequential dots to operations', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('a').addNode('b').addEdge('a', 'b', 'link');

      const patch = builder.build();
      expect(/** @type {any} */ (patch.ops[0]).dot).toEqual({ writerId: 'writer1', counter: 1 });
      expect(/** @type {any} */ (patch.ops[1]).dot).toEqual({ writerId: 'writer1', counter: 2 });
      expect(/** @type {any} */ (patch.ops[2]).dot).toEqual({ writerId: 'writer1', counter: 3 });
    });

    it('preserves existing version vector entries', () => {
      const vv = createVersionVector();
      vv.set('otherWriter', 10);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.addNode('x');

      // Should have both entries
      expect(builder.versionVector.get('writer1')).toBe(1);
      expect(builder.versionVector.get('otherWriter')).toBe(10);
    });

    it('continues from existing counter for same writer', () => {
      const vv = createVersionVector();
      vv.set('writer1', 5);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.addNode('x');

      expect(builder.versionVector.get('writer1')).toBe(6);
      expect(/** @type {any} */ (builder.ops[0]).dot).toEqual({ writerId: 'writer1', counter: 6 });
    });

    it('does not mutate original version vector', () => {
      const originalVv = createVersionVector();
      originalVv.set('writer1', 3);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: originalVv,
        getCurrentState: () => null,
      }));

      builder.addNode('x');

      // Original should be unchanged
      expect(originalVv.get('writer1')).toBe(3);
      // Builder's copy should be updated
      expect(builder.versionVector.get('writer1')).toBe(4);
    });
  });

  describe('empty state produces empty observedDots', () => {
    it('removeNode with null state returns empty observedDots', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.removeNode('x');

      const patch = builder.build();
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toEqual([]);
    });

    it('removeNode with empty state returns empty observedDots', () => {
      const state = createMockState();

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      builder.removeNode('x'); // Node doesn't exist in state

      const patch = builder.build();
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toEqual([]);
    });

    it('removeEdge with null state returns empty observedDots', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.removeEdge('a', 'b', 'rel');

      const patch = builder.build();
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toEqual([]);
    });

    it('removeEdge with empty state returns empty observedDots', () => {
      const state = createMockState();

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      builder.removeEdge('a', 'b', 'rel'); // Edge doesn't exist in state

      const patch = builder.build();
      expect(/** @type {any} */ (patch.ops[0]).observedDots).toEqual([]);
    });
  });

  describe('patch context includes version vector', () => {
    it('build() includes context version vector', () => {
      const vv = createVersionVector();
      vv.set('otherWriter', 5);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.addNode('x');

      const patch = builder.build();
      expect(patch.context).toBeDefined();
      expect(/** @type {any} */ (patch.context).get('writer1')).toBe(1);
      expect(/** @type {any} */ (patch.context).get('otherWriter')).toBe(5);
    });

    it('context is the updated version vector with increments', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('a').addNode('b').addEdge('a', 'b', 'link');

      const patch = builder.build();
      // Context should reflect all 3 increments
      expect(/** @type {any} */ (patch.context).get('writer1')).toBe(3);
    });
  });

  describe('ops getter', () => {
    it('returns the operations array', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('x');

      expect(builder.ops).toHaveLength(1);
      expect(builder.ops[0].type).toBe('NodeAdd');
    });

    it('returns empty array when no operations', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      expect(builder.ops).toEqual([]);
    });
  });

  describe('complex patch building', () => {
    it('preserves operation order', () => {
      const state = createMockState();
      const nodeDot = createDot('writer1', 1);
      orsetAdd(state.nodeAlive, 'b', nodeDot);

      // Start from counter 1 since we added dot with counter 1
      const vv = createVersionVector();
      vv.set('writer1', 1);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 2,
        versionVector: vv,
        getCurrentState: () => state,
      }));

      builder
        .addNode('a')
        .addEdge('a', 'b', 'link')
        .setProperty('a', 'name', 'A')
        .removeEdge('a', 'b', 'link')
        .removeNode('b');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(5);
      expect(patch.ops[0].type).toBe('NodeAdd');
      expect(patch.ops[1].type).toBe('EdgeAdd');
      expect(patch.ops[2].type).toBe('PropSet');
      expect(patch.ops[3].type).toBe('EdgeRemove');
      expect(patch.ops[4].type).toBe('NodeRemove');
    });

    it('supports method chaining for all operations', () => {
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      const result = builder
        .addNode('a')
        .addNode('b')
        .addEdge('a', 'b', 'follows')
        .setProperty('a', 'name', 'Alice')
        .removeNode('c')
        .removeEdge('x', 'y', 'rel');

      expect(result).toBe(builder);
      expect(builder.ops).toHaveLength(6);
    });
  });

  describe('commit()', () => {
    it('commits a patch and returns the commit SHA', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('x');
      const sha = await builder.commit();

      expect(sha).toBe('c'.repeat(40));
      expect(persistence.writeBlob).toHaveBeenCalledOnce();
      expect(persistence.writeTree).toHaveBeenCalledOnce();
      expect(persistence.commitNodeWithTree).toHaveBeenCalledOnce();
      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/warp/test-graph/writers/writer1',
        'c'.repeat(40)
      );
    });

    it('throws error for empty patch', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      await expect(builder.commit()).rejects.toThrow('Cannot commit empty patch');
    });

    it('creates commit with schema:2 in trailers', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('x');
      await builder.commit();

      // Check the commit message passed to commitNodeWithTree
      const commitCall = persistence.commitNodeWithTree.mock.calls[0][0];
      const decoded = decodePatchMessage(commitCall.message);

      expect(decoded.schema).toBe(2);
      expect(decoded.writer).toBe('writer1');
      expect(decoded.graph).toBe('test-graph');
      expect(decoded.lamport).toBe(1);
    });

    it('increments lamport when continuing from existing ref', async () => {
      const persistence = createMockPersistence();
      const existingSha = 'd'.repeat(40);
      const existingPatchOid = 'e'.repeat(40);
      // Simulate existing ref with lamport 5
      persistence.readRef.mockResolvedValue(existingSha);
      persistence.showNode.mockResolvedValue(
        `warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: 5\neg-patch-oid: ${existingPatchOid}\neg-schema: 2`
      );

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1, // Constructor lamport is 1, but commit should use 6
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: existingSha, // Race detection: expected parent matches current ref
      }));

      builder.addNode('x');
      await builder.commit();

      // Check the commit has lamport 6 (5 + 1)
      const commitCall = persistence.commitNodeWithTree.mock.calls[0][0];
      const decoded = decodePatchMessage(commitCall.message);
      expect(decoded.lamport).toBe(6);

      // Parent should be the existing commit
      expect(commitCall.parents).toEqual([existingSha]);
    });

    it('creates tree with patch.cbor blob', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('x');
      await builder.commit();

      // Check writeTree was called with correct format
      const treeCall = persistence.writeTree.mock.calls[0][0];
      expect(treeCall).toHaveLength(1);
      expect(treeCall[0]).toMatch(/^100644 blob [a-f0-9]+\tpatch\.cbor$/);
    });

    it('writes patch blob with CBOR encoding', async () => {
      const persistence = createMockPersistence();
      const vv = createVersionVector();
      vv.set('otherWriter', 3);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      }));

      builder.addNode('x').setProperty('x', 'name', 'X');
      await builder.commit();

      // Decode the blob that was written
      const blobData = persistence.writeBlob.mock.calls[0][0];
      /** @type {any} */
      const patch = decode(blobData);

      expect(patch.schema).toBe(2);
      expect(patch.writer).toBe('writer1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(2);
      expect(patch.ops[0].type).toBe('NodeAdd');
      expect(patch.ops[1].type).toBe('PropSet');
      // Context should be serialized version vector
      expect(patch.context).toBeDefined();
    });

    it('first commit has no parents', async () => {
      const persistence = createMockPersistence();
      // No existing ref
      persistence.readRef.mockResolvedValue(null);

      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      builder.addNode('x');
      await builder.commit();

      const commitCall = persistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitCall.parents).toEqual([]);
    });
  });

  describe('reads/writes provenance tracking (HG/IO/1)', () => {
    describe('NodeAdd', () => {
      it('tracks nodeId as write', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addNode('user:alice');

        expect(builder.writes.has('user:alice')).toBe(true);
        expect(builder.reads.has('user:alice')).toBe(false);
      });

      it('includes writes in built patch', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addNode('user:alice').addNode('user:bob');

        const patch = builder.build();
        expect(patch.writes).toEqual(['user:alice', 'user:bob']);
        expect(patch.reads).toBeUndefined(); // Empty reads omitted
      });
    });

    describe('NodeRemove', () => {
      it('tracks nodeId as read', () => {
        const state = createMockState();
        const existingDot = createDot('otherWriter', 5);
        orsetAdd(state.nodeAlive, 'user:alice', existingDot);

        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 2,
          versionVector: createVersionVector(),
          getCurrentState: () => state,
        }));

        builder.removeNode('user:alice');

        expect(builder.reads.has('user:alice')).toBe(true);
        expect(builder.writes.has('user:alice')).toBe(false);
      });

      it('includes reads in built patch', () => {
        const state = createMockState();
        const existingDot = createDot('otherWriter', 5);
        orsetAdd(state.nodeAlive, 'user:alice', existingDot);

        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 2,
          versionVector: createVersionVector(),
          getCurrentState: () => state,
        }));

        builder.removeNode('user:alice');

        const patch = builder.build();
        expect(patch.reads).toEqual(['user:alice']);
        expect(patch.writes).toBeUndefined(); // Empty writes omitted
      });
    });

    describe('EdgeAdd', () => {
      it('tracks endpoint nodes as reads and edge key as write', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addEdge('user:alice', 'user:bob', 'follows');

        // Reads both endpoint nodes
        expect(builder.reads.has('user:alice')).toBe(true);
        expect(builder.reads.has('user:bob')).toBe(true);

        // Writes the edge key (encoded as from\0to\0label)
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        expect(builder.writes.has(edgeKey)).toBe(true);
      });

      it('includes reads and writes in built patch', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addEdge('user:alice', 'user:bob', 'follows');

        const patch = builder.build();
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');

        expect(patch.reads).toEqual(['user:alice', 'user:bob']);
        expect(patch.writes).toEqual([edgeKey]);
      });
    });

    describe('EdgeRemove', () => {
      it('tracks edge key as read', () => {
        const state = createMockState();
        const existingDot = createDot('otherWriter', 3);
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        orsetAdd(state.edgeAlive, edgeKey, existingDot);

        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 2,
          versionVector: createVersionVector(),
          getCurrentState: () => state,
        }));

        builder.removeEdge('user:alice', 'user:bob', 'follows');

        expect(builder.reads.has(edgeKey)).toBe(true);
        expect(builder.writes.has(edgeKey)).toBe(false);
      });

      it('includes reads in built patch', () => {
        const state = createMockState();
        const existingDot = createDot('otherWriter', 3);
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        orsetAdd(state.edgeAlive, edgeKey, existingDot);

        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 2,
          versionVector: createVersionVector(),
          getCurrentState: () => state,
        }));

        builder.removeEdge('user:alice', 'user:bob', 'follows');

        const patch = builder.build();
        expect(patch.reads).toEqual([edgeKey]);
        expect(patch.writes).toBeUndefined();
      });
    });

    describe('PropSet on node', () => {
      it('tracks nodeId as both read and write', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.setProperty('user:alice', 'name', 'Alice');

        expect(builder.reads.has('user:alice')).toBe(true);
        expect(builder.writes.has('user:alice')).toBe(true);
      });

      it('includes in both reads and writes arrays', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.setProperty('user:alice', 'name', 'Alice');

        const patch = builder.build();
        expect(patch.reads).toEqual(['user:alice']);
        expect(patch.writes).toEqual(['user:alice']);
      });
    });

    describe('setEdgeProperty', () => {
      it('tracks edge key as both read and write', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        // First add the edge, then set property
        builder.addEdge('user:alice', 'user:bob', 'follows');
        builder.setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01');

        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        expect(builder.reads.has(edgeKey)).toBe(true);
        expect(builder.writes.has(edgeKey)).toBe(true);
      });

      it('includes edge key in built patch reads and writes', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addEdge('user:alice', 'user:bob', 'follows');
        builder.setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01');

        const patch = builder.build();
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');

        // Reads includes alice, bob (from addEdge) and edgeKey (from setEdgeProperty)
        expect(patch.reads).toContain('user:alice');
        expect(patch.reads).toContain('user:bob');
        expect(patch.reads).toContain(edgeKey);

        // Writes includes edgeKey (from both addEdge and setEdgeProperty)
        expect(patch.writes).toContain(edgeKey);
      });
    });

    describe('complex patches', () => {
      it('deduplicates reads and writes', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        // Add node twice via different operations should only appear once
        builder.addNode('user:alice');
        builder.setProperty('user:alice', 'name', 'Alice');
        builder.setProperty('user:alice', 'email', 'alice@example.com');

        const patch = builder.build();

        // Should be deduplicated and sorted
        expect(patch.writes).toEqual(['user:alice']);
        expect(patch.reads).toEqual(['user:alice']);
      });

      it('sorts reads and writes deterministically', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        // Add nodes in non-alphabetical order
        builder.addNode('user:zebra');
        builder.addNode('user:alice');
        builder.addNode('user:middle');

        const patch = builder.build();

        // Should be sorted
        expect(patch.writes).toEqual(['user:alice', 'user:middle', 'user:zebra']);
      });

      it('handles mixed operations correctly', () => {
        const state = createMockState();
        // Pre-populate state with an existing node and edge
        const nodeDot = createDot('writer0', 1);
        const edgeDot = createDot('writer0', 2);
        orsetAdd(state.nodeAlive, 'user:existing', nodeDot);
        const existingEdgeKey = encodeEdgeKey('user:existing', 'user:target', 'knows');
        orsetAdd(state.edgeAlive, existingEdgeKey, edgeDot);

        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 2,
          versionVector: createVersionVector(),
          getCurrentState: () => state,
        }));

        builder
          .addNode('user:new')                           // writes: new
          .addEdge('user:new', 'user:friend', 'likes')   // reads: new, friend; writes: edge
          .removeNode('user:existing')                    // reads: existing
          .removeEdge('user:existing', 'user:target', 'knows') // reads: existing edge
          .setProperty('user:new', 'name', 'New');       // reads: new; writes: new

        const patch = builder.build();
        const newEdgeKey = encodeEdgeKey('user:new', 'user:friend', 'likes');

        // Reads should include: user:new, user:friend (from addEdge),
        // user:existing (from removeNode), existing edge key (from removeEdge)
        expect(patch.reads).toContain('user:new');
        expect(patch.reads).toContain('user:friend');
        expect(patch.reads).toContain('user:existing');
        expect(patch.reads).toContain(existingEdgeKey);

        // Writes should include: user:new (addNode + setProperty), new edge key (addEdge)
        expect(patch.writes).toContain('user:new');
        expect(patch.writes).toContain(newEdgeKey);

        // user:existing should NOT be in writes (only removed, not added)
        expect(patch.writes).not.toContain('user:existing');
      });
    });

    describe('backward compatibility', () => {
      it('omits empty reads array from patch', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addNode('x'); // Only writes, no reads

        const patch = builder.build();
        expect(patch.writes).toEqual(['x']);
        expect(patch.reads).toBeUndefined();
      });

      it('omits empty writes array from patch', () => {
        const state = createMockState();
        const existingDot = createDot('otherWriter', 5);
        orsetAdd(state.nodeAlive, 'x', existingDot);

        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 2,
          versionVector: createVersionVector(),
          getCurrentState: () => state,
        }));

        builder.removeNode('x'); // Only reads, no writes

        const patch = builder.build();
        expect(patch.reads).toEqual(['x']);
        expect(patch.writes).toBeUndefined();
      });

      it('handles patch with no ops gracefully (builds but cannot commit)', () => {
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        // Build empty patch (no ops)
        const patch = builder.build();
        expect(patch.reads).toBeUndefined();
        expect(patch.writes).toBeUndefined();
        expect(patch.ops).toEqual([]);
      });
    });

    describe('commit() includes reads/writes', () => {
      it('committed patch includes reads/writes arrays', async () => {
        const persistence = createMockPersistence();
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          persistence,
          graphName: 'test-graph',
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addNode('user:alice').setProperty('user:alice', 'name', 'Alice');
        await builder.commit();

        // Decode the CBOR blob that was written
        const blobData = persistence.writeBlob.mock.calls[0][0];
        /** @type {any} */
        const patch = decode(blobData);

        expect(patch.reads).toEqual(['user:alice']);
        expect(patch.writes).toEqual(['user:alice']);
      });

      it('committed patch omits empty reads array', async () => {
        const persistence = createMockPersistence();
        const builder = new PatchBuilderV2(/** @type {any} */ ({
          persistence,
          graphName: 'test-graph',
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
        }));

        builder.addNode('x'); // Only writes, no reads

        await builder.commit();

        const blobData = persistence.writeBlob.mock.calls[0][0];
        /** @type {any} */
        const patch = decode(blobData);

        expect(patch.writes).toEqual(['x']);
        expect(patch.reads).toBeUndefined();
      });
    });
  });
});
