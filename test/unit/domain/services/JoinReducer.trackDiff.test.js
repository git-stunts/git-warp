import { describe, it, expect } from 'vitest';
import {
  createEmptyStateV5,
  encodeEdgeKey,
  encodePropKey,
  applyWithDiff,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.ts';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { createEventId } from '../../../../src/domain/utils/EventId.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {string} node @param {any} dot */
function nodeAdd(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/** @param {string} node @param {Set<string>} observedDots */
function nodeRemove(node, observedDots) {
  return { type: 'NodeRemove', node, observedDots };
}

/** @param {string} from @param {string} to @param {string} label @param {any} dot */
function edgeAdd(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/** @param {string} from @param {string} to @param {string} label @param {Set<string>} observedDots */
function edgeRemove(from, to, label, observedDots) {
  return { type: 'EdgeRemove', from, to, label, observedDots };
}

/** @param {string} node @param {string} key @param {any} value */
function propSet(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

/**
 * @param {Object} params
 * @param {string} [params.writer]
 * @param {number} [params.lamport]
 * @param {any[]} [params.ops]
 * @param {any} [params.context]
 */
function makePatch({ writer = 'w1', lamport = 1, ops = [], context = undefined }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || VersionVector.empty(),
  };
}

// ---------------------------------------------------------------------------
// Tests — applyWithDiff
// ---------------------------------------------------------------------------

describe('JoinReducer diff tracking', () => {
  // =========================================================================
  // applyWithDiff — NodeAdd
  // =========================================================================

  describe('applyWithDiff — NodeAdd', () => {
    it('fresh node → nodesAdded contains it', () => {
      const state = createEmptyStateV5();
      const patch = makePatch({
        ops: [nodeAdd('n1', createDot('w1', 1))],
      });

      const { state: s, diff } = applyWithDiff(state, patch, 'aaa00001');

      expect(diff.nodesAdded).toEqual(['n1']);
      expect(diff.nodesRemoved).toEqual([]);
      expect(s.nodeAlive.contains('n1')).toBe(true);
    });

    it('already-alive node → nodesAdded is empty (redundant add)', () => {
      const state = createEmptyStateV5();
      // Pre-populate: node n1 already alive with dot (w1, 1)
      state.nodeAlive.add('n1', createDot('w1', 1));

      // Another add from a different writer — node was already alive
      const patch = makePatch({
        writer: 'w2',
        lamport: 2,
        ops: [nodeAdd('n1', createDot('w2', 1))],
      });

      const { diff } = applyWithDiff(state, patch, 'aaa00002');

      expect(diff.nodesAdded).toEqual([]);
      expect(diff.nodesRemoved).toEqual([]);
    });
  });

  // =========================================================================
  // applyWithDiff — NodeRemove
  // =========================================================================

  describe('applyWithDiff — NodeRemove', () => {
    it('all dots tombstoned → nodesRemoved contains it', () => {
      const state = createEmptyStateV5();
      const dot = createDot('w1', 1);
      state.nodeAlive.add('n1', dot);
      expect(state.nodeAlive.contains('n1')).toBe(true);

      const patch = makePatch({
        lamport: 2,
        ops: [nodeRemove('n1', new Set([encodeDot(dot)]))],
      });

      const { state: s, diff } = applyWithDiff(state, patch, 'bbb00001');

      expect(diff.nodesRemoved).toEqual(['n1']);
      expect(diff.nodesAdded).toEqual([]);
      expect(s.nodeAlive.contains('n1')).toBe(false);
    });

    it('partial dots removed, node stays alive → nodesRemoved is empty', () => {
      const state = createEmptyStateV5();
      const dot1 = createDot('w1', 1);
      const dot2 = createDot('w2', 1);
      state.nodeAlive.add('n1', dot1);
      state.nodeAlive.add('n1', dot2);
      expect(state.nodeAlive.contains('n1')).toBe(true);

      // Only remove dot1 — dot2 keeps node alive
      const patch = makePatch({
        lamport: 2,
        ops: [nodeRemove('n1', new Set([encodeDot(dot1)]))],
      });

      const { state: s, diff } = applyWithDiff(state, patch, 'bbb00002');

      expect(diff.nodesRemoved).toEqual([]);
      expect(s.nodeAlive.contains('n1')).toBe(true);
    });

    it('redundant remove of already-dead node produces no spurious diff (H4)', () => {
      const state = createEmptyStateV5();

      // n1 is alive, n2 was added and already fully tombstoned (dead)
      const dot1 = createDot('w1', 1);
      const dot2 = createDot('w1', 2);
      state.nodeAlive.add('n1', dot1);
      state.nodeAlive.add('n2', dot2);

      // Tombstone n2 first — it's now dead
      state.nodeAlive.tombstones.add(encodeDot(dot2));
      expect(state.nodeAlive.contains('n2')).toBe(false);
      expect(state.nodeAlive.contains('n1')).toBe(true);

      // Now apply a remove that observes dot1 (killing n1) AND dot2 (redundant for n2)
      const patch = makePatch({
        lamport: 3,
        ops: [nodeRemove('n1', new Set([encodeDot(dot1), encodeDot(dot2)]))],
      });

      const { diff } = applyWithDiff(state, patch, 'bbb00003');

      // n1 was alive → dead: should appear
      expect(diff.nodesRemoved).toContain('n1');
      // n2 was already dead → should NOT appear
      expect(diff.nodesRemoved).not.toContain('n2');
      expect(diff.nodesRemoved).toHaveLength(1);
    });
  });

  // =========================================================================
  // applyWithDiff — EdgeAdd
  // =========================================================================

  describe('applyWithDiff — EdgeAdd', () => {
    it('fresh edge → edgesAdded contains {from, to, label}', () => {
      const state = createEmptyStateV5();
      const patch = makePatch({
        ops: [edgeAdd('a', 'b', 'rel', createDot('w1', 1))],
      });

      const { state: s, diff } = applyWithDiff(state, patch, 'ccc00001');

      expect(diff.edgesAdded).toEqual([{ from: 'a', to: 'b', label: 'rel' }]);
      expect(diff.edgesRemoved).toEqual([]);
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      expect(s.edgeAlive.contains(edgeKey)).toBe(true);
    });

    it('already-alive edge → edgesAdded is empty (redundant add)', () => {
      const state = createEmptyStateV5();
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, createDot('w1', 1));

      // Another add from different writer — edge was already alive
      const patch = makePatch({
        writer: 'w2',
        lamport: 2,
        ops: [edgeAdd('a', 'b', 'rel', createDot('w2', 1))],
      });

      const { diff } = applyWithDiff(state, patch, 'ccc00002');

      expect(diff.edgesAdded).toEqual([]);
      expect(diff.edgesRemoved).toEqual([]);
    });
  });

  // =========================================================================
  // applyWithDiff — EdgeRemove
  // =========================================================================

  describe('applyWithDiff — EdgeRemove', () => {
    it('all dots tombstoned → edgesRemoved contains {from, to, label}', () => {
      const state = createEmptyStateV5();
      const dot = createDot('w1', 1);
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, dot);

      const patch = makePatch({
        lamport: 2,
        ops: [edgeRemove('a', 'b', 'rel', new Set([encodeDot(dot)]))],
      });

      const { state: s, diff } = applyWithDiff(state, patch, 'ddd00001');

      expect(diff.edgesRemoved).toEqual([{ from: 'a', to: 'b', label: 'rel' }]);
      expect(diff.edgesAdded).toEqual([]);
      expect(s.edgeAlive.contains(edgeKey)).toBe(false);
    });

    it('partial dots removed, edge stays alive → edgesRemoved is empty', () => {
      const state = createEmptyStateV5();
      const dot1 = createDot('w1', 1);
      const dot2 = createDot('w2', 1);
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, dot1);
      state.edgeAlive.add(edgeKey, dot2);

      // Only remove dot1 — dot2 keeps edge alive
      const patch = makePatch({
        lamport: 2,
        ops: [edgeRemove('a', 'b', 'rel', new Set([encodeDot(dot1)]))],
      });

      const { state: s, diff } = applyWithDiff(state, patch, 'ddd00002');

      expect(diff.edgesRemoved).toEqual([]);
      expect(s.edgeAlive.contains(edgeKey)).toBe(true);
    });

    it('redundant remove of already-dead edge produces no spurious diff (H4)', () => {
      const state = createEmptyStateV5();

      const dot1 = createDot('w1', 1);
      const dot2 = createDot('w1', 2);
      const ek1 = encodeEdgeKey('a', 'b', 'rel');
      const ek2 = encodeEdgeKey('c', 'd', 'rel');
      state.edgeAlive.add(ek1, dot1);
      state.edgeAlive.add(ek2, dot2);

      // Tombstone ek2 — it's already dead
      state.edgeAlive.tombstones.add(encodeDot(dot2));
      expect(state.edgeAlive.contains(ek2)).toBe(false);

      // Remove that observes both dots
      const patch = makePatch({
        lamport: 3,
        ops: [edgeRemove('a', 'b', 'rel', new Set([encodeDot(dot1), encodeDot(dot2)]))],
      });

      const { diff } = applyWithDiff(state, patch, 'ddd00003');

      // ek1 was alive → dead: should appear
      expect(diff.edgesRemoved).toEqual([{ from: 'a', to: 'b', label: 'rel' }]);
      // ek2 was already dead → should NOT appear
      expect(diff.edgesRemoved).not.toContainEqual({ from: 'c', to: 'd', label: 'rel' });
    });
  });

  // =========================================================================
  // applyWithDiff — PropSet
  // =========================================================================

  describe('applyWithDiff — PropSet', () => {
    it('new property (no prior value) → propsChanged with prevValue: undefined', () => {
      const state = createEmptyStateV5();
      const patch = makePatch({
        ops: [propSet('n1', 'color', 'red')],
      });

      const { diff } = applyWithDiff(state, patch, 'eee00001');

      expect(diff.propsChanged).toEqual([
        { nodeId: 'n1', key: 'color', value: 'red', prevValue: undefined },
      ]);
    });

    it('LWW winner changes existing value → propsChanged with correct prevValue', () => {
      const state = createEmptyStateV5();
      // Pre-populate: property n1.color = 'red' at lamport=1
      const propKey = encodePropKey('n1', 'color');
      const oldEventId = createEventId(1, 'w1', 'aaa00000', 0);
      state.prop.set(propKey, { eventId: oldEventId, value: 'red' });

      // New patch with higher lamport overwrites
      const patch = makePatch({
        lamport: 5,
        ops: [propSet('n1', 'color', 'blue')],
      });

      const { diff } = applyWithDiff(state, patch, 'eee00002');

      expect(diff.propsChanged).toEqual([
        { nodeId: 'n1', key: 'color', value: 'blue', prevValue: 'red' },
      ]);
    });

    it('incoming value is superseded (lower lamport) → propsChanged is empty', () => {
      const state = createEmptyStateV5();
      // Pre-populate: property n1.color = 'red' at lamport=10
      const propKey = encodePropKey('n1', 'color');
      const highEventId = createEventId(10, 'w1', 'fff00000', 0);
      state.prop.set(propKey, { eventId: highEventId, value: 'red' });

      // New patch with lower lamport — should be superseded
      const patch = makePatch({
        lamport: 1,
        ops: [propSet('n1', 'color', 'blue')],
      });

      const { diff } = applyWithDiff(state, patch, 'eee00003');

      expect(diff.propsChanged).toEqual([]);
      // Value stays 'red'
      expect(lwwValue(state.prop.get(propKey))).toBe('red');
    });
  });

  // =========================================================================
  // applyWithDiff — mixed ops
  // =========================================================================

  describe('applyWithDiff — mixed operations in a single patch', () => {
    it('tracks multiple transitions in one patch', () => {
      const state = createEmptyStateV5();

      const patch = makePatch({
        ops: [
          nodeAdd('n1', createDot('w1', 1)),
          nodeAdd('n2', createDot('w1', 2)),
          edgeAdd('n1', 'n2', 'knows', createDot('w1', 3)),
          propSet('n1', 'name', 'Alice'),
        ],
      });

      const { diff } = applyWithDiff(state, patch, 'fff00001');

      expect(diff.nodesAdded).toEqual(['n1', 'n2']);
      expect(diff.edgesAdded).toEqual([{ from: 'n1', to: 'n2', label: 'knows' }]);
      expect(diff.propsChanged).toEqual([
        { nodeId: 'n1', key: 'name', value: 'Alice', prevValue: undefined },
      ]);
      expect(diff.nodesRemoved).toEqual([]);
      expect(diff.edgesRemoved).toEqual([]);
    });

    it('skips undefined ops while still tracking later transitions', () => {
      const state = createEmptyStateV5();

      const { diff } = applyWithDiff(state, makePatch({
        ops: [
          /** @type {any} */ (undefined),
          nodeAdd('n1', createDot('w1', 1)),
        ],
      }), 'fff00002');

      expect(diff.nodesAdded).toEqual(['n1']);
      expect(diff.edgesAdded).toEqual([]);
      expect(diff.propsChanged).toEqual([]);
    });
  });

  // =========================================================================
  // reduceV5 with trackDiff
  // =========================================================================

  describe('reduceV5 with trackDiff', () => {
    it('multi-patch reduce → merged diff is cumulative', () => {
      const patches = [
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 1,
            ops: [
              nodeAdd('n1', createDot('w1', 1)),
              propSet('n1', 'color', 'red'),
            ],
          }),
          sha: 'aa000001',
        },
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 2,
            ops: [
              nodeAdd('n2', createDot('w1', 2)),
              edgeAdd('n1', 'n2', 'link', createDot('w1', 3)),
            ],
          }),
          sha: 'aa000002',
        },
      ];

      const result = reduceV5(patches, undefined, { trackDiff: true });

      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('diff');
      expect(result.diff.nodesAdded).toContain('n1');
      expect(result.diff.nodesAdded).toContain('n2');
      expect(result.diff.edgesAdded).toEqual([{ from: 'n1', to: 'n2', label: 'link' }]);
      expect(result.diff.propsChanged).toEqual([
        { nodeId: 'n1', key: 'color', value: 'red', prevValue: undefined },
      ]);
    });

    it('without trackDiff → returns state directly (no regression)', () => {
      const patches = [
        {
          patch: makePatch({
            ops: [nodeAdd('n1', createDot('w1', 1))],
          }),
          sha: 'aa100001',
        },
      ];

      const result = reduceV5(patches);

      // Returns state directly, NOT wrapped in { state, diff }
      expect(result.nodeAlive).toBeDefined();
      expect(result.edgeAlive).toBeDefined();
      expect(result.prop).toBeDefined();
      expect(result.observedFrontier).toBeDefined();
      expect(result).not.toHaveProperty('diff');
      expect(result.nodeAlive.contains('n1')).toBe(true);
    });

    it('with trackDiff: true → returns { state, diff } shape', () => {
      const patches = [
        {
          patch: makePatch({
            ops: [nodeAdd('x', createDot('w1', 1))],
          }),
          sha: 'aa200001',
        },
      ];

      const result = reduceV5(patches, undefined, { trackDiff: true });

      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('diff');
      expect(result.state.nodeAlive).toBeDefined();
      expect(result.state.edgeAlive).toBeDefined();
      expect(result.state.prop).toBeInstanceOf(Map);
      expect(result.state.observedFrontier).toBeInstanceOf(VersionVector);
      expect(result.diff.nodesAdded).toEqual(['x']);
      expect(result.diff.nodesRemoved).toEqual([]);
      expect(result.diff.edgesAdded).toEqual([]);
      expect(result.diff.edgesRemoved).toEqual([]);
      expect(result.diff.propsChanged).toEqual([]);
    });

    it('empty patches array → empty diff', () => {
      const result = reduceV5([], undefined, { trackDiff: true });

      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('diff');
      expect(result.diff.nodesAdded).toEqual([]);
      expect(result.diff.nodesRemoved).toEqual([]);
      expect(result.diff.edgesAdded).toEqual([]);
      expect(result.diff.edgesRemoved).toEqual([]);
      expect(result.diff.propsChanged).toEqual([]);
    });

    it('trackDiff with initialState applies patches incrementally', () => {
      // Create initial state with node n1 and prop color=red
      const initial = createEmptyStateV5();
      initial.nodeAlive.add('n1', createDot('w1', 1));
      const propKey = encodePropKey('n1', 'color');
      const oldEventId = createEventId(1, 'w1', 'a0a00001', 0);
      initial.prop.set(propKey, { eventId: oldEventId, value: 'red' });

      const patches = [
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 5,
            ops: [
              propSet('n1', 'color', 'blue'),
              nodeAdd('n2', createDot('w1', 5)),
            ],
          }),
          sha: 'aa300001',
        },
      ];

      const result = reduceV5(patches, initial, { trackDiff: true });

      // n1 was already alive, so not in nodesAdded
      // n2 is newly added
      expect(result.diff.nodesAdded).toEqual(['n2']);
      // color changed from red to blue
      expect(result.diff.propsChanged).toEqual([
        { nodeId: 'n1', key: 'color', value: 'blue', prevValue: 'red' },
      ]);
    });

    it('trackDiff and receipts are independent options', () => {
      const patches = [
        {
          patch: makePatch({
            ops: [nodeAdd('n1', createDot('w1', 1))],
          }),
          sha: 'aa400001',
        },
      ];

      // receipts mode (existing) — should still work
      const receiptResult = reduceV5(patches, undefined, { receipts: true });
      expect(receiptResult).toHaveProperty('state');
      expect(receiptResult).toHaveProperty('receipts');
      expect(receiptResult).not.toHaveProperty('diff');

      // trackDiff mode (new) — should NOT contain receipts
      const diffResult = reduceV5(patches, undefined, { trackDiff: true });
      expect(diffResult).toHaveProperty('state');
      expect(diffResult).toHaveProperty('diff');
      expect(diffResult).not.toHaveProperty('receipts');
    });
  });
});
