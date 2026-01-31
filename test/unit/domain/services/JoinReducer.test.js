import { describe, it, expect } from 'vitest';
import {
  createEmptyStateV5,
  encodeEdgeKey,
  decodeEdgeKey,
  encodePropKey,
  decodePropKey,
  applyOpV2,
  join,
  joinStates,
  reduceV5,
  cloneStateV5,
} from '../../../../src/domain/services/JoinReducer.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { orsetContains, orsetGetDots } from '../../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';
import { createVersionVector, vvMerge } from '../../../../src/domain/crdt/VersionVector.js';
import { createInlineValue } from '../../../../src/domain/types/WarpTypes.js';

// Helper functions to create V2 operations
function createNodeAddV2(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

function createNodeRemoveV2(observedDots) {
  return { type: 'NodeRemove', observedDots };
}

function createEdgeAddV2(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

function createEdgeRemoveV2(observedDots) {
  return { type: 'EdgeRemove', observedDots };
}

function createPropSetV2(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

function createPatchV2({ writer, lamport, ops, context }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || createVersionVector(),
  };
}

describe('JoinReducer', () => {
  describe('createEmptyStateV5', () => {
    it('returns state with empty ORSets and Maps', () => {
      const state = createEmptyStateV5();

      expect(state.nodeAlive).toBeDefined();
      expect(state.nodeAlive.entries).toBeInstanceOf(Map);
      expect(state.nodeAlive.tombstones).toBeInstanceOf(Set);
      expect(state.edgeAlive).toBeDefined();
      expect(state.prop).toBeInstanceOf(Map);
      expect(state.observedFrontier).toBeInstanceOf(Map);
      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
      expect(state.prop.size).toBe(0);
      expect(state.observedFrontier.size).toBe(0);
    });

    it('returns independent state objects', () => {
      const state1 = createEmptyStateV5();
      const state2 = createEmptyStateV5();

      state1.prop.set('key', { eventId: {}, value: 'test' });

      expect(state2.prop.size).toBe(0);
    });
  });

  describe('encodeEdgeKey / decodeEdgeKey', () => {
    it('encodes edge key with NUL separator', () => {
      const key = encodeEdgeKey('from', 'to', 'label');
      expect(key).toBe('from\0to\0label');
    });

    it('roundtrips correctly', () => {
      const original = { from: 'node:a', to: 'node:b', label: 'edge-type' };
      const encoded = encodeEdgeKey(original.from, original.to, original.label);
      const decoded = decodeEdgeKey(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe('encodePropKey / decodePropKey', () => {
    it('encodes property key with NUL separator', () => {
      const key = encodePropKey('node1', 'name');
      expect(key).toBe('node1\0name');
    });

    it('roundtrips correctly', () => {
      const original = { nodeId: 'user:alice', propKey: 'age' };
      const encoded = encodePropKey(original.nodeId, original.propKey);
      const decoded = decodePropKey(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe('applyOpV2', () => {
    describe('NodeAdd', () => {
      it('adds node to nodeAlive ORSet', () => {
        const state = createEmptyStateV5();
        const dot = createDot('writer1', 1);
        const eventId = createEventId(1, 'writer1', 'abcd1234', 0);
        const op = createNodeAddV2('x', dot);

        applyOpV2(state, op, eventId);

        expect(orsetContains(state.nodeAlive, 'x')).toBe(true);
      });

      it('can add same node with multiple dots', () => {
        const state = createEmptyStateV5();
        const dot1 = createDot('writer1', 1);
        const dot2 = createDot('writer2', 1);

        applyOpV2(state, createNodeAddV2('x', dot1), createEventId(1, 'writer1', 'aaaa1234', 0));
        applyOpV2(state, createNodeAddV2('x', dot2), createEventId(1, 'writer2', 'bbbb1234', 0));

        expect(orsetContains(state.nodeAlive, 'x')).toBe(true);
        const dots = orsetGetDots(state.nodeAlive, 'x');
        expect(dots.size).toBe(2);
      });
    });

    describe('NodeRemove', () => {
      it('removes node by tombstoning observed dots', () => {
        const state = createEmptyStateV5();
        const dot = createDot('writer1', 1);

        // Add node
        applyOpV2(state, createNodeAddV2('x', dot), createEventId(1, 'writer1', 'aaaa1234', 0));
        expect(orsetContains(state.nodeAlive, 'x')).toBe(true);

        // Remove node with observed dots
        const observedDots = new Set(['writer1:1']);
        applyOpV2(
          state,
          createNodeRemoveV2(observedDots),
          createEventId(2, 'writer1', 'bbbb1234', 0)
        );

        expect(orsetContains(state.nodeAlive, 'x')).toBe(false);
      });
    });

    describe('EdgeAdd', () => {
      it('adds edge to edgeAlive ORSet', () => {
        const state = createEmptyStateV5();
        const dot = createDot('writer1', 1);
        const op = createEdgeAddV2('a', 'b', 'rel', dot);

        applyOpV2(state, op, createEventId(1, 'writer1', 'abcd1234', 0));

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);
      });
    });

    describe('EdgeRemove', () => {
      it('removes edge by tombstoning observed dots', () => {
        const state = createEmptyStateV5();
        const dot = createDot('writer1', 1);

        // Add edge
        applyOpV2(
          state,
          createEdgeAddV2('a', 'b', 'rel', dot),
          createEventId(1, 'writer1', 'aaaa1234', 0)
        );
        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);

        // Remove edge
        const observedDots = new Set(['writer1:1']);
        applyOpV2(
          state,
          createEdgeRemoveV2(observedDots),
          createEventId(2, 'writer1', 'bbbb1234', 0)
        );

        expect(orsetContains(state.edgeAlive, edgeKey)).toBe(false);
      });
    });

    describe('PropSet', () => {
      it('sets property value using LWW', () => {
        const state = createEmptyStateV5();
        const eventId = createEventId(1, 'writer1', 'abcd1234', 0);
        const value = createInlineValue('hello');
        const op = createPropSetV2('x', 'name', value);

        applyOpV2(state, op, eventId);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.prop.get(propKey))).toEqual(value);
      });

      it('overwrites property if EventId is greater', () => {
        const state = createEmptyStateV5();
        const eventId1 = createEventId(1, 'writer', 'aaaa1234', 0);
        const eventId2 = createEventId(2, 'writer', 'bbbb1234', 0);
        const value1 = createInlineValue('old');
        const value2 = createInlineValue('new');

        applyOpV2(state, createPropSetV2('x', 'name', value1), eventId1);
        applyOpV2(state, createPropSetV2('x', 'name', value2), eventId2);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.prop.get(propKey))).toEqual(value2);
      });

      it('keeps older property if EventId is lower', () => {
        const state = createEmptyStateV5();
        const eventId1 = createEventId(2, 'writer', 'bbbb1234', 0);
        const eventId2 = createEventId(1, 'writer', 'aaaa1234', 0);
        const value1 = createInlineValue('newer');
        const value2 = createInlineValue('older');

        applyOpV2(state, createPropSetV2('x', 'name', value1), eventId1);
        applyOpV2(state, createPropSetV2('x', 'name', value2), eventId2);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.prop.get(propKey))).toEqual(value1);
      });
    });
  });

  describe('order independence - patches applied in any order produce same state', () => {
    it('join([A, B]) equals join([B, A])', () => {
      // Writer A: NodeAdd("x")
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('A', 1))],
      });
      const shaA = 'aaaa1234';

      // Writer B: NodeAdd("y")
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 1,
        ops: [createNodeAddV2('y', createDot('B', 1))],
      });
      const shaB = 'bbbb1234';

      const stateAB = reduceV5([
        { patch: patchA, sha: shaA },
        { patch: patchB, sha: shaB },
      ]);

      const stateBA = reduceV5([
        { patch: patchB, sha: shaB },
        { patch: patchA, sha: shaA },
      ]);

      // Both states should have the same nodes
      expect(orsetContains(stateAB.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(stateAB.nodeAlive, 'y')).toBe(true);
      expect(orsetContains(stateBA.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(stateBA.nodeAlive, 'y')).toBe(true);
    });

    it('produces identical state for complex graph regardless of patch order', () => {
      const patches = [
        {
          patch: createPatchV2({
            writer: 'w1',
            lamport: 1,
            ops: [createNodeAddV2('a', createDot('w1', 1))],
          }),
          sha: 'aaa11111',
        },
        {
          patch: createPatchV2({
            writer: 'w2',
            lamport: 1,
            ops: [createNodeAddV2('b', createDot('w2', 1))],
          }),
          sha: 'bbb22222',
        },
        {
          patch: createPatchV2({
            writer: 'w3',
            lamport: 2,
            ops: [createEdgeAddV2('a', 'b', 'link', createDot('w3', 1))],
          }),
          sha: 'ccc33333',
        },
      ];

      // Test all permutations produce same result
      const state123 = reduceV5([patches[0], patches[1], patches[2]]);
      const state132 = reduceV5([patches[0], patches[2], patches[1]]);
      const state213 = reduceV5([patches[1], patches[0], patches[2]]);
      const state231 = reduceV5([patches[1], patches[2], patches[0]]);
      const state312 = reduceV5([patches[2], patches[0], patches[1]]);
      const state321 = reduceV5([patches[2], patches[1], patches[0]]);

      // All should have same nodes
      for (const state of [state123, state132, state213, state231, state312, state321]) {
        expect(orsetContains(state.nodeAlive, 'a')).toBe(true);
        expect(orsetContains(state.nodeAlive, 'b')).toBe(true);
        const edgeKey = encodeEdgeKey('a', 'b', 'link');
        expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);
      }
    });
  });

  describe('concurrent add + remove with empty observedDots = add wins', () => {
    it('concurrent add wins when remove has no observed dots', () => {
      // Writer A adds node x with dot A:1
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('A', 1))],
      });

      // Writer B tries to remove x but hasn't observed any dots (empty set)
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 1,
        ops: [createNodeRemoveV2(new Set())],
      });

      // Apply in both orders
      const stateAB = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      const stateBA = reduceV5([
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchA, sha: 'aaaa1234' },
      ]);

      // Add wins because remove didn't observe the add's dot
      expect(orsetContains(stateAB.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(stateBA.nodeAlive, 'x')).toBe(true);
    });

    it('concurrent add and remove: remove only removes observed dots', () => {
      // Writer A adds node x with dot A:1
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('A', 1))],
      });

      // Writer B also adds node x with dot B:1
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('B', 1))],
      });

      // Writer C removes x but only observed A's dot
      const patchC = createPatchV2({
        writer: 'C',
        lamport: 2,
        ops: [createNodeRemoveV2(new Set(['A:1']))],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchC, sha: 'cccc1234' },
      ]);

      // Node x should still exist because B's dot wasn't tombstoned
      expect(orsetContains(state.nodeAlive, 'x')).toBe(true);

      // A's dot should be tombstoned, B's should remain
      const dots = orsetGetDots(state.nodeAlive, 'x');
      expect(dots.has('B:1')).toBe(true);
      expect(dots.has('A:1')).toBe(false);
    });
  });

  describe('Props use LWW with EventId', () => {
    it('same property set by two writers, higher lamport wins', () => {
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createPropSetV2('x', 'name', createInlineValue('A-value'))],
      });

      const patchB = createPatchV2({
        writer: 'B',
        lamport: 2,
        ops: [createPropSetV2('x', 'name', createInlineValue('B-value'))],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      const propKey = encodePropKey('x', 'name');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('B-value'));
    });

    it('with same lamport, writerId is used as tiebreaker', () => {
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createPropSetV2('x', 'name', createInlineValue('A-value'))],
      });

      const patchB = createPatchV2({
        writer: 'B',
        lamport: 1,
        ops: [createPropSetV2('x', 'name', createInlineValue('B-value'))],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      // B wins because 'B' > 'A' lexicographically
      const propKey = encodePropKey('x', 'name');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('B-value'));
    });

    it('property LWW is independent of node ORSet operations', () => {
      // Add node, set property, then remove node
      // Property should retain its LWW value
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [
          createNodeAddV2('x', createDot('A', 1)),
          createPropSetV2('x', 'name', createInlineValue('test')),
        ],
      });

      const patchB = createPatchV2({
        writer: 'A',
        lamport: 2,
        ops: [createNodeRemoveV2(new Set(['A:1']))],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      // Node should be removed
      expect(orsetContains(state.nodeAlive, 'x')).toBe(false);

      // But property should still have its value
      const propKey = encodePropKey('x', 'name');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('test'));
    });
  });

  describe('joinStates', () => {
    it('joins two states together', () => {
      const stateA = createEmptyStateV5();
      const stateB = createEmptyStateV5();

      // Add node to state A
      const dotA = createDot('A', 1);
      applyOpV2(stateA, createNodeAddV2('x', dotA), createEventId(1, 'A', 'aaaa1234', 0));
      applyOpV2(
        stateA,
        createPropSetV2('x', 'name', createInlineValue('A-name')),
        createEventId(1, 'A', 'aaaa1234', 1)
      );

      // Add different node to state B
      const dotB = createDot('B', 1);
      applyOpV2(stateB, createNodeAddV2('y', dotB), createEventId(1, 'B', 'bbbb1234', 0));
      applyOpV2(
        stateB,
        createPropSetV2('y', 'name', createInlineValue('B-name')),
        createEventId(1, 'B', 'bbbb1234', 1)
      );

      const joined = joinStates(stateA, stateB);

      // Should have both nodes
      expect(orsetContains(joined.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(joined.nodeAlive, 'y')).toBe(true);

      // Should have both properties
      expect(lwwValue(joined.prop.get(encodePropKey('x', 'name')))).toEqual(
        createInlineValue('A-name')
      );
      expect(lwwValue(joined.prop.get(encodePropKey('y', 'name')))).toEqual(
        createInlineValue('B-name')
      );
    });

    it('merges conflicting properties using LWW', () => {
      const stateA = createEmptyStateV5();
      const stateB = createEmptyStateV5();

      // Both set same property with different values
      applyOpV2(
        stateA,
        createPropSetV2('x', 'name', createInlineValue('A-value')),
        createEventId(1, 'A', 'aaaa1234', 0)
      );
      applyOpV2(
        stateB,
        createPropSetV2('x', 'name', createInlineValue('B-value')),
        createEventId(2, 'B', 'bbbb1234', 0)
      );

      const joined = joinStates(stateA, stateB);

      // B wins because higher lamport
      expect(lwwValue(joined.prop.get(encodePropKey('x', 'name')))).toEqual(
        createInlineValue('B-value')
      );
    });

    it('does not mutate input states', () => {
      const stateA = createEmptyStateV5();
      const stateB = createEmptyStateV5();

      const dotA = createDot('A', 1);
      applyOpV2(stateA, createNodeAddV2('x', dotA), createEventId(1, 'A', 'aaaa1234', 0));

      const joined = joinStates(stateA, stateB);

      // Add something to joined state
      const dotNew = createDot('C', 1);
      applyOpV2(joined, createNodeAddV2('z', dotNew), createEventId(1, 'C', 'cccc1234', 0));

      // Original states should be unchanged
      expect(orsetContains(stateA.nodeAlive, 'z')).toBe(false);
      expect(orsetContains(stateB.nodeAlive, 'z')).toBe(false);
    });
  });

  describe('cloneStateV5', () => {
    it('creates independent copy', () => {
      const state = createEmptyStateV5();
      const dot = createDot('A', 1);
      applyOpV2(state, createNodeAddV2('x', dot), createEventId(1, 'A', 'aaaa1234', 0));

      const cloned = cloneStateV5(state);

      // Modify cloned state
      const dot2 = createDot('B', 1);
      applyOpV2(cloned, createNodeAddV2('y', dot2), createEventId(1, 'B', 'bbbb1234', 0));

      // Original should be unchanged
      expect(orsetContains(state.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'y')).toBe(false);

      // Clone should have both
      expect(orsetContains(cloned.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(cloned.nodeAlive, 'y')).toBe(true);
    });
  });

  describe('reduceV5', () => {
    it('returns empty state for empty patches', () => {
      const state = reduceV5([]);

      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
      expect(state.prop.size).toBe(0);
    });

    it('applies patches with initial state', () => {
      // Create initial state
      const initialPatch = createPatchV2({
        writer: 'init',
        lamport: 1,
        ops: [createNodeAddV2('existing', createDot('init', 1))],
      });
      const initialState = reduceV5([{ patch: initialPatch, sha: 'aaaa1234' }]);

      // Apply new patch on top
      const newPatch = createPatchV2({
        writer: 'new',
        lamport: 2,
        ops: [createNodeAddV2('new', createDot('new', 1))],
      });

      const finalState = reduceV5([{ patch: newPatch, sha: 'bbbb1234' }], initialState);

      // Should have both nodes
      expect(orsetContains(finalState.nodeAlive, 'existing')).toBe(true);
      expect(orsetContains(finalState.nodeAlive, 'new')).toBe(true);
    });

    it('does not mutate initial state', () => {
      const initialPatch = createPatchV2({
        writer: 'init',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('init', 1))],
      });
      const initialState = reduceV5([{ patch: initialPatch, sha: 'aaaa1234' }]);

      const newPatch = createPatchV2({
        writer: 'new',
        lamport: 2,
        ops: [createNodeAddV2('y', createDot('new', 1))],
      });

      reduceV5([{ patch: newPatch, sha: 'bbbb1234' }], initialState);

      // Initial state should still only have 'x'
      expect(orsetContains(initialState.nodeAlive, 'x')).toBe(true);
      expect(orsetContains(initialState.nodeAlive, 'y')).toBe(false);
    });
  });

  describe('join with context (VersionVector)', () => {
    it('merges patch context into observedFrontier', () => {
      const state = createEmptyStateV5();

      const context = createVersionVector();
      context.set('A', 5);
      context.set('B', 3);

      const patch = createPatchV2({
        writer: 'C',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('C', 1))],
        context,
      });

      join(state, patch, 'aaaa1234');

      expect(state.observedFrontier.get('A')).toBe(5);
      expect(state.observedFrontier.get('B')).toBe(3);
    });

    it('takes pointwise max when merging contexts', () => {
      const state = createEmptyStateV5();
      state.observedFrontier.set('A', 10);
      state.observedFrontier.set('B', 2);

      const context = createVersionVector();
      context.set('A', 5); // lower than existing
      context.set('B', 8); // higher than existing
      context.set('C', 3); // new writer

      const patch = createPatchV2({
        writer: 'D',
        lamport: 1,
        ops: [createNodeAddV2('x', createDot('D', 1))],
        context,
      });

      join(state, patch, 'aaaa1234');

      expect(state.observedFrontier.get('A')).toBe(10); // kept higher
      expect(state.observedFrontier.get('B')).toBe(8); // took higher
      expect(state.observedFrontier.get('C')).toBe(3); // added new
    });
  });
});
