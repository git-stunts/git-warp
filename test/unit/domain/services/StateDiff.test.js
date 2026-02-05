import { describe, it, expect } from 'vitest';
import {
  diffStates,
  isEmptyDiff,
  createEmptyDiff,
} from '../../../../src/domain/services/StateDiff.js';
import {
  createEmptyStateV5,
  applyOpV2,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwSet } from '../../../../src/domain/crdt/LWW.js';

// Helper to create a node add operation
function createNodeAddOp(nodeId, writerId, counter) {
  return {
    type: 'NodeAdd',
    node: nodeId,
    dot: createDot(writerId, counter),
  };
}

// Helper to create an edge add operation
function createEdgeAddOp(from, to, label, writerId, counter) {
  return {
    type: 'EdgeAdd',
    from,
    to,
    label,
    dot: createDot(writerId, counter),
  };
}

// Helper to apply operations to state with auto-incrementing lamport
function applyOps(state, ops, writerId) {
  let lamport = 1;
  for (const op of ops) {
    const eventId = createEventId(lamport++, writerId, 'abcd1234', 0);
    applyOpV2(state, op, eventId);
  }
}

// Helper to create an EventId for property tests
function makeEventId(lamport, writerId = 'w1') {
  return createEventId(lamport, writerId, 'abcd1234', 0);
}

describe('StateDiff', () => {
  describe('diffStates', () => {
    describe('node changes', () => {
      it('detects added nodes', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(after, [createNodeAddOp('user:alice', 'w1', 1)], 'w1');

        const diff = diffStates(before, after);

        expect(diff.nodes.added).toEqual(['user:alice']);
        expect(diff.nodes.removed).toEqual([]);
      });

      it('detects removed nodes', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(before, [createNodeAddOp('user:alice', 'w1', 1)], 'w1');

        const diff = diffStates(before, after);

        expect(diff.nodes.added).toEqual([]);
        expect(diff.nodes.removed).toEqual(['user:alice']);
      });

      it('detects multiple node changes', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(before, [
          createNodeAddOp('user:alice', 'w1', 1),
          createNodeAddOp('user:charlie', 'w1', 3),
        ], 'w1');

        applyOps(after, [
          createNodeAddOp('user:alice', 'w1', 1),
          createNodeAddOp('user:bob', 'w1', 2),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.nodes.added).toEqual(['user:bob']);
        expect(diff.nodes.removed).toEqual(['user:charlie']);
      });

      it('returns sorted node IDs', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(after, [
          createNodeAddOp('zebra', 'w1', 1),
          createNodeAddOp('alpha', 'w1', 2),
          createNodeAddOp('middle', 'w1', 3),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.nodes.added).toEqual(['alpha', 'middle', 'zebra']);
      });
    });

    describe('edge changes', () => {
      it('detects added edges', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(after, [
          createNodeAddOp('user:alice', 'w1', 1),
          createNodeAddOp('user:bob', 'w1', 2),
          createEdgeAddOp('user:alice', 'user:bob', 'follows', 'w1', 3),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.edges.added).toEqual([
          { from: 'user:alice', to: 'user:bob', label: 'follows' },
        ]);
        expect(diff.edges.removed).toEqual([]);
      });

      it('detects removed edges', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(before, [
          createNodeAddOp('user:alice', 'w1', 1),
          createNodeAddOp('user:bob', 'w1', 2),
          createEdgeAddOp('user:alice', 'user:bob', 'follows', 'w1', 3),
        ], 'w1');

        applyOps(after, [
          createNodeAddOp('user:alice', 'w1', 1),
          createNodeAddOp('user:bob', 'w1', 2),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.edges.added).toEqual([]);
        expect(diff.edges.removed).toEqual([
          { from: 'user:alice', to: 'user:bob', label: 'follows' },
        ]);
      });

      it('returns sorted edges', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(after, [
          // Add nodes first - edges are only visible if both endpoints exist
          createNodeAddOp('a', 'w1', 1),
          createNodeAddOp('z', 'w1', 2),
          createEdgeAddOp('z', 'a', 'label', 'w1', 3),
          createEdgeAddOp('a', 'z', 'label', 'w1', 4),
          createEdgeAddOp('a', 'a', 'zebra', 'w1', 5),
          createEdgeAddOp('a', 'a', 'alpha', 'w1', 6),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.edges.added).toEqual([
          { from: 'a', to: 'a', label: 'alpha' },
          { from: 'a', to: 'a', label: 'zebra' },
          { from: 'a', to: 'z', label: 'label' },
          { from: 'z', to: 'a', label: 'label' },
        ]);
      });

      it('excludes edges with missing endpoints from diff', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        // Add edge without nodes - edge should be invisible
        applyOps(after, [
          createEdgeAddOp('orphan:a', 'orphan:b', 'dangling', 'w1', 1),
        ], 'w1');

        const diff = diffStates(before, after);

        // Edge should not appear as added since endpoints don't exist
        expect(diff.edges.added).toEqual([]);
      });

      it('excludes edges when source node is missing', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(after, [
          // Only add target node, not source
          createNodeAddOp('target', 'w1', 1),
          createEdgeAddOp('missing', 'target', 'half', 'w1', 2),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.edges.added).toEqual([]);
      });

      it('excludes edges when target node is missing', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(after, [
          // Only add source node, not target
          createNodeAddOp('source', 'w1', 1),
          createEdgeAddOp('source', 'missing', 'half', 'w1', 2),
        ], 'w1');

        const diff = diffStates(before, after);

        expect(diff.edges.added).toEqual([]);
      });

      it('removes edge from diff when endpoint node disappears', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        // Before: both nodes and edge exist
        applyOps(before, [
          createNodeAddOp('a', 'w1', 1),
          createNodeAddOp('b', 'w1', 2),
          createEdgeAddOp('a', 'b', 'link', 'w1', 3),
        ], 'w1');

        // After: edge still in edgeAlive but node 'b' is gone
        applyOps(after, [
          createNodeAddOp('a', 'w1', 1),
          createEdgeAddOp('a', 'b', 'link', 'w1', 3),
        ], 'w1');

        const diff = diffStates(before, after);

        // The edge should be in 'removed' because it was visible before (both endpoints alive)
        // but invisible after (endpoint 'b' is missing)
        expect(diff.edges.removed).toEqual([
          { from: 'a', to: 'b', label: 'link' },
        ]);
        expect(diff.edges.added).toEqual([]);
      });
    });

    describe('property changes', () => {
      it('detects new properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const propKey = encodePropKey('user:alice', 'name');
        after.prop.set(propKey, lwwSet(makeEventId(1), 'Alice'));

        const diff = diffStates(before, after);

        expect(diff.props.set).toEqual([
          {
            key: propKey,
            nodeId: 'user:alice',
            propKey: 'name',
            oldValue: undefined,
            newValue: 'Alice',
          },
        ]);
        expect(diff.props.removed).toEqual([]);
      });

      it('detects removed properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const propKey = encodePropKey('user:alice', 'name');
        before.prop.set(propKey, lwwSet(makeEventId(1), 'Alice'));

        const diff = diffStates(before, after);

        expect(diff.props.set).toEqual([]);
        expect(diff.props.removed).toEqual([
          {
            key: propKey,
            nodeId: 'user:alice',
            propKey: 'name',
            oldValue: 'Alice',
          },
        ]);
      });

      it('detects changed properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const propKey = encodePropKey('user:alice', 'name');
        before.prop.set(propKey, lwwSet(makeEventId(1), 'Alice'));
        after.prop.set(propKey, lwwSet(makeEventId(2), 'Alicia'));

        const diff = diffStates(before, after);

        expect(diff.props.set).toEqual([
          {
            key: propKey,
            nodeId: 'user:alice',
            propKey: 'name',
            oldValue: 'Alice',
            newValue: 'Alicia',
          },
        ]);
        expect(diff.props.removed).toEqual([]);
      });

      it('ignores unchanged properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const propKey = encodePropKey('user:alice', 'name');
        before.prop.set(propKey, lwwSet(makeEventId(1), 'Alice'));
        after.prop.set(propKey, lwwSet(makeEventId(2), 'Alice'));

        const diff = diffStates(before, after);

        expect(diff.props.set).toEqual([]);
        expect(diff.props.removed).toEqual([]);
      });

      it('detects changes to object properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const propKey = encodePropKey('user:alice', 'meta');
        before.prop.set(propKey, lwwSet(makeEventId(1), { age: 25 }));
        after.prop.set(propKey, lwwSet(makeEventId(2), { age: 26 }));

        const diff = diffStates(before, after);

        expect(diff.props.set).toHaveLength(1);
        expect(diff.props.set[0].oldValue).toEqual({ age: 25 });
        expect(diff.props.set[0].newValue).toEqual({ age: 26 });
      });

      it('ignores unchanged object properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const propKey = encodePropKey('user:alice', 'meta');
        before.prop.set(propKey, lwwSet(makeEventId(1), { age: 25, tags: ['a', 'b'] }));
        after.prop.set(propKey, lwwSet(makeEventId(2), { age: 25, tags: ['a', 'b'] }));

        const diff = diffStates(before, after);

        expect(diff.props.set).toEqual([]);
      });

      it('returns sorted properties', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        after.prop.set(encodePropKey('z', 'name'), lwwSet(makeEventId(1), 'Z'));
        after.prop.set(encodePropKey('a', 'name'), lwwSet(makeEventId(2), 'A'));
        after.prop.set(encodePropKey('a', 'age'), lwwSet(makeEventId(3), 25));

        const diff = diffStates(before, after);

        expect(diff.props.set.map(p => p.key)).toEqual([
          encodePropKey('a', 'age'),
          encodePropKey('a', 'name'),
          encodePropKey('z', 'name'),
        ]);
      });
    });

    describe('null before state (initial)', () => {
      it('treats null before as empty state', () => {
        const after = createEmptyStateV5();

        applyOps(after, [
          createNodeAddOp('user:alice', 'w1', 1),
          createEdgeAddOp('user:alice', 'user:alice', 'self', 'w1', 2),
        ], 'w1');

        after.prop.set(encodePropKey('user:alice', 'name'), lwwSet(makeEventId(1), 'Alice'));

        const diff = diffStates(null, after);

        expect(diff.nodes.added).toEqual(['user:alice']);
        expect(diff.nodes.removed).toEqual([]);
        expect(diff.edges.added).toEqual([
          { from: 'user:alice', to: 'user:alice', label: 'self' },
        ]);
        expect(diff.props.set).toHaveLength(1);
      });
    });

    describe('identical states', () => {
      it('returns empty diff for identical states', () => {
        const state = createEmptyStateV5();

        applyOps(state, [
          createNodeAddOp('user:alice', 'w1', 1),
        ], 'w1');

        state.prop.set(encodePropKey('user:alice', 'name'), lwwSet(makeEventId(1), 'Alice'));

        const diff = diffStates(state, state);

        expect(diff.nodes.added).toEqual([]);
        expect(diff.nodes.removed).toEqual([]);
        expect(diff.edges.added).toEqual([]);
        expect(diff.edges.removed).toEqual([]);
        expect(diff.props.set).toEqual([]);
        expect(diff.props.removed).toEqual([]);
        expect(isEmptyDiff(diff)).toBe(true);
      });

      it('returns empty diff for two empty states', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        const diff = diffStates(before, after);

        expect(isEmptyDiff(diff)).toBe(true);
      });
    });

    describe('determinism', () => {
      it('produces identical output across multiple runs', () => {
        const before = createEmptyStateV5();
        const after = createEmptyStateV5();

        applyOps(before, [
          createNodeAddOp('a', 'w1', 1),
          createNodeAddOp('b', 'w1', 2),
        ], 'w1');

        applyOps(after, [
          createNodeAddOp('b', 'w1', 2),
          createNodeAddOp('c', 'w1', 3),
        ], 'w1');

        const diff1 = diffStates(before, after);
        const diff2 = diffStates(before, after);
        const diff3 = diffStates(before, after);

        expect(JSON.stringify(diff1)).toBe(JSON.stringify(diff2));
        expect(JSON.stringify(diff2)).toBe(JSON.stringify(diff3));
      });
    });
  });

  describe('isEmptyDiff', () => {
    it('returns true for empty diff', () => {
      const diff = createEmptyDiff();
      expect(isEmptyDiff(diff)).toBe(true);
    });

    it('returns false when nodes added', () => {
      const diff = createEmptyDiff();
      diff.nodes.added.push('a');
      expect(isEmptyDiff(diff)).toBe(false);
    });

    it('returns false when nodes removed', () => {
      const diff = createEmptyDiff();
      diff.nodes.removed.push('a');
      expect(isEmptyDiff(diff)).toBe(false);
    });

    it('returns false when edges added', () => {
      const diff = createEmptyDiff();
      diff.edges.added.push({ from: 'a', to: 'b', label: 'c' });
      expect(isEmptyDiff(diff)).toBe(false);
    });

    it('returns false when edges removed', () => {
      const diff = createEmptyDiff();
      diff.edges.removed.push({ from: 'a', to: 'b', label: 'c' });
      expect(isEmptyDiff(diff)).toBe(false);
    });

    it('returns false when props set', () => {
      const diff = createEmptyDiff();
      diff.props.set.push({ key: 'k', nodeId: 'n', propKey: 'p', oldValue: undefined, newValue: 1 });
      expect(isEmptyDiff(diff)).toBe(false);
    });

    it('returns false when props removed', () => {
      const diff = createEmptyDiff();
      diff.props.removed.push({ key: 'k', nodeId: 'n', propKey: 'p', oldValue: 1 });
      expect(isEmptyDiff(diff)).toBe(false);
    });
  });

  describe('createEmptyDiff', () => {
    it('returns properly structured empty diff', () => {
      const diff = createEmptyDiff();

      expect(diff).toEqual({
        nodes: { added: [], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      });
    });

    it('returns independent objects', () => {
      const diff1 = createEmptyDiff();
      const diff2 = createEmptyDiff();

      diff1.nodes.added.push('a');

      expect(diff2.nodes.added).toEqual([]);
    });
  });
});
