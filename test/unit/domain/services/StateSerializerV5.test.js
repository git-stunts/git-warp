import { describe, it, expect } from 'vitest';
import {
  nodeVisibleV5,
  edgeVisibleV5,
  propVisibleV5,
  serializeStateV5,
  computeStateHashV5,
  deserializeStateV5,
} from '../../../../src/domain/services/StateSerializerV5.js';
import {
  createEmptyStateV5,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwSet } from '../../../../src/domain/crdt/LWW.js';
import { orsetAdd, orsetRemove } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createInlineValue } from '../../../../src/domain/types/WarpTypes.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

/**
 * Helper to create a mock EventId for testing.
 * Uses valid hex sha (4-64 chars), positive lamport.
 */
function mockEventId(lamport = 1, writerId = 'test', patchSha = 'abcd1234', opIndex = 0) {
  return createEventId(lamport, writerId, patchSha, opIndex);
}

/**
 * Helper to create a dot for ORSet operations.
 */
function mockDot(writerId = 'test', seq = 1) {
  return createDot(writerId, seq);
}

/**
 * Helper to build a V5 state with specific nodes, edges, and props.
 * Uses ORSet for nodes and edges (V5 style).
 */
function buildStateV5({ nodes = /** @type {any[]} */ ([]), edges = /** @type {any[]} */ ([]), props = /** @type {any[]} */ ([]) }) {
  const state = createEmptyStateV5();
  let dotSeq = 1;

  // Add nodes using ORSet
  for (const { nodeId, alive = true, dot } of nodes) {
    // Each element needs a unique dot to avoid tombstone interference
    const nodeDot = dot ?? mockDot('test', dotSeq++);
    orsetAdd(state.nodeAlive, nodeId, nodeDot);
    if (!alive) {
      // Remove by adding observed dots to tombstones
      orsetRemove(state.nodeAlive, /** @type {any} */ (state.nodeAlive.entries.get(nodeId)));
    }
  }

  // Add edges using ORSet
  for (const { from, to, label, alive = true, dot } of edges) {
    const key = encodeEdgeKey(from, to, label);
    // Each element needs a unique dot to avoid tombstone interference
    const edgeDot = dot ?? mockDot('test', dotSeq++);
    orsetAdd(state.edgeAlive, key, edgeDot);
    if (!alive) {
      orsetRemove(state.edgeAlive, /** @type {any} */ (state.edgeAlive.entries.get(key)));
    }
  }

  // Add props using LWW (same as v4)
  for (const { nodeId, key, value, eventId } of props) {
    const propKey = encodePropKey(nodeId, key);
    state.prop.set(propKey, lwwSet(eventId ?? mockEventId(), value));
  }

  return state;
}

describe('StateSerializerV5', () => {
  describe('nodeVisibleV5', () => {
    it('returns true for alive nodes', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      expect(nodeVisibleV5(state, 'a')).toBe(true);
    });

    it('returns false for tombstoned nodes', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a', alive: false }],
      });

      expect(nodeVisibleV5(state, 'a')).toBe(false);
    });

    it('returns false for unknown nodes', () => {
      const state = createEmptyStateV5();

      expect(nodeVisibleV5(state, 'nonexistent')).toBe(false);
    });

    it('returns true when add-remove-add (concurrent wins)', () => {
      const state = createEmptyStateV5();

      // First add
      orsetAdd(state.nodeAlive, 'a', mockDot('alice', 1));
      // Remove observes the first add
      const dots = new Set(state.nodeAlive.entries.get('a'));
      orsetRemove(state.nodeAlive, dots);

      // Concurrent add (not observed by the remove)
      orsetAdd(state.nodeAlive, 'a', mockDot('bob', 1));

      // Node should be visible (concurrent add wins)
      expect(nodeVisibleV5(state, 'a')).toBe(true);
    });
  });

  describe('edgeVisibleV5', () => {
    it('returns true when edge alive AND both endpoints visible', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisibleV5(state, edgeKey)).toBe(true);
    });

    it('returns false when edge tombstoned', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: false }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisibleV5(state, edgeKey)).toBe(false);
    });

    it('returns false when source endpoint tombstoned', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', alive: false }, // tombstoned
          { nodeId: 'b' },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisibleV5(state, edgeKey)).toBe(false);
    });

    it('returns false when target endpoint tombstoned', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a' },
          { nodeId: 'b', alive: false }, // tombstoned
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisibleV5(state, edgeKey)).toBe(false);
    });

    it('returns false when both endpoints tombstoned', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', alive: false },
          { nodeId: 'b', alive: false },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisibleV5(state, edgeKey)).toBe(false);
    });

    it('returns false for unknown edges', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisibleV5(state, edgeKey)).toBe(false);
    });
  });

  describe('propVisibleV5', () => {
    it('returns true when node visible and prop exists', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      const propKey = encodePropKey('a', 'name');
      expect(propVisibleV5(state, propKey)).toBe(true);
    });

    it('returns false when node tombstoned', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a', alive: false }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      const propKey = encodePropKey('a', 'name');
      expect(propVisibleV5(state, propKey)).toBe(false);
    });

    it('returns false when prop does not exist', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      const propKey = encodePropKey('a', 'name');
      expect(propVisibleV5(state, propKey)).toBe(false);
    });

    it('returns false when node unknown', () => {
      const state = createEmptyStateV5();

      const propKey = encodePropKey('a', 'name');
      expect(propVisibleV5(state, propKey)).toBe(false);
    });
  });

  describe('serializeStateV5', () => {
    it('includes only visible nodes', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a' },
          { nodeId: 'b', alive: false }, // tombstoned
          { nodeId: 'c' },
        ],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.nodes).toEqual(['a', 'c']);
    });

    it('sorts nodes alphabetically', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'zebra' }, { nodeId: 'apple' }, { nodeId: 'mango' }],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.nodes).toEqual(['apple', 'mango', 'zebra']);
    });

    it('sorts edges by (from, to, label)', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }, { nodeId: 'c' }],
        edges: [
          { from: 'b', to: 'c', label: 'x' },
          { from: 'a', to: 'c', label: 'y' },
          { from: 'a', to: 'b', label: 'z' },
          { from: 'a', to: 'b', label: 'a' },
        ],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.edges).toEqual([
        { from: 'a', to: 'b', label: 'a' },
        { from: 'a', to: 'b', label: 'z' },
        { from: 'a', to: 'c', label: 'y' },
        { from: 'b', to: 'c', label: 'x' },
      ]);
    });

    it('sorts props by (node, key)', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'b' }, { nodeId: 'a' }],
        props: [
          { nodeId: 'b', key: 'age', value: createInlineValue(30) },
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'a', key: 'age', value: createInlineValue(25) },
          { nodeId: 'b', key: 'name', value: createInlineValue('Bob') },
        ],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.props).toEqual([
        { node: 'a', key: 'age', value: createInlineValue(25) },
        { node: 'a', key: 'name', value: createInlineValue('Alice') },
        { node: 'b', key: 'age', value: createInlineValue(30) },
        { node: 'b', key: 'name', value: createInlineValue('Bob') },
      ]);
    });

    it('excludes tombstoned items from serialization', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a' },
          { nodeId: 'b', alive: false }, // tombstoned node
          { nodeId: 'c' },
        ],
        edges: [
          { from: 'a', to: 'c', label: 'knows' },
          { from: 'a', to: 'b', label: 'follows' }, // invisible (b tombstoned)
        ],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'b', key: 'name', value: createInlineValue('Bob') }, // invisible (b tombstoned)
        ],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.nodes).toEqual(['a', 'c']);
      expect(result.edges).toEqual([{ from: 'a', to: 'c', label: 'knows' }]);
      expect(result.props).toEqual([
        { node: 'a', key: 'name', value: createInlineValue('Alice') },
      ]);
    });

    it('excludes tombstoned edges even with visible endpoints', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: false }], // tombstoned edge
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.edges).toEqual([]);
    });

    it('serializes empty state correctly', () => {
      const state = createEmptyStateV5();

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result).toEqual({ nodes: [], edges: [], props: [] });
    });
  });

  describe('computeStateHashV5', () => {
    it('returns 64-char hex string (SHA-256)', async () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      const hash = await computeStateHashV5(state, { crypto });

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces same hash for same state (determinism)', async () => {
      const state1 = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      const state2 = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      expect(await computeStateHashV5(state1, { crypto })).toBe(await computeStateHashV5(state2, { crypto }));
    });

    it('produces different hashes for different states', async () => {
      const state1 = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      const state2 = buildStateV5({
        nodes: [{ nodeId: 'b' }],
      });

      expect(await computeStateHashV5(state1, { crypto })).not.toBe(await computeStateHashV5(state2, { crypto }));
    });

    it('empty state has consistent hash', async () => {
      const state = createEmptyStateV5();
      const hash1 = await computeStateHashV5(state, { crypto });
      const hash2 = await computeStateHashV5(state, { crypto });

      expect(hash1).toBe(hash2);
    });
  });

  describe('deserializeStateV5', () => {
    it('roundtrips with serializeStateV5', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'b', key: 'age', value: createInlineValue(30) },
        ],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.nodes).toEqual(['a', 'b']);
      expect(result.edges).toEqual([{ from: 'a', to: 'b', label: 'knows' }]);
      expect(result.props).toHaveLength(2);
    });

    it('preserves complex values in props', () => {
      const complexValue = createInlineValue({
        nested: { array: [1, 2, 3], flag: true },
      });
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
        props: [{ nodeId: 'a', key: 'data', value: complexValue }],
      });

      const bytes = serializeStateV5(state);
      const result = deserializeStateV5(/** @type {Buffer} */ (bytes));

      expect(result.props[0].value).toEqual(complexValue);
    });
  });

  describe('determinism (CRITICAL WARP invariant)', () => {
    it('ORSet add-remove semantics produce consistent hash', async () => {
      // State 1: Add node, then another writer removes it
      const state1 = createEmptyStateV5();
      orsetAdd(state1.nodeAlive, 'a', mockDot('alice', 1));
      const observedDots1 = new Set(state1.nodeAlive.entries.get('a'));
      orsetRemove(state1.nodeAlive, observedDots1);

      // State 2: Same operations via different writer IDs (same result)
      const state2 = createEmptyStateV5();
      orsetAdd(state2.nodeAlive, 'a', mockDot('bob', 1));
      const observedDots2 = new Set(state2.nodeAlive.entries.get('a'));
      orsetRemove(state2.nodeAlive, observedDots2);

      // Both should have empty visible state (node removed)
      expect(await computeStateHashV5(state1, { crypto })).toBe(await computeStateHashV5(state2, { crypto }));
    });

    it('concurrent add after remove wins correctly', async () => {
      // State where a concurrent add survives a remove
      const state1 = createEmptyStateV5();

      // Add by Alice
      orsetAdd(state1.nodeAlive, 'n', mockDot('alice', 1));
      // Bob observed Alice's add and removes
      const observedDots = new Set(state1.nodeAlive.entries.get('n'));
      orsetRemove(state1.nodeAlive, observedDots);
      // Concurrent add by Carol (not observed by Bob's remove)
      orsetAdd(state1.nodeAlive, 'n', mockDot('carol', 1));

      // State 2: Same final result via different order
      const state2 = createEmptyStateV5();
      orsetAdd(state2.nodeAlive, 'n', mockDot('carol', 1));

      // Both should show 'n' as visible
      expect(nodeVisibleV5(state1, 'n')).toBe(true);
      expect(nodeVisibleV5(state2, 'n')).toBe(true);
      expect(await computeStateHashV5(state1, { crypto })).toBe(await computeStateHashV5(state2, { crypto }));
    });

    it('different insertion orders produce same hash when final state is same', async () => {
      // Build states with nodes added in different orders
      const state1 = createEmptyStateV5();
      orsetAdd(state1.nodeAlive, 'zebra', mockDot('w1', 1));
      orsetAdd(state1.nodeAlive, 'apple', mockDot('w1', 2));
      orsetAdd(state1.nodeAlive, 'mango', mockDot('w1', 3));

      const state2 = createEmptyStateV5();
      orsetAdd(state2.nodeAlive, 'apple', mockDot('w2', 1));
      orsetAdd(state2.nodeAlive, 'mango', mockDot('w2', 2));
      orsetAdd(state2.nodeAlive, 'zebra', mockDot('w2', 3));

      expect(await computeStateHashV5(state1, { crypto })).toBe(await computeStateHashV5(state2, { crypto }));
    });
  });
});
