/**
 * Empty-observed-dot removal law (#193).
 *
 * The law, recorded in docs/topics/crdt-construction.md:
 *
 * 1. A remove must name its owner. A `NodeRemove` without `node`, or an
 *    `EdgeRemove` without `from`/`to`/`label`, is malformed. Every reducer
 *    path rejects it with `PatchError` (`E_PATCH_MALFORMED`), the same way
 *    the persisted-patch decode boundary already does.
 * 2. A remove that names its owner but observes no dots is a lawful
 *    explicit no-op, whether the owner is absent or alive. Its receipt
 *    reports `redundant` for the named owner, and it does not advance the
 *    owner's lifecycle (no property clear, no edge-remove event).
 * 3. A remove never deletes an add that it did not observe. A concurrent
 *    re-add stays present, with empty or non-empty observed dots, in every
 *    join order.
 */

import { describe, it, expect } from 'vitest';
import {
  applyPatchOp,
  createEmptyState,
  encodeEdgeKey,
  reducePatches,
} from '../../../../src/domain/services/JoinReducer.ts';
import { hydrateDecodedPatch } from '../../../../src/domain/services/PatchHydrator.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import type { OpLike } from '../../../../src/domain/services/OpLike.ts'; // nosemgrep: ts-no-like-types -- 0025C

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

/** Malformed decoded shapes. `OpLike` is the reducer's raw-input boundary type. */
const NODE_REMOVE_WITHOUT_OWNER: OpLike = { type: 'NodeRemove', observedDots: [] }; // nosemgrep: ts-no-like-types -- 0025C
const EDGE_REMOVE_WITHOUT_OWNER: OpLike = { type: 'EdgeRemove', observedDots: [] }; // nosemgrep: ts-no-like-types -- 0025C
const NODE_REMOVE_WITHOUT_OWNER_WITH_DOT: OpLike = { // nosemgrep: ts-no-like-types -- 0025C
  type: 'NodeRemove',
  observedDots: [encodeDot(Dot.create('w1', 1))],
};

function entry(writer: string, lamport: number, ops: readonly PatchOp[], sha: string): { patch: Patch; sha: string } {
  return { patch: new Patch({ writer, lamport, context: VersionVector.empty(), ops }), sha };
}

function rawEntry(ops: readonly OpLike[]): { patch: { writer: string; lamport: number; ops: readonly OpLike[]; context: VersionVector }; sha: string } { // nosemgrep: ts-no-like-types -- 0025C
  return { patch: { writer: 'w1', lamport: 1, ops, context: VersionVector.empty() }, sha: SHA_A };
}

function captureError(run: () => void): PatchError {
  try {
    run();
  } catch (err) {
    if (err instanceof PatchError) { return err; }
    throw err;
  }
  throw new PatchError('expected PatchError, but the call returned normally');
}

const addA = entry('w1', 1, [new NodeAdd('node:a', Dot.create('w1', 1))], SHA_A);

describe('empty-observed-dot removal law (#193)', () => {
  describe('rule 1: a remove without owner identity is malformed', () => {
    const eventId = new EventId(1, 'w1', SHA_A, 0);

    it('rejects NodeRemove without node in applyPatchOp', () => {
      const err = captureError(() => applyPatchOp(createEmptyState(), NODE_REMOVE_WITHOUT_OWNER, eventId));
      expect(err.code).toBe('E_PATCH_MALFORMED');
      expect(err.context).toMatchObject({ opType: 'NodeRemove', field: 'node' });
    });

    it('rejects EdgeRemove without from/to/label in applyPatchOp', () => {
      const err = captureError(() => applyPatchOp(createEmptyState(), EDGE_REMOVE_WITHOUT_OWNER, eventId));
      expect(err.code).toBe('E_PATCH_MALFORMED');
      expect(err.context).toMatchObject({ opType: 'EdgeRemove', field: 'from' });
    });

    it('rejects an ownerless remove on every reducePatches path', () => {
      for (const op of [NODE_REMOVE_WITHOUT_OWNER, EDGE_REMOVE_WITHOUT_OWNER]) {
        expect(() => reducePatches([rawEntry([op])])).toThrow(PatchError);
        expect(() => reducePatches([rawEntry([op])], undefined, { receipts: true })).toThrow(PatchError);
        expect(() => reducePatches([rawEntry([op])], undefined, { trackDiff: true })).toThrow(PatchError);
      }
    });

    it('rejects an ownerless remove even when it carries observed dots', () => {
      const state = reducePatches([addA]);
      expect(() => applyPatchOp(state, NODE_REMOVE_WITHOUT_OWNER_WITH_DOT, eventId)).toThrow(PatchError);
      expect(state.nodeAlive.contains('node:a')).toBe(true);
    });

    it('matches the persisted-patch decode boundary, which already rejects ownerless removes', () => {
      for (const op of [NODE_REMOVE_WITHOUT_OWNER, EDGE_REMOVE_WITHOUT_OWNER]) {
        const decoded = { schema: 2, writer: 'w1', lamport: 1, context: {}, ops: [op] };
        expect(() => hydrateDecodedPatch(decoded, undefined)).toThrow(PatchError);
      }
    });
  });

  describe('rule 2: an owned remove with no observed dots is an explicit no-op', () => {
    it('absent node: no state change, receipt is redundant for the named node', () => {
      const { state, receipts } = reducePatches(
        [entry('w1', 1, [new NodeRemove('node:ghost', [])], SHA_A)],
        undefined,
        { receipts: true },
      );
      expect(state.nodeAlive.contains('node:ghost')).toBe(false);
      expect(state.nodeClearEvent.has('node:ghost')).toBe(false);
      expect(receipts[0]?.ops).toEqual([{ op: 'NodeTombstone', target: 'node:ghost', result: 'redundant' }]);
    });

    it('absent edge: no state change, receipt is redundant for the named edge', () => {
      const edgeKey = encodeEdgeKey('node:a', 'node:b', 'rel');
      const { state, receipts } = reducePatches(
        [entry('w1', 1, [new EdgeRemove({ from: 'node:a', to: 'node:b', label: 'rel', observedDots: [] })], SHA_A)],
        undefined,
        { receipts: true },
      );
      expect(state.edgeAlive.contains(edgeKey)).toBe(false);
      expect(state.edgeRemoveEvent.has(edgeKey)).toBe(false);
      expect(receipts[0]?.ops).toEqual([{ op: 'EdgeTombstone', target: edgeKey, result: 'redundant' }]);
    });

    it('live node: stays alive, keeps its properties, receipt is redundant', () => {
      const setup = entry('w1', 1, [
        new NodeAdd('node:a', Dot.create('w1', 1)),
        new NodePropSet('node:a', 'color', 'red'),
      ], SHA_A);
      const emptyRemove = entry('w2', 2, [new NodeRemove('node:a', [])], SHA_B);
      const { state, receipts } = reducePatches([setup, emptyRemove], undefined, { receipts: true });
      expect(state.nodeAlive.contains('node:a')).toBe(true);
      expect(state.nodeClearEvent.has('node:a')).toBe(false);
      expect(state.getNodeProp('node:a', 'color')?.value).toBe('red');
      expect(receipts[1]?.ops).toEqual([{ op: 'NodeTombstone', target: 'node:a', result: 'redundant' }]);
    });

    it('live edge: stays alive, records no remove event, receipt is redundant', () => {
      const edgeKey = encodeEdgeKey('node:a', 'node:b', 'rel');
      const setup = entry('w1', 1, [
        new EdgeAdd({ from: 'node:a', to: 'node:b', label: 'rel', dot: Dot.create('w1', 1) }),
      ], SHA_A);
      const emptyRemove = entry('w2', 2, [
        new EdgeRemove({ from: 'node:a', to: 'node:b', label: 'rel', observedDots: [] }),
      ], SHA_B);
      const { state, receipts } = reducePatches([setup, emptyRemove], undefined, { receipts: true });
      expect(state.edgeAlive.contains(edgeKey)).toBe(true);
      expect(state.edgeRemoveEvent.has(edgeKey)).toBe(false);
      expect(receipts[1]?.ops).toEqual([{ op: 'EdgeTombstone', target: edgeKey, result: 'redundant' }]);
    });

    it('the three reducer paths agree on the no-op', () => {
      const emptyRemove = entry('w2', 2, [new NodeRemove('node:a', [])], SHA_B);
      const fast = reducePatches([addA, emptyRemove]);
      const withDiff = reducePatches([addA, emptyRemove], undefined, { trackDiff: true });
      expect(fast.nodeAlive.contains('node:a')).toBe(true);
      expect(withDiff.state.nodeAlive.contains('node:a')).toBe(true);
      expect(withDiff.diff.nodesRemoved).toEqual([]);
      expect(withDiff.diff.nodesCleared).toEqual([]);
    });
  });

  describe('rule 3: a concurrent re-add survives every remove that did not observe it', () => {
    const observedRemove = entry('w2', 2, [new NodeRemove('node:a', [encodeDot(Dot.create('w1', 1))])], SHA_B);
    const emptyRemove = entry('w2', 2, [new NodeRemove('node:a', [])], SHA_B);
    const concurrentReAdd = entry('w3', 2, [new NodeAdd('node:a', Dot.create('w3', 1))], SHA_C);

    const orders = (remove: { patch: Patch; sha: string }) => [
      [addA, remove, concurrentReAdd],
      [addA, concurrentReAdd, remove],
      [concurrentReAdd, addA, remove],
    ];

    it('an observed-dot remove keeps the unseen re-add alive in every join order', () => {
      for (const order of orders(observedRemove)) {
        const state = reducePatches(order);
        expect(state.nodeAlive.contains('node:a')).toBe(true);
        expect([...state.nodeAlive.getDots('node:a')]).toEqual([encodeDot(Dot.create('w3', 1))]);
      }
    });

    it('an empty-dot remove keeps both adds alive in every join order', () => {
      for (const order of orders(emptyRemove)) {
        const state = reducePatches(order);
        expect(state.nodeAlive.getDots('node:a').size).toBe(2);
      }
    });

    it('the observed-dot remove reports applied, the empty-dot remove reports redundant', () => {
      const observed = reducePatches([addA, concurrentReAdd, observedRemove], undefined, { receipts: true });
      const empty = reducePatches([addA, concurrentReAdd, emptyRemove], undefined, { receipts: true });
      expect(observed.receipts[2]?.ops[0]?.result).toBe('applied');
      expect(empty.receipts[2]?.ops[0]?.result).toBe('redundant');
    });
  });
});
