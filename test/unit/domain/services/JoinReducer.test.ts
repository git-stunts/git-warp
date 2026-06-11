import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  encodeEdgeKey,
  encodeEdgePropKey,
  decodeEdgeKey,
  encodePropKey,
  EDGE_PROP_PREFIX,
  applyPatchOp,
  join,
  applyFast,
  applyWithReceipt,
  joinStates,
  OP_STRATEGIES,
  reducePatches as _reducePatches,
  cloneState,
} from '../../../../src/domain/services/JoinReducer.ts';
import { decodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
const reducePatches = (_reducePatches) as (...args: any[]) => any;
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
/** @param {unknown} value */
function createInlineValue(value) { return { type: 'inline', value }; }


function createPatch({ writer, lamport, ops, context }: { writer: any; lamport: any; ops: any; context?: any }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || VersionVector.empty(),
  };
}


describe('JoinReducer', () => {
  describe('createEmptyState', () => {
    it('returns state with empty ORSets and Maps', () => {
      const state = createEmptyState();

      expect(state.nodeAlive).toBeDefined();
      expect(state.nodeAlive.entries).toBeInstanceOf(Map);
      expect(state.nodeAlive.tombstones).toBeInstanceOf(Set);
      expect(state.edgeAlive).toBeDefined();
      expect(state.propSize()).toBeGreaterThanOrEqual(0);
      expect(state.observedFrontier).toBeInstanceOf(VersionVector);
      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
      expect(state.propSize()).toBe(0);
      expect(state.observedFrontier.size).toBe(0);
    });

    it('returns independent state objects', () => {
      const state1 = createEmptyState();
      const state2 = createEmptyState();

      state1.mutatePropLWW('key', ({} as any), 'test');

      expect(state2.propSize()).toBe(0);
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

  describe('applyPatchOp', () => {
    describe('NodeAdd', () => {
      it('adds node to nodeAlive ORSet', () => {
        const state = createEmptyState();
        const dot = Dot.create('writer1', 1);
        const eventId = new EventId(1, 'writer1', 'abcd1234', 0);
        const op = new NodeAdd('x', dot);

        applyPatchOp(state, op, eventId);

        expect(state.nodeAlive.contains('x')).toBe(true);
      });

      it('can add same node with multiple dots', () => {
        const state = createEmptyState();
        const dot1 = Dot.create('writer1', 1);
        const dot2 = Dot.create('writer2', 1);

        applyPatchOp(state, new NodeAdd('x', dot1), new EventId(1, 'writer1', 'aaaa1234', 0));
        applyPatchOp(state, new NodeAdd('x', dot2), new EventId(1, 'writer2', 'bbbb1234', 0));

        expect(state.nodeAlive.contains('x')).toBe(true);
        const dots = state.nodeAlive.getDots('x');
        expect(dots.size).toBe(2);
      });

      it('hydrates a decoded NodeAdd POJO before applying it', () => {
        const state = createEmptyState();
        const eventId = new EventId(1, 'writer1', 'abcd1234', 0);

        applyPatchOp(state, {
          type: 'NodeAdd',
          node: 'x',
          dot: { writerId: 'writer1', counter: 1 },
        }, eventId);

        expect(state.nodeAlive.contains('x')).toBe(true);
        expect(state.nodeAlive.getDots('x')).toEqual(new Set(['writer1:1']));
      });
    });

    describe('NodeRemove', () => {
      it('removes node by tombstoning observed dots', () => {
        const state = createEmptyState();
        const dot = Dot.create('writer1', 1);

        // Add node
        applyPatchOp(state, new NodeAdd('x', dot), new EventId(1, 'writer1', 'aaaa1234', 0));
        expect(state.nodeAlive.contains('x')).toBe(true);

        // Remove node with observed dots
        const observedDots = new Set(['writer1:1']);
        applyPatchOp(
          state,
          new NodeRemove('x', [...observedDots]),
          new EventId(2, 'writer1', 'bbbb1234', 0)
        );

        expect(state.nodeAlive.contains('x')).toBe(false);
      });
    });

    describe('EdgeAdd', () => {
      it('adds edge to edgeAlive ORSet', () => {
        const state = createEmptyState();
        const dot = Dot.create('writer1', 1);
        const op = new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: dot });

        applyPatchOp(state, op, new EventId(1, 'writer1', 'abcd1234', 0));

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(state.edgeAlive.contains(edgeKey)).toBe(true);
      });
    });

    describe('EdgeRemove', () => {
      it('removes edge by tombstoning observed dots', () => {
        const state = createEmptyState();
        const dot = Dot.create('writer1', 1);

        // Add edge
        applyPatchOp(
          state,
          new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: dot }),
          new EventId(1, 'writer1', 'aaaa1234', 0)
        );
        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(state.edgeAlive.contains(edgeKey)).toBe(true);

        // Remove edge
        const observedDots = new Set(['writer1:1']);
        applyPatchOp(
          state,
          new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: [...observedDots] }),
          new EventId(2, 'writer1', 'bbbb1234', 0)
        );

        expect(state.edgeAlive.contains(edgeKey)).toBe(false);
      });
    });

  describe('PropSet', () => {
      it('sets property value using LWW', () => {
        const state = createEmptyState();
        const eventId = new EventId(1, 'writer1', 'abcd1234', 0);
        const value = createInlineValue('hello');
        const op = new PropSet('x', 'name', value);

        applyPatchOp(state, op, eventId);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.getEncodedProp(propKey))).toEqual(value);
      });

      it('overwrites property if EventId is greater', () => {
        const state = createEmptyState();
        const eventId1 = new EventId(1, 'writer', 'aaaa1234', 0);
        const eventId2 = new EventId(2, 'writer', 'bbbb1234', 0);
        const value1 = createInlineValue('old');
        const value2 = createInlineValue('new');

        applyPatchOp(state, new PropSet('x', 'name', value1), eventId1);
        applyPatchOp(state, new PropSet('x', 'name', value2), eventId2);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.getEncodedProp(propKey))).toEqual(value2);
      });

      it('keeps older property if EventId is lower', () => {
        const state = createEmptyState();
        const eventId1 = new EventId(2, 'writer', 'bbbb1234', 0);
        const eventId2 = new EventId(1, 'writer', 'aaaa1234', 0);
        const value1 = createInlineValue('newer');
        const value2 = createInlineValue('older');

        applyPatchOp(state, new PropSet('x', 'name', value1), eventId1);
        applyPatchOp(state, new PropSet('x', 'name', value2), eventId2);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.getEncodedProp(propKey))).toEqual(value1);
      });

      it('normalizes legacy edge-property PropSet before the canonical apply path', () => {
        const state = createEmptyState();
        const eventId = new EventId(1, 'writer1', 'abcd1234', 0);
        const value = createInlineValue(5);

        applyPatchOp(state, {
          type: 'PropSet',
          node: `${EDGE_PROP_PREFIX}a\0b\0rel`,
          key: 'weight',
          value,
        }, eventId);

        const propKey = encodeEdgePropKey('a', 'b', 'rel', 'weight');
        expect(lwwValue(state.getEncodedProp(propKey))).toEqual(value);
      });
    });
  });

  describe('order independence - patches applied in any order produce same state', () => {
    it('join([A, B]) equals join([B, A])', () => {
      // Writer A: NodeAdd("x")
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('A', 1))],
      });
      const shaA = 'aaaa1234';

      // Writer B: NodeAdd("y")
      const patchB = createPatch({
        writer: 'B',
        lamport: 1,
        ops: [new NodeAdd('y', Dot.create('B', 1))],
      });
      const shaB = 'bbbb1234';

      const stateAB = reducePatches([
        { patch: patchA, sha: shaA },
        { patch: patchB, sha: shaB },
      ]);

      const stateBA = reducePatches([
        { patch: patchB, sha: shaB },
        { patch: patchA, sha: shaA },
      ]);

      // Both states should have the same nodes
      expect(stateAB.nodeAlive.contains('x')).toBe(true);
      expect(stateAB.nodeAlive.contains('y')).toBe(true);
      expect(stateBA.nodeAlive.contains('x')).toBe(true);
      expect(stateBA.nodeAlive.contains('y')).toBe(true);
    });

    it('produces identical state for complex graph regardless of patch order', () => {
      const patches = [
        {
          patch: createPatch({
            writer: 'w1',
            lamport: 1,
            ops: [new NodeAdd('a', Dot.create('w1', 1))],
          }),
          sha: 'aaa11111',
        },
        {
          patch: createPatch({
            writer: 'w2',
            lamport: 1,
            ops: [new NodeAdd('b', Dot.create('w2', 1))],
          }),
          sha: 'bbb22222',
        },
        {
          patch: createPatch({
            writer: 'w3',
            lamport: 2,
            ops: [new EdgeAdd({ from: 'a', to: 'b', label: 'link', dot: Dot.create('w3', 1) })],
          }),
          sha: 'ccc33333',
        },
      ];

      // Test all permutations produce same result
      const state123 = reducePatches([patches[0], patches[1], patches[2]]);
      const state132 = reducePatches([patches[0], patches[2], patches[1]]);
      const state213 = reducePatches([patches[1], patches[0], patches[2]]);
      const state231 = reducePatches([patches[1], patches[2], patches[0]]);
      const state312 = reducePatches([patches[2], patches[0], patches[1]]);
      const state321 = reducePatches([patches[2], patches[1], patches[0]]);

      // All should have same nodes
      for (const state of [state123, state132, state213, state231, state312, state321]) {
        expect(state.nodeAlive.contains('a')).toBe(true);
        expect(state.nodeAlive.contains('b')).toBe(true);
        const edgeKey = encodeEdgeKey('a', 'b', 'link');
        expect(state.edgeAlive.contains(edgeKey)).toBe(true);
      }
    });
  });

  describe('concurrent add + remove with empty observedDots = add wins', () => {
    it('concurrent add wins when remove has no observed dots', () => {
      // Writer A adds node x with dot A:1
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('A', 1))],
      });

      // Writer B tries to remove x but hasn't observed any dots (empty set)
      const patchB = createPatch({
        writer: 'B',
        lamport: 1,
        ops: [new NodeRemove('x', [])],
      });

      // Apply in both orders
      const stateAB = reducePatches([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      const stateBA = reducePatches([
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchA, sha: 'aaaa1234' },
      ]);

      // Add wins because remove didn't observe the add's dot
      expect(stateAB.nodeAlive.contains('x')).toBe(true);
      expect(stateBA.nodeAlive.contains('x')).toBe(true);
    });

    it('concurrent add and remove: remove only removes observed dots', () => {
      // Writer A adds node x with dot A:1
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('A', 1))],
      });

      // Writer B also adds node x with dot B:1
      const patchB = createPatch({
        writer: 'B',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('B', 1))],
      });

      // Writer C removes x but only observed A's dot
      const patchC = createPatch({
        writer: 'C',
        lamport: 2,
        ops: [new NodeRemove('x', ['A:1'])],
      });

      const state = reducePatches([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchC, sha: 'cccc1234' },
      ]);

      // Node x should still exist because B's dot wasn't tombstoned
      expect(state.nodeAlive.contains('x')).toBe(true);

      // A's dot should be tombstoned, B's should remain
      const dots = state.nodeAlive.getDots('x');
      expect(dots.has('B:1')).toBe(true);
      expect(dots.has('A:1')).toBe(false);
    });
  });

  describe('Props use LWW with EventId', () => {
    it('same property set by two writers, higher lamport wins', () => {
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new PropSet('x', 'name', createInlineValue('A-value'))],
      });

      const patchB = createPatch({
        writer: 'B',
        lamport: 2,
        ops: [new PropSet('x', 'name', createInlineValue('B-value'))],
      });

      const state = reducePatches([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      const propKey = encodePropKey('x', 'name');
      expect(lwwValue(state.getEncodedProp(propKey))).toEqual(createInlineValue('B-value'));
    });

    it('with same lamport, writerId is used as tiebreaker', () => {
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new PropSet('x', 'name', createInlineValue('A-value'))],
      });

      const patchB = createPatch({
        writer: 'B',
        lamport: 1,
        ops: [new PropSet('x', 'name', createInlineValue('B-value'))],
      });

      const state = reducePatches([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      // B wins because 'B' > 'A' lexicographically
      const propKey = encodePropKey('x', 'name');
      expect(lwwValue(state.getEncodedProp(propKey))).toEqual(createInlineValue('B-value'));
    });

    it('property LWW is independent of node ORSet operations', () => {
      // Add node, set property, then remove node
      // Property should retain its LWW value
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [
          new NodeAdd('x', Dot.create('A', 1)),
          new PropSet('x', 'name', createInlineValue('test')),
        ],
      });

      const patchB = createPatch({
        writer: 'A',
        lamport: 2,
        ops: [new NodeRemove('x', ['A:1'])],
      });

      const state = reducePatches([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      // Node should be removed
      expect(state.nodeAlive.contains('x')).toBe(false);

      // But property should still have its value
      const propKey = encodePropKey('x', 'name');
      expect(lwwValue(state.getEncodedProp(propKey))).toEqual(createInlineValue('test'));
    });
  });

  describe('joinStates', () => {
    it('joins two states together', () => {
      const stateA = createEmptyState();
      const stateB = createEmptyState();

      // Add node to state A
      const dotA = Dot.create('A', 1);
      applyPatchOp(stateA, new NodeAdd('x', dotA), new EventId(1, 'A', 'aaaa1234', 0));
      applyPatchOp(
        stateA,
        new PropSet('x', 'name', createInlineValue('A-name')),
        new EventId(1, 'A', 'aaaa1234', 1)
      );

      // Add different node to state B
      const dotB = Dot.create('B', 1);
      applyPatchOp(stateB, new NodeAdd('y', dotB), new EventId(1, 'B', 'bbbb1234', 0));
      applyPatchOp(
        stateB,
        new PropSet('y', 'name', createInlineValue('B-name')),
        new EventId(1, 'B', 'bbbb1234', 1)
      );

      const joined = joinStates(stateA, stateB);

      // Should have both nodes
      expect(joined.nodeAlive.contains('x')).toBe(true);
      expect(joined.nodeAlive.contains('y')).toBe(true);

      // Should have both properties
      expect(lwwValue(joined.getEncodedProp(encodePropKey('x', 'name')))).toEqual(
        createInlineValue('A-name')
      );
      expect(lwwValue(joined.getEncodedProp(encodePropKey('y', 'name')))).toEqual(
        createInlineValue('B-name')
      );
    });

    it('merges conflicting properties using LWW', () => {
      const stateA = createEmptyState();
      const stateB = createEmptyState();

      // Both set same property with different values
      applyPatchOp(
        stateA,
        new PropSet('x', 'name', createInlineValue('A-value')),
        new EventId(1, 'A', 'aaaa1234', 0)
      );
      applyPatchOp(
        stateB,
        new PropSet('x', 'name', createInlineValue('B-value')),
        new EventId(2, 'B', 'bbbb1234', 0)
      );

      const joined = joinStates(stateA, stateB);

      // B wins because higher lamport
      expect(lwwValue(joined.getEncodedProp(encodePropKey('x', 'name')))).toEqual(
        createInlineValue('B-value')
      );
    });

    it('does not mutate input states', () => {
      const stateA = createEmptyState();
      const stateB = createEmptyState();

      const dotA = Dot.create('A', 1);
      applyPatchOp(stateA, new NodeAdd('x', dotA), new EventId(1, 'A', 'aaaa1234', 0));

      const joined = joinStates(stateA, stateB);

      // Add something to joined state
      const dotNew = Dot.create('C', 1);
      applyPatchOp(joined, new NodeAdd('z', dotNew), new EventId(1, 'C', 'cccc1234', 0));

      // Original states should be unchanged
      expect(stateA.nodeAlive.contains('z')).toBe(false);
      expect(stateB.nodeAlive.contains('z')).toBe(false);
    });
  });

  describe('cloneState', () => {
    it('creates independent copy', () => {
      const state = createEmptyState();
      const dot = Dot.create('A', 1);
      applyPatchOp(state, new NodeAdd('x', dot), new EventId(1, 'A', 'aaaa1234', 0));

      const cloned = cloneState(state);

      // Modify cloned state
      const dot2 = Dot.create('B', 1);
      applyPatchOp(cloned, new NodeAdd('y', dot2), new EventId(1, 'B', 'bbbb1234', 0));

      // Original should be unchanged
      expect(state.nodeAlive.contains('x')).toBe(true);
      expect(state.nodeAlive.contains('y')).toBe(false);

      // Clone should have both
      expect(cloned.nodeAlive.contains('x')).toBe(true);
      expect(cloned.nodeAlive.contains('y')).toBe(true);
    });

    it('normalizes plain state-like objects through the structural fallback', () => {
      const state = createEmptyState();
      const dot = Dot.create('A', 1);
      applyPatchOp(state, new NodeAdd('x', dot), new EventId(1, 'A', 'aaaa1234', 0));
      applyPatchOp(state, new EdgeAdd({ from: 'x', to: 'y', label: 'rel', dot: Dot.create('A', 2) }), new EventId(2, 'A', 'bbbb1234', 0));
      applyPatchOp(state, new PropSet('x', 'name', createInlineValue('Alice')), new EventId(3, 'A', 'cccc1234', 0));

      const plainState = {
        nodeAlive: state.nodeAlive,
        edgeAlive: state.edgeAlive,
        prop: new Map(state.allPropEntries()),
        observedFrontier: state.observedFrontier,
        edgeBirthEvent: state.edgeBirthEvent,
      };

      const cloned = cloneState((plainState));
      applyPatchOp(cloned, new NodeAdd('z', Dot.create('B', 1)), new EventId(4, 'B', 'dddd1234', 0));

      expect(cloned.nodeAlive.contains('x')).toBe(true);
      expect(cloned.nodeAlive.contains('z')).toBe(true);
      expect(state.nodeAlive.contains('z')).toBe(false);
      expect(cloned.getEncodedProp(encodePropKey('x', 'name'))?.value).toEqual(createInlineValue('Alice'));
    });
  });

  describe('reducePatches', () => {
    it('returns empty state for empty patches', () => {
      const state = reducePatches([]);

      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
      expect(state.propSize()).toBe(0);
    });

    it('applies patches with initial state', () => {
      // Create initial state
      const initialPatch = createPatch({
        writer: 'init',
        lamport: 1,
        ops: [new NodeAdd('existing', Dot.create('init', 1))],
      });
      const initialState = reducePatches([{ patch: initialPatch, sha: 'aaaa1234' }]);

      // Apply new patch on top
      const newPatch = createPatch({
        writer: 'new',
        lamport: 2,
        ops: [new NodeAdd('new', Dot.create('new', 1))],
      });

      const finalState = reducePatches([{ patch: newPatch, sha: 'bbbb1234' }], initialState);

      // Should have both nodes
      expect(finalState.nodeAlive.contains('existing')).toBe(true);
      expect(finalState.nodeAlive.contains('new')).toBe(true);
    });

    it('does not mutate initial state', () => {
      const initialPatch = createPatch({
        writer: 'init',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('init', 1))],
      });
      const initialState = reducePatches([{ patch: initialPatch, sha: 'aaaa1234' }]);

      const newPatch = createPatch({
        writer: 'new',
        lamport: 2,
        ops: [new NodeAdd('y', Dot.create('new', 1))],
      });

      reducePatches([{ patch: newPatch, sha: 'bbbb1234' }], initialState);

      // Initial state should still only have 'x'
      expect(initialState.nodeAlive.contains('x')).toBe(true);
      expect(initialState.nodeAlive.contains('y')).toBe(false);
    });
  });

  describe('join with context (VersionVector)', () => {
    it('merges patch context into observedFrontier', () => {
      const state = createEmptyState();

      const context = VersionVector.empty();
      context.set('A', 5);
      context.set('B', 3);

      const patch = createPatch({
        writer: 'C',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('C', 1))],
        context,
      });

      join(state, patch, 'aaaa1234');

      expect(state.observedFrontier.get('A')).toBe(5);
      expect(state.observedFrontier.get('B')).toBe(3);
    });

    it('takes pointwise max when merging contexts', () => {
      const state = createEmptyState();
      state.observedFrontier.set('A', 10);
      state.observedFrontier.set('B', 2);

      const context = VersionVector.empty();
      context.set('A', 5); // lower than existing
      context.set('B', 8); // higher than existing
      context.set('C', 3); // new writer

      const patch = createPatch({
        writer: 'D',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('D', 1))],
        context,
      });

      join(state, patch, 'aaaa1234');

      expect(state.observedFrontier.get('A')).toBe(10); // kept higher
      expect(state.observedFrontier.get('B')).toBe(8); // took higher
      expect(state.observedFrontier.get('C')).toBe(3); // added new
    });

    it('incorporates the patch own dot into observedFrontier', () => {
      const state = createEmptyState();

      const context = VersionVector.empty();
      context.set('A', 5);
      context.set('B', 3);

      const patch = createPatch({
        writer: 'C',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('C', 1))],
        context,
      });

      join(state, patch, 'aaaa1234');

      expect(state.observedFrontier.get('A')).toBe(5);
      expect(state.observedFrontier.get('B')).toBe(3);
      expect(state.observedFrontier.get('C')).toBe(1);
    });

    it('observedFrontier advances with each patch from the same writer', () => {
      const state = createEmptyState();

      join(state, createPatch({
        writer: 'A', lamport: 1,
        ops: [new NodeAdd('n1', Dot.create('A', 1))],
        context: VersionVector.empty(),
      }), 'aaaa0001');

      expect(state.observedFrontier.get('A')).toBe(1);

      const ctx2 = VersionVector.empty();
      ctx2.set('A', 1);
      join(state, createPatch({
        writer: 'A', lamport: 2,
        ops: [new NodeAdd('n2', Dot.create('A', 2))],
        context: ctx2,
      }), 'aaaa0002');

      expect(state.observedFrontier.get('A')).toBe(2);
    });

    it('incorporates patch own dot on receipt path', () => {
      const state = createEmptyState();

      const context = VersionVector.empty();
      context.set('A', 5);

      const patch = createPatch({
        writer: 'C',
        lamport: 1,
        ops: [new NodeAdd('x', Dot.create('C', 1))],
        context,
      });

      const result = join(state, patch, 'aaaa1234', true);

      expect('state' in result).toBe(true);
      const { state: s, receipt } = (result as any);
      expect(s.observedFrontier.get('A')).toBe(5);
      expect(s.observedFrontier.get('C')).toBe(1);
      expect(receipt).toBeDefined();
    });
  });

  describe('applyFast / applyWithReceipt', () => {
    it('applyFast applies ops and updates frontier', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const patch = createPatch({
        writer: 'w1',
        lamport: 1,
        ops: [new NodeAdd('n1', dot)],
        context: VersionVector.empty(),
      });
      const result = applyFast(state, patch, 'fa51aa00ee11');
      expect(result).toBe(state); // mutates in place
      expect(state.nodeAlive.contains('n1')).toBe(true);
      expect(state.observedFrontier.get('w1')).toBe(1);
    });

    it('applyWithReceipt returns state and receipt', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const patch = createPatch({
        writer: 'w1',
        lamport: 1,
        ops: [new NodeAdd('n1', dot)],
        context: VersionVector.empty(),
      });
      const result = applyWithReceipt(state, patch, 'bece1111ee22');
      expect(result.state).toBe(state);
      expect(result.receipt).toBeDefined();
      expect(result.receipt.patchSha).toBe('bece1111ee22');
      expect(result.receipt.ops).toHaveLength(1);
      expect(result.receipt.ops[0]?.op).toBe('NodeAdd');
      expect(result.receipt.ops[0]?.result).toBe('applied');
      expect(state.nodeAlive.contains('n1')).toBe(true);
      expect(state.observedFrontier.get('w1')).toBe(1);
    });

    it('applyFast skips undefined ops while still applying later entries', () => {
      const state = createEmptyState();
      const patch = createPatch({
        writer: 'w1',
        lamport: 1,
        ops: [
          (undefined),
          new NodeAdd('n1', Dot.create('w1', 1)),
        ],
        context: VersionVector.empty(),
      });

      applyFast(state, patch, 'fa51aa00ee12');

      expect(state.nodeAlive.contains('n1')).toBe(true);
      expect(state.observedFrontier.get('w1')).toBe(1);
    });

    it('applyWithReceipt skips undefined ops while recording later known ops', () => {
      const state = createEmptyState();
      const patch = createPatch({
        writer: 'w1',
        lamport: 1,
        ops: [
          (undefined),
          new NodeAdd('n1', Dot.create('w1', 1)),
        ],
        context: VersionVector.empty(),
      });

      const result = applyWithReceipt(state, patch, 'bece1111ee23');

      expect(result.receipt.ops).toHaveLength(1);
      expect(result.receipt.ops[0]?.op).toBe('NodeAdd');
      expect(state.nodeAlive.contains('n1')).toBe(true);
    });

    it('raw PropSet strategy exposes outcome, snapshot, and diff accumulation', () => {
      const strategy = OP_STRATEGIES.get('PropSet');
      if (!strategy) {
        throw new Error('expected PropSet strategy');
      }
      const state = createEmptyState();
      const op = {
        type: 'PropSet',
        node: 'n1',
        key: 'name',
        value: createInlineValue('Alice'),
      };
      const eventId = new EventId(1, 'w1', 'abcd1234', 0);
      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const before = strategy.snapshot(state, op);
      const outcome = strategy.outcome(state, op, eventId);
      strategy.mutate(state, op, eventId);
      strategy.accumulate(diff, state, op, before);

      expect(outcome.result).toBe('applied');
      expect(diff.propsChanged).toEqual([
        { nodeId: 'n1', key: 'name', value: createInlineValue('Alice'), prevValue: undefined },
      ]);
    });

    it('remove strategies tolerate snapshots without alive-before sets', () => {
      const state = createEmptyState();
      const nodeRemoveStrategy = OP_STRATEGIES.get('NodeRemove');
      const edgeRemoveStrategy = OP_STRATEGIES.get('EdgeRemove');
      if (!nodeRemoveStrategy || !edgeRemoveStrategy) {
        throw new Error('expected remove strategies');
      }
      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      expect(() =>
        nodeRemoveStrategy.accumulate(diff, state, { type: 'NodeRemove', observedDots: new Set() }, {})
      ).not.toThrow();
      expect(() =>
        edgeRemoveStrategy.accumulate(diff, state, { type: 'EdgeRemove', observedDots: new Set() }, {})
      ).not.toThrow();
      expect(diff.nodesRemoved).toEqual([]);
      expect(diff.edgesRemoved).toEqual([]);
    });

    it('applyWithReceipt skips strategy outcomes whose receipt name is no longer valid', () => {
      const state = createEmptyState();
      const strategy = OP_STRATEGIES.get('BlobValue');
      if (!strategy) {
        throw new Error('expected BlobValue strategy');
      }
      const originalReceiptName = strategy.receiptName;

      try {
        ((strategy as any)).receiptName = 'FutureBlobValue';
        const result = applyWithReceipt(state, createPatch({
          writer: 'w1',
          lamport: 1,
          ops: [{ type: 'BlobValue', oid: 'blob-1' }],
          context: VersionVector.empty(),
        }), 'bece1111ee24');

        expect(result.receipt.ops).toEqual([]);
      } finally {
        ((strategy as any)).receiptName = originalReceiptName;
      }
    });

    it('applyFast handles undefined context gracefully', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const patch = {
        schema: 2,
        writer: 'w1',
        lamport: 1,
        ops: [new NodeAdd('n1', dot)],
        context: undefined,
      };
      const result = applyFast(state, (patch), 'aa00000000000000');
      expect(result).toBe(state);
      expect(state.nodeAlive.contains('n1')).toBe(true);
      expect(state.observedFrontier.get('w1')).toBe(1);
    });

    it('applyFast handles null context gracefully', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const patch = {
        schema: 2,
        writer: 'w1',
        lamport: 1,
        ops: [new NodeAdd('n1', dot)],
        context: null,
      };
      const result = applyFast(state, (patch), 'bb00000000000000');
      expect(result).toBe(state);
      expect(state.nodeAlive.contains('n1')).toBe(true);
      expect(state.observedFrontier.get('w1')).toBe(1);
    });

    it('join dispatches to applyFast when collectReceipts is false', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const patch = createPatch({
        writer: 'w1',
        lamport: 1,
        ops: [new NodeAdd('n1', dot)],
        context: VersionVector.empty(),
      });
      const result = join(state, patch, 'd15a07c0');
      // applyFast returns state directly
      expect(result).toBe(state);
      expect(state.nodeAlive.contains('n1')).toBe(true);
    });

    it('join dispatches to applyWithReceipt when collectReceipts is true', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const patch = createPatch({
        writer: 'w1',
        lamport: 1,
        ops: [new NodeAdd('n1', dot)],
        context: VersionVector.empty(),
      });
      const result = (join(state, patch, 'd15a07c1', true) as any);
      expect(result.state).toBe(state);
      expect(result.receipt).toBeDefined();
      expect(result.receipt.patchSha).toBe('d15a07c1');
    });
  });
});
