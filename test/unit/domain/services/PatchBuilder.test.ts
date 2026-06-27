import { describe, it, expect, vi } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import { decodePatchMessage } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { decode } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * Creates a mock V5 state for testing.
 * @returns {any} Mock state with nodeAlive and edgeAlive ORSets
 */
function createMockState() {
  return {
    nodeAlive: ORSet.empty(),
    edgeAlive: ORSet.empty(),
    prop: new Map(),
    observedFrontier: VersionVector.empty(),
  };
}

/**
 * Creates a mock persistence adapter for testing commit().
 * @returns {any} Mock persistence with standard methods stubbed
 */
function createMockPersistence() {
  const persistence = {
    readRef: vi.fn().mockResolvedValue(null),
    showNode: vi.fn(),
    writeBlob: vi.fn().mockResolvedValue('a'.repeat(40)), // Valid 40-char hex OID
    writeTree: vi.fn().mockResolvedValue('b'.repeat(40)),
    commitNodeWithTree: vi.fn().mockResolvedValue('c'.repeat(40)),
    updateRef: vi.fn().mockResolvedValue(undefined),
    compareAndSwapRef: vi.fn(),
  };
  persistence.compareAndSwapRef.mockImplementation(async (ref, newOid, expectedOid) => {
    const actualOid = await persistence.readRef(ref);
    if (actualOid !== expectedOid) {
      throw new Error(`CAS mismatch for ${ref}`);
    }
    persistence.readRef.mockResolvedValue(newOid);
  });
  return persistence;
}

/**
 * Creates a CborPatchJournalAdapter wired to the given mock persistence's blob ops.
 * @param {ReturnType<typeof createMockPersistence>} persistence
 * @returns {CborPatchJournalAdapter}
 */
function createPatchJournal(persistence) {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
  });
}

describe('PatchBuilder', () => {
  it('test fixture compareAndSwapRef rejects expected-head mismatches', async () => {
    const persistence = createMockPersistence();
    const currentSha = 'a'.repeat(40);
    const nextSha = 'b'.repeat(40);
    persistence.readRef.mockResolvedValue(currentSha);

    await expect(
      persistence.compareAndSwapRef('refs/warp/events/writers/writer-1', nextSha, null)
    ).rejects.toThrow('CAS mismatch');
  });

  describe('building patch with node add', () => {
    it('creates NodeAdd operation with dot', () => {
      const vv = VersionVector.empty();
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      } as any));

      builder.addNode('x');

      const patch = builder.build();
      expect(patch.schema).toBe(2);
      expect(patch.writer).toBe('writer1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(1);
      const op0 = (patch.ops[0] as any);
      expect(op0.type).toBe('NodeAdd');
      expect(op0.node).toBe('x');
      expect(op0.dot).toEqual({ writerId: 'writer1', counter: 1 });
    });

    it('returns this for chaining', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      const result = builder.addNode('x');
      expect(result).toBe(builder);
    });
  });

  describe('building patch with node remove', () => {
    it('creates NodeRemove operation with observedDots from state', () => {
      const state = createMockState();
      // Add a node with a dot to the mock state
      const existingDot = Dot.create('otherWriter', 5);
      state.nodeAlive.add('x', existingDot);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 2,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      builder.removeNode('x');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      const op0 = (patch.ops[0] as any);
      expect(op0.type).toBe('NodeRemove');
      expect(op0.node).toBe('x');
      // orsetGetDots returns already-encoded dots (strings like "writerId:counter")
      expect(op0.observedDots).toEqual(['otherWriter:5']);
    });

    it('includes multiple observed dots when node has multiple adds', () => {
      const state = createMockState();
      const dot1 = Dot.create('writerA', 1);
      const dot2 = Dot.create('writerB', 2);
      state.nodeAlive.add('x', dot1);
      state.nodeAlive.add('x', dot2);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 3,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      builder.removeNode('x');

      const patch = builder.build();
      expect((patch.ops[0] as any).observedDots).toHaveLength(2);
      // orsetGetDots returns already-encoded dots (strings like "writerId:counter")
      expect((patch.ops[0] as any).observedDots).toContain('writerA:1');
      expect((patch.ops[0] as any).observedDots).toContain('writerB:2');
    });

    it('returns this for chaining', () => {
      const state = createMockState();
      state.nodeAlive.add('x', Dot.create('w', 1));
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      const result = builder.removeNode('x');
      expect(result).toBe(builder);
    });
  });

  describe('building patch with edge add/remove', () => {
    it('creates EdgeAdd operation with dot', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      builder.addEdge('a', 'b', 'follows');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      const op0 = (patch.ops[0] as any);
      expect(op0.type).toBe('EdgeAdd');
      expect(op0.from).toBe('a');
      expect(op0.to).toBe('b');
      expect(op0.label).toBe('follows');
      expect(op0.dot).toEqual({ writerId: 'writer1', counter: 1 });
    });

    it('creates EdgeRemove operation with observedDots from state', () => {
      const state = createMockState();
      const existingDot = Dot.create('otherWriter', 3);
      const edgeKey = encodeEdgeKey('a', 'b', 'follows');
      state.edgeAlive.add(edgeKey, existingDot);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 2,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      builder.removeEdge('a', 'b', 'follows');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      const op0 = (patch.ops[0] as any);
      expect(op0.type).toBe('EdgeRemove');
      expect(op0.from).toBe('a');
      expect(op0.to).toBe('b');
      expect(op0.label).toBe('follows');
      // orsetGetDots returns already-encoded dots (strings like "writerId:counter")
      expect(op0.observedDots).toEqual(['otherWriter:3']);
    });

    it('addEdge returns this for chaining', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      expect(builder.addEdge('a', 'b', 'rel')).toBe(builder);
    });

    it('removeEdge returns this for chaining', () => {
      const state = createMockState();
      const ek = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(ek, Dot.create('w', 1));
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      expect(builder.removeEdge('a', 'b', 'rel')).toBe(builder);
    });
  });

  describe('building patch with property set', () => {
    it('creates PropSet operation without dot', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      builder.setProperty('x', 'name', 'Alice');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      const op0 = patch.ops[0] as any;
      expect(op0.type).toBe('PropSet');
      expect(op0.node).toBe('x');
      expect(op0.key).toBe('name');
      expect(op0.value).toBe('Alice');
      // PropSet should NOT have a dot field
      expect(op0.dot).toBeUndefined();
    });

    it('does not increment version vector for props', () => {
      const vv = VersionVector.empty();
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      } as any));

      builder.setProperty('x', 'name', 'Alice');
      builder.setProperty('x', 'age', 30);

      // Version vector should be unchanged (props don't use dots)
      expect(builder.versionVector.get('writer1')).toBeUndefined();
    });

    it('returns this for chaining', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      expect(builder.setProperty('x', 'name', 'Alice')).toBe(builder);
    });

    it('handles various value types', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      builder
        .setProperty('node', 'string', 'hello')
        .setProperty('node', 'number', 42)
        .setProperty('node', 'boolean', true)
        .setProperty('node', 'null', null)
        .setProperty('node', 'array', [1, 2, 3])
        .setProperty('node', 'object', { key: 'value' });

      const patch = builder.build();
      expect(patch.ops).toHaveLength(6);
      expect((patch.ops[0] as any).value).toBe('hello');
      expect((patch.ops[1] as any).value).toBe(42);
      expect((patch.ops[2] as any).value).toBe(true);
      expect((patch.ops[3] as any).value).toBe(null);
      expect((patch.ops[4] as any).value).toEqual([1, 2, 3]);
      expect((patch.ops[5] as any).value).toEqual({ key: 'value' });
    });
  });

  describe('multiple operations increment the VersionVector', () => {
    it('increments version vector for each add operation', () => {
      const vv = VersionVector.empty();
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      } as any));

      builder.addNode('a');
      expect(builder.versionVector.get('writer1')).toBe(1);

      builder.addNode('b');
      expect(builder.versionVector.get('writer1')).toBe(2);

      builder.addEdge('a', 'b', 'link');
      expect(builder.versionVector.get('writer1')).toBe(3);
    });

    it('assigns sequential dots to operations', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      builder.addNode('a').addNode('b').addEdge('a', 'b', 'link');

      const patch = builder.build();
      expect((patch.ops[0] as any).dot).toEqual({ writerId: 'writer1', counter: 1 });
      expect((patch.ops[1] as any).dot).toEqual({ writerId: 'writer1', counter: 2 });
      expect((patch.ops[2] as any).dot).toEqual({ writerId: 'writer1', counter: 3 });
    });

    it('preserves existing version vector entries', () => {
      const vv = VersionVector.empty();
      vv.set('otherWriter', 10);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      } as any));

      builder.addNode('x');

      // Should have both entries
      expect(builder.versionVector.get('writer1')).toBe(1);
      expect(builder.versionVector.get('otherWriter')).toBe(10);
    });

    it('continues from existing counter for same writer', () => {
      const vv = VersionVector.empty();
      vv.set('writer1', 5);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      } as any));

      builder.addNode('x');

      expect(builder.versionVector.get('writer1')).toBe(6);
      expect((builder.ops[0] as any).dot).toEqual({ writerId: 'writer1', counter: 6 });
    });

    it('does not mutate original version vector', () => {
      const originalVv = VersionVector.empty();
      originalVv.set('writer1', 3);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: originalVv,
        getCurrentState: () => null,
      } as any));

      builder.addNode('x');

      // Original should be unchanged
      expect(originalVv.get('writer1')).toBe(3);
      // Builder's copy should be updated
      expect(builder.versionVector.get('writer1')).toBe(4);
    });
  });

  describe('entity removal requires existing live dots', () => {
    it('removeNode with null state throws E_PATCH_NO_STATE', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      expect(() => builder.removeNode('x')).toThrow(PatchError);
    });

    it('removeNode with empty state throws E_PATCH_ENTITY_NOT_FOUND', () => {
      const state = createMockState();

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      expect(() => builder.removeNode('x')).toThrow(
        expect.objectContaining({ code: 'E_PATCH_ENTITY_NOT_FOUND' }),
      );
    });

    it('removeEdge with null state throws E_PATCH_NO_STATE', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      expect(() => builder.removeEdge('a', 'b', 'rel')).toThrow(PatchError);
    });

    it('removeEdge with empty state throws E_PATCH_ENTITY_NOT_FOUND', () => {
      const state = createMockState();

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

      expect(() => builder.removeEdge('a', 'b', 'rel')).toThrow(
        expect.objectContaining({ code: 'E_PATCH_ENTITY_NOT_FOUND' }),
      );
    });
  });

  describe('patch context includes version vector', () => {
    it('build() includes context version vector', () => {
      const vv = VersionVector.empty();
      vv.set('otherWriter', 5);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      } as any));

      builder.addNode('x');

      const patch = builder.build();
      expect(patch.context).toBeDefined();
      // vvSerialize converts Map to plain object
      expect((patch.context as any)['writer1']).toBe(1);
      expect((patch.context as any)['otherWriter']).toBe(5);
    });

    it('context is the updated version vector with increments', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      builder.addNode('a').addNode('b').addEdge('a', 'b', 'link');

      const patch = builder.build();
      // Context should reflect all 3 increments (vvSerialize converts Map → plain object)
      expect((patch.context as any)['writer1']).toBe(3);
    });
  });

  describe('ops getter', () => {
    it('returns the operations array', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      builder.addNode('x');

      expect(builder.ops).toHaveLength(1);
      expect((builder.ops[0] as any).type).toBe('NodeAdd');
    });

    it('returns empty array when no operations', () => {
      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      } as any));

      expect(builder.ops).toEqual([]);
    });
  });

  describe('complex patch building', () => {
    it('preserves operation order', () => {
      const state = createMockState();
      const nodeDot = Dot.create('writer1', 1);
      state.nodeAlive.add('b', nodeDot);
      state.nodeAlive.add('c', Dot.create('writer1', 2));
      state.edgeAlive.add(encodeEdgeKey('b', 'c', 'old-link'), Dot.create('writer1', 3));

      // Start from counter 1 since we added dot with counter 1
      const vv = VersionVector.empty();
      vv.set('writer1', 3);

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 2,
        versionVector: vv,
        getCurrentState: () => state,
      } as any));

      builder
        .addNode('a')
        .addEdge('a', 'b', 'link')
        .setProperty('a', 'name', 'A')
        .removeEdge('b', 'c', 'old-link')
        .removeNode('b');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(5);
      expect((patch.ops[0] as any).type).toBe('NodeAdd');
      expect((patch.ops[1] as any).type).toBe('EdgeAdd');
      expect((patch.ops[2] as any).type).toBe('PropSet');
      expect((patch.ops[3] as any).type).toBe('EdgeRemove');
      expect((patch.ops[4] as any).type).toBe('NodeRemove');
    });

    it('supports method chaining for all operations', () => {
      const state = createMockState();
      state.nodeAlive.add('c', Dot.create('w', 1));
      const ek = encodeEdgeKey('x', 'y', 'rel');
      state.edgeAlive.add(ek, Dot.create('w', 2));

      const builder = new PatchBuilder(({
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      } as any));

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
});
