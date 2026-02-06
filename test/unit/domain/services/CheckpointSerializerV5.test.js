import { describe, it, expect } from 'vitest';
import {
  serializeFullStateV5,
  deserializeFullStateV5,
  computeAppliedVV,
  serializeAppliedVV,
  deserializeAppliedVV,
} from '../../../../src/domain/services/CheckpointSerializerV5.js';
import { encode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import {
  createEmptyStateV5,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.js';
import { createORSet, orsetAdd, orsetRemove } from '../../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwSet } from '../../../../src/domain/crdt/LWW.js';

/**
 * Helper to create a mock EventId for testing.
 */
function mockEventId(lamport = 1, writerId = 'test', patchSha = 'abcd1234', opIndex = 0) {
  return createEventId(lamport, writerId, patchSha, opIndex);
}

/**
 * Helper to build a V5 state with specific nodes, edges, and props.
 */
function buildStateV5({ nodes = [], edges = [], props = [], tombstoneDots = [] }) {
  const state = createEmptyStateV5();

  // Add nodes with their dots
  for (const { nodeId, writerId, counter } of nodes) {
    const dot = createDot(writerId, counter);
    orsetAdd(state.nodeAlive, nodeId, dot);
  }

  // Add edges with their dots
  for (const { from, to, label, writerId, counter } of edges) {
    const dot = createDot(writerId, counter);
    const edgeKey = encodeEdgeKey(from, to, label);
    orsetAdd(state.edgeAlive, edgeKey, dot);
  }

  // Add props with LWW registers
  for (const { nodeId, key, value, eventId } of props) {
    const propKey = encodePropKey(nodeId, key);
    state.prop.set(propKey, lwwSet(eventId ?? mockEventId(), value));
  }

  // Add tombstones (encoded dots)
  for (const encodedDot of tombstoneDots) {
    state.nodeAlive.tombstones.add(encodedDot);
  }

  return state;
}

describe('CheckpointSerializerV5', () => {
  describe('serializeFullStateV5 / deserializeFullStateV5', () => {
    it('returns empty state when buffer is null', () => {
      const restored = deserializeFullStateV5(null);

      expect(restored.nodeAlive.entries.size).toBe(0);
      expect(restored.edgeAlive.entries.size).toBe(0);
      expect(restored.prop.size).toBe(0);
      expect(restored.observedFrontier.size).toBe(0);
      expect(restored.edgeBirthEvent.size).toBe(0);
    });

    it('returns empty state when buffer is undefined', () => {
      const restored = deserializeFullStateV5(undefined);

      expect(restored.nodeAlive.entries.size).toBe(0);
      expect(restored.edgeAlive.entries.size).toBe(0);
      expect(restored.prop.size).toBe(0);
      expect(restored.observedFrontier.size).toBe(0);
      expect(restored.edgeBirthEvent.size).toBe(0);
    });

    it('handles buffer with missing nodeAlive and edgeAlive fields', () => {
      // Craft a CBOR buffer where nodeAlive and edgeAlive are absent
      const buffer = encode({ version: 'full-v5', prop: [], observedFrontier: {} });
      const restored = deserializeFullStateV5(buffer);

      expect(restored.nodeAlive.entries.size).toBe(0);
      expect(restored.edgeAlive.entries.size).toBe(0);
      expect(restored.prop.size).toBe(0);
      expect(restored.observedFrontier.size).toBe(0);
      expect(restored.edgeBirthEvent.size).toBe(0);
    });

    it('throws on unsupported version', () => {
      const buffer = encode({ version: 'full-v6' });
      expect(() => deserializeFullStateV5(buffer)).toThrow(/Unsupported full state version/);
    });

    it('round-trips empty state', () => {
      const state = createEmptyStateV5();

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      expect(restored.nodeAlive.entries.size).toBe(0);
      expect(restored.nodeAlive.tombstones.size).toBe(0);
      expect(restored.edgeAlive.entries.size).toBe(0);
      expect(restored.edgeAlive.tombstones.size).toBe(0);
      expect(restored.prop.size).toBe(0);
      expect(restored.observedFrontier.size).toBe(0);
    });

    it('round-trips state with nodes', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 1 },
          { nodeId: 'b', writerId: 'bob', counter: 2 },
        ],
      });

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      // Check nodeAlive entries
      expect(restored.nodeAlive.entries.size).toBe(2);
      expect(restored.nodeAlive.entries.has('a')).toBe(true);
      expect(restored.nodeAlive.entries.has('b')).toBe(true);

      // Check the dots are preserved
      const aDots = restored.nodeAlive.entries.get('a');
      expect(aDots.has('alice:1')).toBe(true);

      const bDots = restored.nodeAlive.entries.get('b');
      expect(bDots.has('bob:2')).toBe(true);
    });

    it('round-trips state with edges', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 1 },
          { nodeId: 'b', writerId: 'alice', counter: 2 },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', writerId: 'alice', counter: 3 }],
      });

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      // Check edgeAlive entries
      expect(restored.edgeAlive.entries.size).toBe(1);
      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(restored.edgeAlive.entries.has(edgeKey)).toBe(true);

      const edgeDots = restored.edgeAlive.entries.get(edgeKey);
      expect(edgeDots.has('alice:3')).toBe(true);
    });

    it('round-trips state with props', () => {
      const eventId = mockEventId(5, 'alice', 'deadbeef', 0);
      const state = buildStateV5({
        nodes: [{ nodeId: 'a', writerId: 'alice', counter: 1 }],
        props: [{ nodeId: 'a', key: 'name', value: 'Alice', eventId }],
      });

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      // Check props
      const propKey = encodePropKey('a', 'name');
      expect(restored.prop.has(propKey)).toBe(true);

      const register = restored.prop.get(propKey);
      expect(register.value).toBe('Alice');
      expect(register.eventId.lamport).toBe(5);
      expect(register.eventId.writerId).toBe('alice');
      expect(register.eventId.patchSha).toBe('deadbeef');
      expect(register.eventId.opIndex).toBe(0);
    });

    it('round-trips state with tombstones', () => {
      const state = buildStateV5({
        nodes: [{ nodeId: 'a', writerId: 'alice', counter: 1 }],
        tombstoneDots: ['alice:1'],
      });

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      // Check tombstones are preserved
      expect(restored.nodeAlive.tombstones.size).toBe(1);
      expect(restored.nodeAlive.tombstones.has('alice:1')).toBe(true);
    });

    it('round-trips state with observedFrontier', () => {
      const state = createEmptyStateV5();
      state.observedFrontier.set('alice', 5);
      state.observedFrontier.set('bob', 3);

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      expect(restored.observedFrontier.size).toBe(2);
      expect(restored.observedFrontier.get('alice')).toBe(5);
      expect(restored.observedFrontier.get('bob')).toBe(3);
    });

    it('round-trips state with edgeBirthEvent', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 1 },
          { nodeId: 'b', writerId: 'alice', counter: 2 },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', writerId: 'alice', counter: 3 }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      const birthEventId = mockEventId(3, 'alice', 'deadbeef', 0);
      state.edgeBirthEvent.set(edgeKey, birthEventId);

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      expect(restored.edgeBirthEvent.size).toBe(1);
      const restoredEvent = restored.edgeBirthEvent.get(edgeKey);
      expect(restoredEvent.lamport).toBe(3);
      expect(restoredEvent.writerId).toBe('alice');
      expect(restoredEvent.patchSha).toBe('deadbeef');
      expect(restoredEvent.opIndex).toBe(0);
    });

    it('deserializes legacy bare-lamport edgeBirthEvent format', () => {
      // Legacy checkpoints stored edgeBirthEvent as [edgeKey, lamportNumber] pairs
      const edgeKey = encodeEdgeKey('x', 'y', 'link');
      const buffer = encode({
        version: 'full-v5',
        nodeAlive: {},
        edgeAlive: {},
        prop: [],
        observedFrontier: {},
        edgeBirthEvent: [[edgeKey, 42]],
      });

      const restored = deserializeFullStateV5(buffer);

      expect(restored.edgeBirthEvent.size).toBe(1);
      const event = restored.edgeBirthEvent.get(edgeKey);
      expect(event.lamport).toBe(42);
      // Legacy sentinel values
      expect(event.writerId).toBe('');
      expect(event.patchSha).toBe('0000');
      expect(event.opIndex).toBe(0);
    });

    it('round-trips complex state with all components', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'n1', writerId: 'alice', counter: 1 },
          { nodeId: 'n2', writerId: 'bob', counter: 1 },
          { nodeId: 'n3', writerId: 'alice', counter: 2 },
        ],
        edges: [
          { from: 'n1', to: 'n2', label: 'link', writerId: 'alice', counter: 3 },
          { from: 'n2', to: 'n3', label: 'ref', writerId: 'bob', counter: 2 },
        ],
        props: [
          { nodeId: 'n1', key: 'name', value: 'Node One', eventId: mockEventId(1, 'alice', 'aaaa', 0) },
          { nodeId: 'n2', key: 'count', value: 42, eventId: mockEventId(2, 'bob', 'bbbb', 0) },
        ],
        tombstoneDots: ['carol:1', 'carol:2'],
      });
      state.observedFrontier.set('alice', 10);
      state.observedFrontier.set('bob', 5);

      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      // Verify nodes
      expect(restored.nodeAlive.entries.size).toBe(3);
      expect(restored.nodeAlive.entries.get('n1').has('alice:1')).toBe(true);
      expect(restored.nodeAlive.entries.get('n2').has('bob:1')).toBe(true);
      expect(restored.nodeAlive.entries.get('n3').has('alice:2')).toBe(true);

      // Verify edges
      expect(restored.edgeAlive.entries.size).toBe(2);

      // Verify props
      expect(restored.prop.size).toBe(2);
      expect(restored.prop.get(encodePropKey('n1', 'name')).value).toBe('Node One');
      expect(restored.prop.get(encodePropKey('n2', 'count')).value).toBe(42);

      // Verify tombstones
      expect(restored.nodeAlive.tombstones.size).toBe(2);
      expect(restored.nodeAlive.tombstones.has('carol:1')).toBe(true);
      expect(restored.nodeAlive.tombstones.has('carol:2')).toBe(true);

      // Verify observedFrontier
      expect(restored.observedFrontier.get('alice')).toBe(10);
      expect(restored.observedFrontier.get('bob')).toBe(5);
    });

    it('produces identical output for same state (determinism)', () => {
      const state1 = buildStateV5({
        nodes: [
          { nodeId: 'z', writerId: 'zoe', counter: 1 },
          { nodeId: 'a', writerId: 'alice', counter: 1 },
        ],
        props: [
          { nodeId: 'z', key: 'x', value: 1, eventId: mockEventId(1, 'zoe', 'abcd1234', 0) },
          { nodeId: 'a', key: 'y', value: 2, eventId: mockEventId(1, 'alice', 'abcd5678', 0) },
        ],
      });

      const state2 = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 1 },
          { nodeId: 'z', writerId: 'zoe', counter: 1 },
        ],
        props: [
          { nodeId: 'a', key: 'y', value: 2, eventId: mockEventId(1, 'alice', 'abcd5678', 0) },
          { nodeId: 'z', key: 'x', value: 1, eventId: mockEventId(1, 'zoe', 'abcd1234', 0) },
        ],
      });

      const buffer1 = serializeFullStateV5(state1);
      const buffer2 = serializeFullStateV5(state2);

      expect(buffer1.equals(buffer2)).toBe(true);
    });
  });

  describe('computeAppliedVV', () => {
    it('returns empty map for empty state', () => {
      const state = createEmptyStateV5();

      const vv = computeAppliedVV(state);

      expect(vv.size).toBe(0);
    });

    it('extracts max counter per writer from node dots', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 1 },
          { nodeId: 'b', writerId: 'alice', counter: 5 },
          { nodeId: 'c', writerId: 'alice', counter: 3 },
          { nodeId: 'd', writerId: 'bob', counter: 2 },
        ],
      });

      const vv = computeAppliedVV(state);

      expect(vv.size).toBe(2);
      expect(vv.get('alice')).toBe(5); // max of 1, 5, 3
      expect(vv.get('bob')).toBe(2);
    });

    it('extracts max counter from edge dots', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 1 },
          { nodeId: 'b', writerId: 'alice', counter: 2 },
        ],
        edges: [
          { from: 'a', to: 'b', label: 'x', writerId: 'alice', counter: 10 },
          { from: 'a', to: 'b', label: 'y', writerId: 'bob', counter: 7 },
        ],
      });

      const vv = computeAppliedVV(state);

      expect(vv.get('alice')).toBe(10); // max from edges
      expect(vv.get('bob')).toBe(7);
    });

    it('combines node and edge dots for max counter', () => {
      const state = buildStateV5({
        nodes: [
          { nodeId: 'a', writerId: 'alice', counter: 3 },
          { nodeId: 'b', writerId: 'bob', counter: 8 },
        ],
        edges: [
          { from: 'a', to: 'b', label: 'x', writerId: 'alice', counter: 5 },
          { from: 'a', to: 'b', label: 'y', writerId: 'bob', counter: 2 },
        ],
      });

      const vv = computeAppliedVV(state);

      expect(vv.get('alice')).toBe(5); // edge counter > node counter
      expect(vv.get('bob')).toBe(8); // node counter > edge counter
    });

    it('handles multiple dots per element', () => {
      const state = createEmptyStateV5();

      // Add multiple dots to the same node (simulating concurrent adds)
      orsetAdd(state.nodeAlive, 'shared', createDot('alice', 1));
      orsetAdd(state.nodeAlive, 'shared', createDot('bob', 3));
      orsetAdd(state.nodeAlive, 'shared', createDot('alice', 7));

      const vv = computeAppliedVV(state);

      expect(vv.get('alice')).toBe(7);
      expect(vv.get('bob')).toBe(3);
    });

    it('includes dots from tombstoned elements', () => {
      // Tombstoned dots should still be counted because they represent applied operations
      const state = buildStateV5({
        nodes: [{ nodeId: 'deleted', writerId: 'alice', counter: 5 }],
        tombstoneDots: ['alice:5'],
      });

      const vv = computeAppliedVV(state);

      // The dot is in entries (even if tombstoned), so it should be counted
      expect(vv.get('alice')).toBe(5);
    });
  });

  describe('serializeAppliedVV / deserializeAppliedVV', () => {
    it('round-trips empty version vector', () => {
      const vv = new Map();

      const buffer = serializeAppliedVV(vv);
      const restored = deserializeAppliedVV(buffer);

      expect(restored.size).toBe(0);
    });

    it('round-trips version vector with entries', () => {
      const vv = new Map();
      vv.set('alice', 10);
      vv.set('bob', 5);
      vv.set('carol', 1);

      const buffer = serializeAppliedVV(vv);
      const restored = deserializeAppliedVV(buffer);

      expect(restored.size).toBe(3);
      expect(restored.get('alice')).toBe(10);
      expect(restored.get('bob')).toBe(5);
      expect(restored.get('carol')).toBe(1);
    });

    it('produces deterministic output', () => {
      const vv1 = new Map();
      vv1.set('zoe', 1);
      vv1.set('alice', 2);
      vv1.set('bob', 3);

      const vv2 = new Map();
      vv2.set('alice', 2);
      vv2.set('bob', 3);
      vv2.set('zoe', 1);

      const buffer1 = serializeAppliedVV(vv1);
      const buffer2 = serializeAppliedVV(vv2);

      expect(buffer1.equals(buffer2)).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('full checkpoint workflow: build state, serialize, deserialize, compute VV', () => {
      // 1. Build a state with various operations
      const state = buildStateV5({
        nodes: [
          { nodeId: 'user:1', writerId: 'w1', counter: 1 },
          { nodeId: 'user:2', writerId: 'w2', counter: 1 },
          { nodeId: 'post:1', writerId: 'w1', counter: 2 },
        ],
        edges: [
          { from: 'user:1', to: 'post:1', label: 'authored', writerId: 'w1', counter: 3 },
          { from: 'user:2', to: 'post:1', label: 'liked', writerId: 'w2', counter: 2 },
        ],
        props: [
          { nodeId: 'user:1', key: 'name', value: 'Alice', eventId: mockEventId(1, 'w1', 'a1a1', 0) },
          { nodeId: 'post:1', key: 'title', value: 'Hello World', eventId: mockEventId(2, 'w1', 'a2a2', 0) },
        ],
      });
      state.observedFrontier.set('w1', 3);
      state.observedFrontier.set('w2', 2);

      // 2. Serialize full state (checkpoint)
      const checkpoint = serializeFullStateV5(state);

      // 3. Deserialize (simulate resume)
      const restored = deserializeFullStateV5(checkpoint);

      // 4. Compute appliedVV from restored state
      const appliedVV = computeAppliedVV(restored);

      // 5. Verify everything matches
      expect(appliedVV.get('w1')).toBe(3);
      expect(appliedVV.get('w2')).toBe(2);

      // Verify state structure is preserved
      expect(restored.nodeAlive.entries.size).toBe(3);
      expect(restored.edgeAlive.entries.size).toBe(2);
      expect(restored.prop.size).toBe(2);
      expect(restored.observedFrontier.get('w1')).toBe(3);
      expect(restored.observedFrontier.get('w2')).toBe(2);
    });

    it('handles state with removed nodes (tombstones)', () => {
      const state = createEmptyStateV5();

      // Add a node
      const addDot = createDot('alice', 1);
      orsetAdd(state.nodeAlive, 'temp', addDot);

      // Remove the node (add to tombstones)
      orsetRemove(state.nodeAlive, new Set([encodeDot(addDot)]));

      // Serialize and restore
      const buffer = serializeFullStateV5(state);
      const restored = deserializeFullStateV5(buffer);

      // The entry should still exist (with the dot)
      expect(restored.nodeAlive.entries.has('temp')).toBe(true);
      // The tombstone should be preserved
      expect(restored.nodeAlive.tombstones.has('alice:1')).toBe(true);

      // appliedVV should still track the operation
      const vv = computeAppliedVV(restored);
      expect(vv.get('alice')).toBe(1);
    });
  });
});
