import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  encodeEdgeKey,
  encodePropKey,
  join,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.ts';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { lwwSet } from '../../../../src/domain/crdt/LWW.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatch({ writer = 'w1', lamport = 1, ops = /** @type {any[]} */ ([]), context = /** @type {any} */ (undefined) }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || VersionVector.empty(),
  };
}

/** @param {any} node @param {any} dot */
function nodeAdd(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/** @param {any} node @param {any} observedDots */
function nodeRemove(node, observedDots) {
  return { type: 'NodeRemove', node, observedDots };
}

/** @param {any} from @param {any} to @param {any} label @param {any} dot */
function edgeAdd(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/** @param {any} from @param {any} to @param {any} label @param {any} observedDots */
function edgeRemove(from, to, label, observedDots) {
  return { type: 'EdgeRemove', from, to, label, observedDots };
}

/** @param {any} node @param {any} key @param {any} value */
function propSet(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinReducer receipts', () => {
  // =========================================================================
  // join() with collectReceipts = false (default)
  // =========================================================================

  describe('join() without receipts (default)', () => {
    it('returns state directly when collectReceipts is falsy', () => {
      const state = createEmptyState();
      const patch = makePatch({
        ops: [nodeAdd('n1', Dot.create('w1', 1))],
      });
      const result = /** @type {any} */ (join(state, patch, 'abcd1234'));
      // Returns the state object directly (not wrapped)
      expect(result).toBe(state);
      expect(result.nodeAlive).toBeDefined();
    });

    it('returns state directly when collectReceipts is undefined', () => {
      const state = createEmptyState();
      const patch = makePatch({ ops: [] });
      const result = /** @type {any} */ (join(state, patch, 'abcd1234', undefined));
      expect(result).toBe(state);
    });
  });

  // =========================================================================
  // join() with collectReceipts = true
  // =========================================================================

  describe('join() with receipts', () => {
    it('returns { state, receipt } when collectReceipts is true', () => {
      const state = createEmptyState();
      const patch = makePatch({
        ops: [nodeAdd('n1', Dot.create('w1', 1))],
      });
      const result = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('receipt');
      expect(result.state).toBe(state);
    });

    it('receipt contains correct patchSha, writer, lamport', () => {
      const state = createEmptyState();
      const patch = makePatch({
        writer: 'alice',
        lamport: 42,
        ops: [nodeAdd('n1', Dot.create('alice', 1))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'deadbeef', true));
      expect(receipt.patchSha).toBe('deadbeef');
      expect(receipt.writer).toBe('alice');
      expect(receipt.lamport).toBe(42);
    });

    it('receipt is frozen', () => {
      const state = createEmptyState();
      const patch = makePatch({
        ops: [nodeAdd('n1', Dot.create('w1', 1))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(Object.isFrozen(receipt)).toBe(true);
      expect(Object.isFrozen(receipt.ops)).toBe(true);
    });

    it('empty patch yields receipt with empty ops', () => {
      const state = createEmptyState();
      const patch = makePatch({ ops: [] });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops).toHaveLength(0);
    });
  });

  // =========================================================================
  // NodeAdd outcomes
  // =========================================================================

  describe('NodeAdd receipt outcomes', () => {
    it('new node → applied', () => {
      const state = createEmptyState();
      const patch = makePatch({
        ops: [nodeAdd('n1', Dot.create('w1', 1))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0]).toEqual({
        op: 'NodeAdd',
        target: 'n1',
        result: 'applied',
      });
    });

    it('same dot added again → redundant', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      // Pre-add the dot
      state.nodeAlive.add('n1', dot);

      const patch = makePatch({
        ops: [nodeAdd('n1', dot)],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('redundant');
    });

    it('different dot for same node → applied', () => {
      const state = createEmptyState();
      state.nodeAlive.add('n1', Dot.create('w1', 1));

      const patch = makePatch({
        writer: 'w2',
        ops: [nodeAdd('n1', Dot.create('w2', 1))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('applied');
    });
  });

  // =========================================================================
  // NodeRemove (NodeTombstone) outcomes
  // =========================================================================

  describe('NodeRemove receipt outcomes', () => {
    it('removing existing dot → applied', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      state.nodeAlive.add('n1', dot);
      const encoded = encodeDot(dot);

      const patch = makePatch({
        ops: [nodeRemove('n1', new Set([encoded]))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0]).toMatchObject({
        op: 'NodeTombstone',
        result: 'applied',
      });
    });

    it('removing already-tombstoned dot → redundant', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      state.nodeAlive.add('n1', dot);
      const encoded = encodeDot(dot);
      // Tombstone it first
      state.nodeAlive.remove(new Set([encoded]));

      const patch = makePatch({
        ops: [nodeRemove('n1', new Set([encoded]))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('redundant');
    });

    it('removing non-existent dot → redundant', () => {
      const state = createEmptyState();
      const encoded = encodeDot(Dot.create('w1', 99));

      const patch = makePatch({
        ops: [nodeRemove('n1', new Set([encoded]))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('redundant');
    });
  });

  // =========================================================================
  // EdgeAdd outcomes
  // =========================================================================

  describe('EdgeAdd receipt outcomes', () => {
    it('new edge → applied', () => {
      const state = createEmptyState();
      const patch = makePatch({
        ops: [edgeAdd('a', 'b', 'rel', Dot.create('w1', 1))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0]).toEqual({
        op: 'EdgeAdd',
        target: encodeEdgeKey('a', 'b', 'rel'),
        result: 'applied',
      });
    });

    it('same edge dot added again → redundant', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, dot);

      const patch = makePatch({
        ops: [edgeAdd('a', 'b', 'rel', dot)],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('redundant');
    });
  });

  // =========================================================================
  // EdgeRemove (EdgeTombstone) outcomes
  // =========================================================================

  describe('EdgeRemove receipt outcomes', () => {
    it('removing existing edge dot → applied', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, dot);
      const encoded = encodeDot(dot);

      const patch = makePatch({
        ops: [edgeRemove('a', 'b', 'rel', new Set([encoded]))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0]).toMatchObject({
        op: 'EdgeTombstone',
        result: 'applied',
      });
    });

    it('removing already-tombstoned edge dot → redundant', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, dot);
      const encoded = encodeDot(dot);
      state.edgeAlive.remove(new Set([encoded]));

      const patch = makePatch({
        ops: [edgeRemove('a', 'b', 'rel', new Set([encoded]))],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('redundant');
    });
  });

  // =========================================================================
  // PropSet outcomes
  // =========================================================================

  describe('PropSet receipt outcomes', () => {
    it('setting property with no prior value → applied', () => {
      const state = createEmptyState();
      const patch = makePatch({
        ops: [propSet('n1', 'name', 'Alice')],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0]).toEqual({
        op: 'NodePropSet',
        target: encodePropKey('n1', 'name'),
        result: 'applied',
      });
    });

    it('setting property with higher lamport than existing → applied', () => {
      const state = createEmptyState();
      // Pre-set a property at lamport 1
      const key = encodePropKey('n1', 'name');
      const existingEventId = new EventId(1, 'w1', 'aaaa1111', 0);
      state.prop.set(key, lwwSet(existingEventId, 'OldName'));

      const patch = makePatch({
        writer: 'w1',
        lamport: 2,
        ops: [propSet('n1', 'name', 'NewName')],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('applied');
    });

    it('setting property with lower lamport than existing → superseded', () => {
      const state = createEmptyState();
      const key = encodePropKey('n1', 'name');
      // Pre-set at lamport 10
      const existingEventId = new EventId(10, 'w1', 'aaaa1111', 0);
      state.prop.set(key, lwwSet(existingEventId, 'Winner'));

      const patch = makePatch({
        writer: 'w2',
        lamport: 1, // Lower lamport
        ops: [propSet('n1', 'name', 'Loser')],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('superseded');
      expect(receipt.ops[0].reason).toContain('LWW');
      expect(receipt.ops[0].reason).toContain('w1');
      expect(receipt.ops[0].reason).toContain('10');
    });

    it('setting property with same EventId → redundant', () => {
      const state = createEmptyState();
      const key = encodePropKey('n1', 'name');
      // Pre-set with exact same EventId (same lamport, writer, sha, opIndex)
      const existingEventId = new EventId(1, 'w1', 'abcd1234', 0);
      state.prop.set(key, lwwSet(existingEventId, 'Value'));

      const patch = makePatch({
        writer: 'w1',
        lamport: 1,
        ops: [propSet('n1', 'name', 'Value')],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops[0].result).toBe('redundant');
    });
  });

  // =========================================================================
  // reduceV5 with receipts
  // =========================================================================

  describe('reduceV5 with receipts', () => {
    it('returns { state, receipts } when receipts option is true', () => {
      const patches = [
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 1,
            ops: [nodeAdd('n1', Dot.create('w1', 1))],
          }),
          sha: 'abcd1234',
        },
      ];
      const result = reduceV5(patches, undefined, { receipts: true });
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('receipts');
      expect(result.receipts).toHaveLength(1);
      expect(result.state.nodeAlive.contains('n1')).toBe(true);
    });

    it('returns state directly when receipts option is false', () => {
      const patches = [
        {
          patch: makePatch({
            ops: [nodeAdd('n1', Dot.create('w1', 1))],
          }),
          sha: 'abcd1234',
        },
      ];
      const result = reduceV5(patches, undefined, { receipts: false });
      // Returns state directly
      expect(result.nodeAlive).toBeDefined();
      expect(result.receipts).toBeUndefined();
    });

    it('returns state directly when no options provided', () => {
      const patches = [
        {
          patch: makePatch({
            ops: [nodeAdd('n1', Dot.create('w1', 1))],
          }),
          sha: 'abcd1234',
        },
      ];
      const result = reduceV5(patches);
      expect(result.nodeAlive).toBeDefined();
      expect(result.receipts).toBeUndefined();
    });

    it('receipt count matches patch count', () => {
      const patches = [
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 1,
            ops: [nodeAdd('n1', Dot.create('w1', 1))],
          }),
          sha: 'aaaa1111',
        },
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 2,
            ops: [nodeAdd('n2', Dot.create('w1', 2))],
          }),
          sha: 'bbbb2222',
        },
        {
          patch: makePatch({
            writer: 'w2',
            lamport: 1,
            ops: [nodeAdd('n3', Dot.create('w2', 1))],
          }),
          sha: 'cccc3333',
        },
      ];
      const { receipts } = reduceV5(patches, undefined, { receipts: true });
      expect(receipts).toHaveLength(3);
    });

    it('works with initial state', () => {
      const initial = createEmptyState();
      initial.nodeAlive.add('n0', Dot.create('w0', 1));

      const patches = [
        {
          patch: makePatch({
            writer: 'w1',
            lamport: 1,
            ops: [nodeAdd('n1', Dot.create('w1', 1))],
          }),
          sha: 'abcd1234',
        },
      ];
      const { state, receipts } = reduceV5(patches, initial, { receipts: true });
      expect(receipts).toHaveLength(1);
      expect(state.nodeAlive.contains('n0')).toBe(true);
      expect(state.nodeAlive.contains('n1')).toBe(true);
    });

    it('empty patches array yields empty receipts', () => {
      const { state, receipts } = reduceV5([], undefined, { receipts: true });
      expect(receipts).toHaveLength(0);
      expect(state.nodeAlive.entries.size).toBe(0);
    });
  });

  // =========================================================================
  // Multi-op patches
  // =========================================================================

  describe('multi-op patch receipts', () => {
    it('records one entry per op', () => {
      const state = createEmptyState();
      const patch = makePatch({
        writer: 'w1',
        lamport: 1,
        ops: [
          nodeAdd('n1', Dot.create('w1', 1)),
          nodeAdd('n2', Dot.create('w1', 2)),
          propSet('n1', 'name', 'Alice'),
        ],
      });
      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops).toHaveLength(3);
      expect(receipt.ops[0].op).toBe('NodeAdd');
      expect(receipt.ops[1].op).toBe('NodeAdd');
      expect(receipt.ops[2].op).toBe('NodePropSet');
    });
  });

  // =========================================================================
  // Unknown / forward-compatible op types
  // =========================================================================

  describe('unknown op types (forward-compat)', () => {
    it('unknown op is applied to state but excluded from receipt ops', () => {
      const state = createEmptyState();
      // Mix a known op with an unknown future op type
      const patch = makePatch({
        writer: 'w1',
        lamport: 1,
        ops: [
          nodeAdd('n1', Dot.create('w1', 1)),
          { type: 'FutureOpV99', node: 'n1', payload: 'exotic' },
          propSet('n1', 'name', 'Alice'),
        ],
      });

      // Must not throw despite the unknown op type
      const { state: resultState, receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));

      // The unknown op is silently skipped in the receipt
      expect(receipt.ops).toHaveLength(2);
      expect(receipt.ops[0].op).toBe('NodeAdd');
      expect(receipt.ops[1].op).toBe('NodePropSet');

      // State was still mutated (applyOpV2 ran for all ops, unknown ones are no-ops)
      expect(resultState).toBe(state);
    });

    it('patch with only unknown ops yields receipt with empty ops', () => {
      const state = createEmptyState();
      const patch = makePatch({
        writer: 'w1',
        lamport: 1,
        ops: [
          { type: 'Experimental', node: 'x1' },
        ],
      });

      const { receipt } = /** @type {any} */ (join(state, patch, 'abcd1234', true));
      expect(receipt.ops).toHaveLength(0);
    });
  });

  // =========================================================================
  // Full lifecycle: multi-writer with conflicts
  // =========================================================================

  describe('full lifecycle: multi-writer conflicts', () => {
    it('receipts explain all decisions across writers', () => {
      // Writer 1: add node n1 and set prop
      const p1 = makePatch({
        writer: 'alice',
        lamport: 1,
        ops: [
          nodeAdd('n1', Dot.create('alice', 1)),
          propSet('n1', 'color', 'red'),
        ],
      });

      // Writer 2: add same node (different dot) and set same prop with higher lamport
      const p2 = makePatch({
        writer: 'bob',
        lamport: 2,
        ops: [
          nodeAdd('n1', Dot.create('bob', 1)),
          propSet('n1', 'color', 'blue'),
        ],
      });

      const patches = [
        { patch: p1, sha: 'aaaa1111' },
        { patch: p2, sha: 'bbbb2222' },
      ];

      const { state, receipts } = reduceV5(patches, undefined, { receipts: true });

      // Patch 1 receipts: both ops applied (first writer, empty state)
      expect(receipts[0].writer).toBe('alice');
      expect(receipts[0].ops[0]).toMatchObject({ op: 'NodeAdd', result: 'applied' });
      expect(receipts[0].ops[1]).toMatchObject({ op: 'NodePropSet', result: 'applied' });

      // Patch 2 receipts: node add applied (different dot), prop wins (higher lamport)
      expect(receipts[1].writer).toBe('bob');
      expect(receipts[1].ops[0]).toMatchObject({ op: 'NodeAdd', result: 'applied' });
      expect(receipts[1].ops[1]).toMatchObject({ op: 'NodePropSet', result: 'applied' });

      // Final state: bob's color wins
      const key = encodePropKey('n1', 'color');
      expect(state.prop.get(key).value).toBe('blue');
    });

    it('superseded prop shows reason with winner info', () => {
      // Writer 1: set prop at lamport 10
      const p1 = makePatch({
        writer: 'alice',
        lamport: 10,
        ops: [propSet('n1', 'score', 100)],
      });

      // Writer 2: set same prop at lamport 1 (loses to alice)
      const p2 = makePatch({
        writer: 'bob',
        lamport: 1,
        ops: [propSet('n1', 'score', 999)],
      });

      const patches = [
        { patch: p1, sha: 'aaaa1111' },
        { patch: p2, sha: 'bbbb2222' },
      ];

      const { receipts } = reduceV5(patches, undefined, { receipts: true });

      // Alice's write is applied
      expect(receipts[0].ops[0].result).toBe('applied');

      // Bob's write is superseded — alice wins at lamport 10
      expect(receipts[1].ops[0].result).toBe('superseded');
      expect(receipts[1].ops[0].reason).toContain('alice');
      expect(receipts[1].ops[0].reason).toContain('10');
    });
  });
});
