import { describe, it, expect } from 'vitest';
import {
  nodeVisible,
  edgeVisible,
  propertyVisible,
  projectState,
  serializeState,
  computeStateHash,
  deserializeState,
} from '../../../../src/domain/services/state/StateSerializer.ts';
import { createStateReader } from '../../../../src/domain/services/state/StateReader.ts';
import { compareVisibleState } from '../../../../src/domain/services/comparison/VisibleStateComparison.ts';
import {
  createEmptyState,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.ts';
import type { NodePropertyEntry } from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { lwwSet } from '../../../../src/domain/crdt/LWW.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
function createInlineValue(value: unknown) { return { type: 'inline', value }; }
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  encodeEdgePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';

const crypto = new NodeCryptoAdapter();

/**
 * Helper to create a mock EventId for testing.
 * Uses valid hex sha (4-64 chars), positive lamport.
 */
function mockEventId(lamport = 1, writerId = 'test', patchSha = 'abcd1234', opIndex = 0) {
  return new EventId(lamport, writerId, patchSha, opIndex);
}

/**
 * Helper to create a dot for ORSet operations.
 */
function mockDot(writerId = 'test', seq = 1) {
  return Dot.create(writerId, seq);
}

/**
 * Helper to build a V5 state with specific nodes, edges, and props.
 * Uses ORSet for nodes and edges (V5 style).
 */
function buildStateV5({ nodes = [] as any[], edges = [] as any[], props = [] as any[] }: { nodes?: any[]; edges?: any[]; props?: any[] } = {}) {
  const state = createEmptyState();
  let dotSeq = 1;

  // Add nodes using ORSet
  for (const { nodeId, alive = true, dot } of nodes) {
    // Each element needs a unique dot to avoid tombstone interference
    const nodeDot = dot ?? mockDot('test', dotSeq++);
    state.nodeAlive.add(nodeId, nodeDot);
    if (!alive) {
      // Remove by adding observed dots to tombstones
      state.nodeAlive.remove(state.nodeAlive.entries.get(nodeId) as any);
    }
  }

  // Add edges using ORSet
  for (const { from, to, label, alive = true, dot } of edges) {
    const key = encodeEdgeKey(from, to, label);
    // Each element needs a unique dot to avoid tombstone interference
    const edgeDot = dot ?? mockDot('test', dotSeq++);
    state.edgeAlive.add(key, edgeDot);
    if (!alive) {
      state.edgeAlive.remove(state.edgeAlive.entries.get(key) as any);
    }
  }

  // Add props using LWW (same as v4)
  for (const { nodeId, key, value, eventId } of props) {
    const propKey = encodePropKey(nodeId, key);
    state.mutatePropLWW(propKey, eventId ?? mockEventId(), value);
  }

  return state;
}

describe('StateSerializer', () => {
  describe('nodeVisible', () => {
    it('returns true for alive nodes', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      expect(nodeVisible(state, 'a')).toBe(true);
    });

    it('returns false for tombstoned nodes', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a', alive: false }],
      });

      expect(nodeVisible(state, 'a')).toBe(false);
    });

    it('returns false for unknown nodes', () => {
      const state = createEmptyState();

      expect(nodeVisible(state, 'nonexistent')).toBe(false);
    });

    it('returns true when add-remove-add (concurrent wins)', () => {
      const state = createEmptyState();

      // First add
      state.nodeAlive.add('a', mockDot('alice', 1));
      // Remove observes the first add
      const dots = new Set(state.nodeAlive.entries.get('a'));
      state.nodeAlive.remove(dots);

      // Concurrent add (not observed by the remove)
      state.nodeAlive.add('a', mockDot('bob', 1));

      // Node should be visible (concurrent add wins)
      expect(nodeVisible(state, 'a')).toBe(true);
    });
  });

  describe('edgeVisible', () => {
    it('returns true when edge alive AND both endpoints visible', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(true);
    });

    it('returns false when edge tombstoned', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: false }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
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
      expect(edgeVisible(state, edgeKey)).toBe(false);
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
      expect(edgeVisible(state, edgeKey)).toBe(false);
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
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });

    it('returns false for unknown edges', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });
  });

  describe('propertyVisible', () => {
    function makeOrphanEntry(nodeId: string, key: string): NodePropertyEntry {
      const propValue: PropValue = 'orphan';
      return {
        encodedKey: encodePropKey(nodeId, key),
        nodeId,
        key,
        register: lwwSet(new EventId(1, 'test', 'abcd1234', 0), propValue),
      };
    }

    it('returns true when node is visible', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });
      const entries = [...state.nodeProperties()];
      expect(entries.length).toBeGreaterThan(0);
      expect(propertyVisible(state, entries[0]!)).toBe(true);
    });

    it('returns false when node is tombstoned', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a', alive: false }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });
      const entries = [...state.nodeProperties()];
      expect(entries.length).toBeGreaterThan(0);
      expect(propertyVisible(state, entries[0]!)).toBe(false);
    });

    it('returns false when node is unknown', () => {
      const state = createEmptyState();
      expect(propertyVisible(state, makeOrphanEntry('a', 'name'))).toBe(false);
    });
  });

  describe('serializeState', () => {
    it('projectState returns the visible projection without exposing OR-Set internals', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a' },
          { nodeId: 'b', alive: false },
          { nodeId: 'c' },
        ],
        edges: [
          { from: 'a', to: 'c', label: 'rel' },
          { from: 'a', to: 'b', label: 'dead-edge' },
        ],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'b', key: 'hidden', value: createInlineValue('Ghost') },
          { nodeId: 'c', key: 'name', value: createInlineValue('Carol') },
        ],
      });

      expect(projectState(state)).toEqual({
        nodes: ['a', 'c'],
        edges: [{ from: 'a', to: 'c', label: 'rel' }],
        props: [
          { node: 'a', key: 'name', value: createInlineValue('Alice') },
          { node: 'c', key: 'name', value: createInlineValue('Carol') },
        ],
      });
    });

    it('includes only visible nodes', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a' },
          { nodeId: 'b', alive: false }, // tombstoned
          { nodeId: 'c' },
        ],
      });

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

      expect(result.nodes).toEqual(['a', 'c']);
    });

    it('sorts nodes alphabetically', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'zebra' }, { nodeId: 'apple' }, { nodeId: 'mango' }],
      });

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

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

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

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

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

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

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

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

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

      expect(result.edges).toEqual([]);
    });

    it('serializes empty state correctly', () => {
      const state = createEmptyState();

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

      expect(result).toEqual({ nodes: [], edges: [], props: [] });
    });
  });

  describe('createStateReader', () => {
    it('provides stable node, edge, neighbor, and content helpers over visible state', () => {
      const edgeBirth = mockEventId(2, 'alice', 'bbbbbbbb', 0);
      const nodeContentEvent = mockEventId(4, 'alice', 'cccccccc', 0);
      const edgeContentEvent = mockEventId(5, 'alice', 'dddddddd', 0);
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a' },
          { nodeId: 'b', alive: false },
          { nodeId: 'c' },
          { nodeId: 'd' },
        ],
        edges: [
          { from: 'a', to: 'c', label: 'rel' },
          { from: 'd', to: 'a', label: 'back' },
          { from: 'a', to: 'b', label: 'dead-edge' },
        ],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'c', key: 'name', value: createInlineValue('Carol') },
          { nodeId: 'a', key: CONTENT_PROPERTY_KEY, value: 'oid:node', eventId: nodeContentEvent },
          { nodeId: 'a', key: CONTENT_MIME_PROPERTY_KEY, value: 'text/plain', eventId: mockEventId(4, 'alice', 'cccccccc', 1) },
          { nodeId: 'a', key: CONTENT_SIZE_PROPERTY_KEY, value: 12, eventId: mockEventId(4, 'alice', 'cccccccc', 2) },
        ],
      });

      state.edgeBirthEvent.set(encodeEdgeKey('a', 'c', 'rel'), edgeBirth);
      state.mutatePropLWW(
        encodeEdgePropKey('a', 'c', 'rel', 'since'),
        mockEventId(3, 'alice', 'eeeeeeee', 0),
        2026,
      );
      state.mutatePropLWW(
        encodeEdgePropKey('a', 'c', 'rel', CONTENT_PROPERTY_KEY),
        edgeContentEvent,
        'oid:edge',
      );
      state.mutatePropLWW(
        encodeEdgePropKey('a', 'c', 'rel', CONTENT_MIME_PROPERTY_KEY),
        mockEventId(5, 'alice', 'dddddddd', 1),
        'application/json',
      );
      state.mutatePropLWW(
        encodeEdgePropKey('a', 'c', 'rel', CONTENT_SIZE_PROPERTY_KEY),
        mockEventId(5, 'alice', 'dddddddd', 2),
        7,
      );
      state.mutatePropLWW(
        encodeEdgePropKey('a', 'c', 'rel', 'stale'),
        mockEventId(1, 'alice', 'aaaaaaaa', 0),
        'ignore-me',
      );

      const reader = createStateReader(state);

      expect(reader.hasNode('a')).toBe(true);
      expect(reader.hasNode('b')).toBe(false);
      expect(reader.getNodes()).toEqual(['a', 'c', 'd']);
      expect(reader.getNodeProps('a')).toEqual({
        name: createInlineValue('Alice'),
        [CONTENT_PROPERTY_KEY]: 'oid:node',
        [CONTENT_MIME_PROPERTY_KEY]: 'text/plain',
        [CONTENT_SIZE_PROPERTY_KEY]: 12,
      });
      expect(reader.getEdgeProps('a', 'c', 'rel')).toEqual({
        since: 2026,
        [CONTENT_PROPERTY_KEY]: 'oid:edge',
        [CONTENT_MIME_PROPERTY_KEY]: 'application/json',
        [CONTENT_SIZE_PROPERTY_KEY]: 7,
      });
      expect(reader.neighbors('a')).toEqual([
        { nodeId: 'c', label: 'rel', direction: 'outgoing' },
        { nodeId: 'd', label: 'back', direction: 'incoming' },
      ]);
      expect(reader.getNodeContentMeta('a')).toEqual({
        oid: 'oid:node',
        mime: 'text/plain',
        size: 12,
      });
      expect(reader.getEdgeContentMeta('a', 'c', 'rel')).toEqual({
        oid: 'oid:edge',
        mime: 'application/json',
        size: 7,
      });
      expect(reader.inspectNode('a')).toEqual({
        nodeId: 'a',
        props: {
          name: createInlineValue('Alice'),
          [CONTENT_PROPERTY_KEY]: 'oid:node',
          [CONTENT_MIME_PROPERTY_KEY]: 'text/plain',
          [CONTENT_SIZE_PROPERTY_KEY]: 12,
        },
        outgoing: [{ nodeId: 'c', label: 'rel', direction: 'outgoing' }],
        incoming: [{ nodeId: 'd', label: 'back', direction: 'incoming' }],
        content: {
          oid: 'oid:node',
          mime: 'text/plain',
          size: 12,
        },
      });
      expect(reader.inspectNode('b')).toBeNull();
      expect(reader.project()).toEqual(projectState(state));
    });
  });

  describe('computeStateHash', () => {
    it('returns 64-char hex string (SHA-256)', async () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      const hash = await computeStateHash(state, { crypto, codec: defaultCodec });

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

      expect(await computeStateHash(state1, { crypto, codec: defaultCodec })).toBe(await computeStateHash(state2, { crypto, codec: defaultCodec }));
    });

    it('produces different hashes for different states', async () => {
      const state1 = buildStateV5({
        nodes: [{ nodeId: 'a' }],
      });

      const state2 = buildStateV5({
        nodes: [{ nodeId: 'b' }],
      });

      expect(await computeStateHash(state1, { crypto, codec: defaultCodec })).not.toBe(await computeStateHash(state2, { crypto, codec: defaultCodec }));
    });

    it('empty state has consistent hash', async () => {
      const state = createEmptyState();
      const hash1 = await computeStateHash(state, { crypto, codec: defaultCodec });
      const hash2 = await computeStateHash(state, { crypto, codec: defaultCodec });

      expect(hash1).toBe(hash2);
    });
  });

  describe('deserializeState', () => {
    it('roundtrips with serializeState', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'b', key: 'age', value: createInlineValue(30) },
        ],
      });

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

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

      const bytes = serializeState(state, { codec: defaultCodec });
      const result = deserializeState((bytes as any), { codec: defaultCodec });

      const firstProp = result.props[0];
      expect(firstProp).toBeDefined();
      expect(firstProp?.value).toEqual(complexValue);
    });
  });

  describe('determinism (CRITICAL WARP invariant)', () => {
    it('ORSet add-remove semantics produce consistent hash', async () => {
      // State 1: Add node, then another writer removes it
      const state1 = createEmptyState();
      state1.nodeAlive.add('a', mockDot('alice', 1));
      const observedDots1 = new Set(state1.nodeAlive.entries.get('a'));
      state1.nodeAlive.remove(observedDots1);

      // State 2: Same operations via different writer IDs (same result)
      const state2 = createEmptyState();
      state2.nodeAlive.add('a', mockDot('bob', 1));
      const observedDots2 = new Set(state2.nodeAlive.entries.get('a'));
      state2.nodeAlive.remove(observedDots2);

      // Both should have empty visible state (node removed)
      expect(await computeStateHash(state1, { crypto, codec: defaultCodec })).toBe(await computeStateHash(state2, { crypto, codec: defaultCodec }));
    });

    it('concurrent add after remove wins correctly', async () => {
      // State where a concurrent add survives a remove
      const state1 = createEmptyState();

      // Add by Alice
      state1.nodeAlive.add('n', mockDot('alice', 1));
      // Bob observed Alice's add and removes
      const observedDots = new Set(state1.nodeAlive.entries.get('n'));
      state1.nodeAlive.remove(observedDots);
      // Concurrent add by Carol (not observed by Bob's remove)
      state1.nodeAlive.add('n', mockDot('carol', 1));

      // State 2: Same final result via different order
      const state2 = createEmptyState();
      state2.nodeAlive.add('n', mockDot('carol', 1));

      // Both should show 'n' as visible
      expect(nodeVisible(state1, 'n')).toBe(true);
      expect(nodeVisible(state2, 'n')).toBe(true);
      expect(await computeStateHash(state1, { crypto, codec: defaultCodec })).toBe(await computeStateHash(state2, { crypto, codec: defaultCodec }));
    });

    it('different insertion orders produce same hash when final state is same', async () => {
      // Build states with nodes added in different orders
      const state1 = createEmptyState();
      state1.nodeAlive.add('zebra', mockDot('w1', 1));
      state1.nodeAlive.add('apple', mockDot('w1', 2));
      state1.nodeAlive.add('mango', mockDot('w1', 3));

      const state2 = createEmptyState();
      state2.nodeAlive.add('apple', mockDot('w2', 1));
      state2.nodeAlive.add('mango', mockDot('w2', 2));
      state2.nodeAlive.add('zebra', mockDot('w2', 3));

      expect(await computeStateHash(state1, { crypto, codec: defaultCodec })).toBe(await computeStateHash(state2, { crypto, codec: defaultCodec }));
    });
  });

  describe('compareVisibleState', () => {
    it('reports visible node, edge, property, and target-local deltas without exposing reducer internals', () => {
      const left = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }, { nodeId: 'd' }],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [
          { nodeId: 'a', key: 'status', value: 'base' },
          { nodeId: 'd', key: 'kind', value: 'legacy' },
        ],
      });
      left.mutatePropLWW(
        encodeEdgePropKey('a', 'b', 'knows', 'weight'),
        mockEventId(2),
        1,
      );

      const right = buildStateV5({
        nodes: [{ nodeId: 'a' }, { nodeId: 'b' }, { nodeId: 'c' }],
        edges: [
          { from: 'a', to: 'b', label: 'knows' },
          { from: 'a', to: 'c', label: 'follows' },
        ],
        props: [
          { nodeId: 'a', key: 'status', value: 'overlay' },
          { nodeId: 'c', key: 'kind', value: 'new' },
        ],
      });
      right.mutatePropLWW(
        encodeEdgePropKey('a', 'b', 'knows', 'weight'),
        mockEventId(3),
        2,
      );
      right.mutatePropLWW(
        encodeEdgePropKey('a', 'c', 'follows', 'rank'),
        mockEventId(4),
        1,
      );

      const comparison = compareVisibleState(left, right, { targetId: 'a' });

      expect(comparison.changed).toBe(true);
      expect(comparison.summary).toEqual({
        left: {
          nodeCount: 3,
          edgeCount: 1,
          nodePropertyCount: 2,
          edgePropertyCount: 1,
        },
        right: {
          nodeCount: 3,
          edgeCount: 2,
          nodePropertyCount: 2,
          edgePropertyCount: 2,
        },
        nodes: {
          added: 1,
          removed: 1,
        },
        edges: {
          added: 1,
          removed: 0,
        },
        nodeProperties: {
          added: 1,
          removed: 1,
          changed: 1,
        },
        edgeProperties: {
          added: 1,
          removed: 0,
          changed: 1,
        },
      });
      expect(comparison.nodes).toEqual({
        added: ['c'],
        removed: ['d'],
      });
      expect(comparison.edges).toEqual({
        added: [{ from: 'a', to: 'c', label: 'follows' }],
        removed: [],
      });
      expect(comparison.nodeProperties).toEqual({
        added: [{ node: 'c', key: 'kind', value: 'new' }],
        removed: [{ node: 'd', key: 'kind', value: 'legacy' }],
        changed: [{ node: 'a', key: 'status', leftValue: 'base', rightValue: 'overlay' }],
      });
      expect(comparison.edgeProperties).toEqual({
        added: [{ from: 'a', to: 'c', label: 'follows', key: 'rank', value: 1 }],
        removed: [],
        changed: [{ from: 'a', to: 'b', label: 'knows', key: 'weight', leftValue: 1, rightValue: 2 }],
      });
      expect(comparison.target).toEqual({
        targetId: 'a',
        leftExists: true,
        rightExists: true,
        changed: true,
        left: {
          nodeId: 'a',
          props: { status: 'base' },
          outgoing: [{ nodeId: 'b', label: 'knows', direction: 'outgoing' }],
          incoming: [],
          content: null,
        },
        right: {
          nodeId: 'a',
          props: { status: 'overlay' },
          outgoing: [
            { nodeId: 'b', label: 'knows', direction: 'outgoing' },
            { nodeId: 'c', label: 'follows', direction: 'outgoing' },
          ],
          incoming: [],
          content: null,
        },
        propertyDelta: {
          added: [],
          removed: [],
          changed: [{ key: 'status', leftValue: 'base', rightValue: 'overlay' }],
        },
        outgoingDelta: {
          added: [{ nodeId: 'c', label: 'follows', direction: 'outgoing' }],
          removed: [],
        },
        incomingDelta: {
          added: [],
          removed: [],
        },
        contentChanged: false,
      });
    });
  });
});
