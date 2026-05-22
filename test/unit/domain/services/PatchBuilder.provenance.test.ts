import { describe, it, expect } from 'vitest';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import { requirePatchOp } from '../PatchOperationAssertions.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence as createMockPersistence,
  createPatchBuilderMockState as createMockState,
  createPatchJournal,
  decodeWrittenPatch,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder provenance', () => {
  describe('reads/writes provenance tracking (HG/IO/1)', () => {
    describe('NodeAdd', () => {
      it('tracks nodeId as write', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.addNode('user:alice');

        expect(builder.writes.has('user:alice')).toBe(true);
        expect(builder.reads.has('user:alice')).toBe(false);
      });

      it('includes writes in built patch', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.addNode('user:alice').addNode('user:bob');

        const patch = builder.build();
        expect(patch.writes).toEqual(['user:alice', 'user:bob']);
        expect(patch.reads).toBeUndefined(); // Empty reads omitted
      });
    });

    describe('NodeRemove', () => {
      it('tracks nodeId as read', () => {
        const state = createMockState();
        const existingDot = Dot.create('otherWriter', 5);
        state.nodeAlive.add('user:alice', existingDot);

        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 2,
          versionVector: VersionVector.empty(),
          getCurrentState: () => state,
        });

        builder.removeNode('user:alice');

        expect(builder.reads.has('user:alice')).toBe(true);
        expect(builder.writes.has('user:alice')).toBe(false);
      });

      it('includes reads in built patch', () => {
        const state = createMockState();
        const existingDot = Dot.create('otherWriter', 5);
        state.nodeAlive.add('user:alice', existingDot);

        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 2,
          versionVector: VersionVector.empty(),
          getCurrentState: () => state,
        });

        builder.removeNode('user:alice');

        const patch = builder.build();
        expect(patch.reads).toEqual(['user:alice']);
        expect(patch.writes).toBeUndefined(); // Empty writes omitted
      });
    });

    describe('EdgeAdd', () => {
      it('tracks endpoint nodes as reads and edge key as write', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.addEdge('user:alice', 'user:bob', 'follows');

        // Reads both endpoint nodes
        expect(builder.reads.has('user:alice')).toBe(true);
        expect(builder.reads.has('user:bob')).toBe(true);

        // Writes the edge key (encoded as from\0to\0label)
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        expect(builder.writes.has(edgeKey)).toBe(true);
      });

      it('includes reads and writes in built patch', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

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
        const existingDot = Dot.create('otherWriter', 3);
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        state.edgeAlive.add(edgeKey, existingDot);

        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 2,
          versionVector: VersionVector.empty(),
          getCurrentState: () => state,
        });

        builder.removeEdge('user:alice', 'user:bob', 'follows');

        expect(builder.reads.has(edgeKey)).toBe(true);
        expect(builder.writes.has(edgeKey)).toBe(false);
      });

      it('includes reads in built patch', () => {
        const state = createMockState();
        const existingDot = Dot.create('otherWriter', 3);
        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        state.edgeAlive.add(edgeKey, existingDot);

        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 2,
          versionVector: VersionVector.empty(),
          getCurrentState: () => state,
        });

        builder.removeEdge('user:alice', 'user:bob', 'follows');

        const patch = builder.build();
        expect(patch.reads).toEqual([edgeKey]);
        expect(patch.writes).toBeUndefined();
      });
    });

    describe('PropSet on node', () => {
      it('tracks nodeId as both read and write', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.setProperty('user:alice', 'name', 'Alice');

        expect(builder.reads.has('user:alice')).toBe(true);
        expect(builder.writes.has('user:alice')).toBe(true);
      });

      it('includes in both reads and writes arrays', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.setProperty('user:alice', 'name', 'Alice');

        const patch = builder.build();
        expect(patch.reads).toEqual(['user:alice']);
        expect(patch.writes).toEqual(['user:alice']);
      });
    });

    describe('setEdgeProperty', () => {
      it('tracks edge key as both read and write', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        // First add the edge, then set property
        builder.addEdge('user:alice', 'user:bob', 'follows');
        builder.setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01');

        const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
        expect(builder.reads.has(edgeKey)).toBe(true);
        expect(builder.writes.has(edgeKey)).toBe(true);
      });

      it('includes edge key in built patch reads and writes', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

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
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

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
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

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
        const nodeDot = Dot.create('writer0', 1);
        const edgeDot = Dot.create('writer0', 2);
        state.nodeAlive.add('user:existing', nodeDot);
        const existingEdgeKey = encodeEdgeKey('user:existing', 'user:target', 'knows');
        state.edgeAlive.add(existingEdgeKey, edgeDot);

        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 2,
          versionVector: VersionVector.empty(),
          getCurrentState: () => state,
        });

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
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.addNode('x'); // Only writes, no reads

        const patch = builder.build();
        expect(patch.writes).toEqual(['x']);
        expect(patch.reads).toBeUndefined();
      });

      it('omits empty writes array from patch', () => {
        const state = createMockState();
        const existingDot = Dot.create('otherWriter', 5);
        state.nodeAlive.add('x', existingDot);

        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 2,
          versionVector: VersionVector.empty(),
          getCurrentState: () => state,
        });

        builder.removeNode('x'); // Only reads, no writes

        const patch = builder.build();
        expect(patch.reads).toEqual(['x']);
        expect(patch.writes).toBeUndefined();
      });

      it('handles patch with no ops gracefully (builds but cannot commit)', () => {
        const builder = createPatchBuilder({
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

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
        const patchJournal = createPatchJournal(persistence);
        const builder = createPatchBuilder({
          persistence,
          patchJournal,
          graphName: 'test-graph',
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.addNode('user:alice').setProperty('user:alice', 'name', 'Alice');
        await builder.commit();

        // Decode the CBOR blob that was written
        const patch = decodeWrittenPatch(persistence);

        expect(patch.reads).toEqual(['user:alice']);
        expect(patch.writes).toEqual(['user:alice']);
      });

      it('committed patch omits empty reads array', async () => {
        const persistence = createMockPersistence();
        const patchJournal = createPatchJournal(persistence);
        const builder = createPatchBuilder({
          persistence,
          patchJournal,
          graphName: 'test-graph',
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
          getCurrentState: () => null,
        });

        builder.addNode('x'); // Only writes, no reads

        await builder.commit();

        const patch = decodeWrittenPatch(persistence);

        expect(patch.writes).toEqual(['x']);
        expect(patch.reads).toBeUndefined();
      });
    });
  });

  describe('removeNode / removeEdge without materialized state', () => {
    it('removeNode throws PatchError when state is null', () => {
      const vv = VersionVector.empty();
      const builder = createPatchBuilder({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      });

      expect(() => builder.removeNode('alice')).toThrow(PatchError);
    });

    it('removeNode error has code E_PATCH_NO_STATE', () => {
      const vv = VersionVector.empty();
      const builder = createPatchBuilder({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      });

      expect(() => builder.removeNode('alice')).toThrow(
        expect.objectContaining({ code: 'E_PATCH_NO_STATE' }),
      );
    });

    it('removeEdge throws PatchError when state is null', () => {
      const vv = VersionVector.empty();
      const builder = createPatchBuilder({
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      });

      expect(() => builder.removeEdge('a', 'b', 'knows')).toThrow(PatchError);
    });

    it('removeNode works when state is available', () => {
      const state = createMockState();
      state.nodeAlive.add('alice', Dot.create('writer1', 1));

      const vv = VersionVector.empty();
      const builder = createPatchBuilder({
        writerId: 'writer1',
        lamport: 2,
        versionVector: vv,
        getCurrentState: () => state,
      });

      builder.removeNode('alice');
      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      const op = requirePatchOp(patch, 0);
      expect(op).toMatchObject({ type: 'NodeRemove' });
      if (op.type !== 'NodeRemove') {
        throw new Error('Expected NodeRemove op');
      }
      expect(op.observedDots.length).toBeGreaterThan(0);
    });
  });
});
