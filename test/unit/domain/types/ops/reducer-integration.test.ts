/**
 * Tests that Op class instances flow correctly through JoinReducer.
 *
 * The reducer dispatches via OP_STRATEGIES.get(op.type) — class instances
 * have the same .type strings, so they must work identically to plain
 * objects through all three apply paths.
 */
import { describe, it, expect } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';

/** @param {string} node @param {import('../../../../../src/domain/crdt/Dot.ts').Dot} dot */
function createNodeAddV2(node, dot) { return new NodeAdd(node, dot); }
/** @param {string} node @param {string[]} observedDots */
function createNodeRemoveV2(node, observedDots) { return new NodeRemove(node, observedDots); }
/** @param {string} from @param {string} to @param {string} label @param {import('../../../../../src/domain/crdt/Dot.ts').Dot} dot */
function createEdgeAddV2(from, to, label, dot) { return new EdgeAdd({ from, to, label, dot }); }
/** @param {string} from @param {string} to @param {string} label @param {string[]} observedDots */
function createEdgeRemoveV2(from, to, label, observedDots) { return new EdgeRemove({ from, to, label, observedDots }); }
/** @param {string} node @param {string} key @param {unknown} value */
function createPropSetV2(node, key, value) { return new PropSet(node, key, value); }
/** @param {string} node @param {string} key @param {unknown} value */
function createNodePropSetV2(node, key, value) { return new NodePropSet(node, key, value); }
/** @param {string} from @param {string} to @param {string} label @param {string} key @param {unknown} value */
function createEdgePropSetV2(from, to, label, key, value) { return new EdgePropSet({ from, to, label, key, value }); }
import {
  createEmptyState,
  applyPatchOp,
  applyFast,
  applyWithReceipt,
  applyWithDiff,
  isKnownRawOp,
  isKnownCanonicalOp,
  OP_STRATEGIES,
} from '../../../../../src/domain/services/JoinReducer.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';

describe('Op class instances through JoinReducer', () => {
  /** @param {number} opIndex */
  function eid(opIndex) {
    return new EventId(1, 'alice', 'abcd1234', opIndex);
  }

  describe('applyPatchOp', () => {
    it('applies NodeAdd class instance to state', () => {
      const state = createEmptyState();
      const dot = new Dot('alice', 1);
      const op = createNodeAddV2('user:alice', dot);

      expect(op).toBeInstanceOf(NodeAdd);
      applyPatchOp(state, op, eid(0));

      expect(state.nodeAlive.contains('user:alice')).toBe(true);
    });

    it('applies EdgeAdd class instance to state', () => {
      const state = createEmptyState();
      const dot1 = new Dot('alice', 1);
      const dot2 = new Dot('alice', 2);
      const dot3 = new Dot('alice', 3);

      applyPatchOp(state, createNodeAddV2('n1', dot1), eid(0));
      applyPatchOp(state, createNodeAddV2('n2', dot2), eid(1));
      applyPatchOp(state, createEdgeAddV2('n1', 'n2', 'rel', dot3), eid(2));

      expect(state.edgeAlive.contains('n1\x00n2\x00rel')).toBe(true);
    });

    it('applies NodePropSet class instance to state', () => {
      const state = createEmptyState();
      const op = createNodePropSetV2('user:alice', 'name', 'Alice');

      expect(op).toBeInstanceOf(NodePropSet);
      applyPatchOp(state, op, eid(0));

      const propKey = 'user:alice\x00name';
      const reg = state.getEncodedProp(propKey);
      expect(reg).toBeDefined();
      expect(reg?.value).toBe('Alice');
    });

    it('applies PropSet class instance to state', () => {
      const state = createEmptyState();
      const op = createPropSetV2('user:alice', 'name', 'Alice');

      applyPatchOp(state, op, eid(0));

      const propKey = 'user:alice\x00name';
      const reg = state.getEncodedProp(propKey);
      expect(reg).toBeDefined();
      expect(reg?.value).toBe('Alice');
    });

    it('applies NodeRemove class instance to state', () => {
      const state = createEmptyState();
      const dot = new Dot('alice', 1);

      applyPatchOp(state, createNodeAddV2('n1', dot), eid(0));
      expect(state.nodeAlive.contains('n1')).toBe(true);

      applyPatchOp(state, createNodeRemoveV2('n1', ['alice:1']), eid(1));
      expect(state.nodeAlive.contains('n1')).toBe(false);
    });
  });

  describe('applyFast with class instances', () => {
    it('applies a patch of class-instance ops', () => {
      const state = createEmptyState();
      const patch = new Patch({
        writer: 'alice',
        lamport: 1,
        context: VersionVector.empty(),
        ops: [
          createNodeAddV2('n1', new Dot('alice', 1)),
          createNodeAddV2('n2', new Dot('alice', 2)),
          createEdgeAddV2('n1', 'n2', 'rel', new Dot('alice', 3)),
          createNodePropSetV2('n1', 'name', 'Node One'),
        ],
      });

      applyFast(state, patch, 'abcd1234abcd1234abcd1234abcd1234abcd1234');

      expect(state.nodeAlive.contains('n1')).toBe(true);
      expect(state.nodeAlive.contains('n2')).toBe(true);
      expect(state.edgeAlive.contains('n1\x00n2\x00rel')).toBe(true);
      expect(state.getEncodedProp('n1\x00name')?.value).toBe('Node One');
    });
  });

  describe('applyWithReceipt with class instances', () => {
    it('produces a receipt from class-instance ops', () => {
      const state = createEmptyState();
      const patch = new Patch({
        writer: 'alice',
        lamport: 1,
        context: VersionVector.empty(),
        ops: [
          createNodeAddV2('n1', new Dot('alice', 1)),
          createNodePropSetV2('n1', 'name', 'Node One'),
        ],
      });

      const result = applyWithReceipt(state, patch, 'abcd1234abcd1234abcd1234abcd1234abcd1234');

      expect(result.receipt).toBeDefined();
      expect(result.receipt.patchSha).toBe('abcd1234abcd1234abcd1234abcd1234abcd1234');
      expect(result.receipt.ops).toHaveLength(2);
      expect(result.receipt.ops[0]?.op).toBe('NodeAdd');
      expect(result.receipt.ops[0]?.result).toBe('applied');
      expect(result.receipt.ops[1]?.op).toBe('NodePropSet');
    });
  });

  describe('applyWithDiff with class instances', () => {
    it('produces a diff from class-instance ops', () => {
      const state = createEmptyState();
      const patch = new Patch({
        writer: 'alice',
        lamport: 1,
        context: VersionVector.empty(),
        ops: [
          createNodeAddV2('n1', new Dot('alice', 1)),
          createNodePropSetV2('n1', 'name', 'Node One'),
        ],
      });

      const result = applyWithDiff(state, patch, 'abcd1234abcd1234abcd1234abcd1234abcd1234');

      expect(result.diff).toBeDefined();
      expect(result.diff.nodesAdded).toContain('n1');
      expect(result.diff.propsChanged).toHaveLength(1);
      expect(result.diff.propsChanged[0]?.nodeId).toBe('n1');
      expect(result.diff.propsChanged[0]?.key).toBe('name');
      expect(result.diff.propsChanged[0]?.value).toBe('Node One');
    });
  });

  describe('isKnownRawOp / isKnownCanonicalOp with class instances', () => {
    it('recognizes class instances as known raw ops', () => {
      const dot = new Dot('w', 1);
      expect(isKnownRawOp(createNodeAddV2('n1', dot))).toBe(true);
      expect(isKnownRawOp(createNodeRemoveV2('n1', []))).toBe(true);
      expect(isKnownRawOp(createEdgeAddV2('n1', 'n2', 'r', dot))).toBe(true);
      expect(isKnownRawOp(createEdgeRemoveV2('n1', 'n2', 'r', []))).toBe(true);
      expect(isKnownRawOp(createPropSetV2('n1', 'k', 'v'))).toBe(true);
    });

    it('recognizes canonical class instances', () => {
      expect(isKnownCanonicalOp(createNodePropSetV2('n1', 'k', 'v'))).toBe(true);
      expect(isKnownCanonicalOp(createEdgePropSetV2('n1', 'n2', 'r', 'k', 'v'))).toBe(true);
    });
  });

  describe('OP_STRATEGIES dispatches class instances', () => {
    it('finds strategy for every class instance type', () => {
      const dot = new Dot('w', 1);
      const ops = [
        createNodeAddV2('n1', dot),
        createNodeRemoveV2('n1', []),
        createEdgeAddV2('n1', 'n2', 'r', dot),
        createEdgeRemoveV2('n1', 'n2', 'r', []),
        createNodePropSetV2('n1', 'k', 'v'),
        createEdgePropSetV2('n1', 'n2', 'r', 'k', 'v'),
        createPropSetV2('n1', 'k', 'v'),
      ];

      for (const op of ops) {
        const strategy = OP_STRATEGIES.get(op.type);
        expect(strategy).toBeDefined();
        expect(typeof strategy?.mutate).toBe('function');
      }
    });
  });
});
