/**
 * JoinReducer - WARP v5 OR-Set based reducer
 *
 * WarpStateV5 = {
 *   nodeAlive: ORSet<NodeId>,           // GLOBAL OR-Set
 *   edgeAlive: ORSet<EdgeKey>,          // GLOBAL OR-Set
 *   prop: Map<PropKey, LWWRegister>,    // Keep v4 LWW with EventId
 *   observedFrontier: VersionVector
 * }
 */

import { createORSet, orsetAdd, orsetRemove, orsetJoin } from '../crdt/ORSet.js';
import { createVersionVector, vvMerge, vvClone, vvDeserialize } from '../crdt/VersionVector.js';
import { lwwSet, lwwMax } from '../crdt/LWW.js';
import { createEventId } from '../utils/EventId.js';

/**
 * Encodes an EdgeKey to a string for Map storage.
 * @param {string} from
 * @param {string} to
 * @param {string} label
 * @returns {string}
 */
export function encodeEdgeKey(from, to, label) {
  return `${from}\0${to}\0${label}`;
}

/**
 * Decodes an EdgeKey string back to components.
 * @param {string} key
 * @returns {{from: string, to: string, label: string}}
 */
export function decodeEdgeKey(key) {
  const [from, to, label] = key.split('\0');
  return { from, to, label };
}

/**
 * Encodes a property key for Map storage.
 * @param {string} nodeId
 * @param {string} propKey
 * @returns {string}
 */
export function encodePropKey(nodeId, propKey) {
  return `${nodeId}\0${propKey}`;
}

/**
 * Decodes a property key string.
 * @param {string} key
 * @returns {{nodeId: string, propKey: string}}
 */
export function decodePropKey(key) {
  const [nodeId, propKey] = key.split('\0');
  return { nodeId, propKey };
}

/**
 * @typedef {Object} WarpStateV5
 * @property {import('../crdt/ORSet.js').ORSet} nodeAlive - ORSet of alive nodes
 * @property {import('../crdt/ORSet.js').ORSet} edgeAlive - ORSet of alive edges
 * @property {Map<string, import('../crdt/LWW.js').LWWRegister>} prop - Properties with LWW
 * @property {import('../crdt/VersionVector.js').VersionVector} observedFrontier - Observed version vector
 */

/**
 * Creates an empty V5 state.
 * @returns {WarpStateV5}
 */
export function createEmptyStateV5() {
  return {
    nodeAlive: createORSet(),
    edgeAlive: createORSet(),
    prop: new Map(),
    observedFrontier: createVersionVector(),
  };
}

/**
 * Applies a single V2 operation to state.
 * Mutates state in place.
 *
 * @param {WarpStateV5} state
 * @param {Object} op - The operation to apply
 * @param {import('../utils/EventId.js').EventId} eventId
 */
export function applyOpV2(state, op, eventId) {
  switch (op.type) {
    case 'NodeAdd':
      orsetAdd(state.nodeAlive, op.node, op.dot);
      break;
    case 'NodeRemove':
      orsetRemove(state.nodeAlive, op.observedDots);
      break;
    case 'EdgeAdd':
      orsetAdd(state.edgeAlive, encodeEdgeKey(op.from, op.to, op.label), op.dot);
      break;
    case 'EdgeRemove':
      orsetRemove(state.edgeAlive, op.observedDots);
      break;
    case 'PropSet': {
      // Uses EventId-based LWW, same as v4
      const key = encodePropKey(op.node, op.key);
      const current = state.prop.get(key);
      state.prop.set(key, lwwMax(current, lwwSet(eventId, op.value)));
      break;
    }
  }
}

/**
 * Joins a patch into state.
 * Mutates state in place.
 *
 * @param {WarpStateV5} state
 * @param {Object} patch - The patch to apply
 * @param {string} patchSha - The SHA of the patch commit
 * @returns {WarpStateV5}
 */
export function join(state, patch, patchSha) {
  for (let i = 0; i < patch.ops.length; i++) {
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
    applyOpV2(state, patch.ops[i], eventId);
  }
  // Handle both Map (in-memory) and plain object (from CBOR deserialization)
  const contextVV = patch.context instanceof Map
    ? patch.context
    : vvDeserialize(patch.context);
  state.observedFrontier = vvMerge(state.observedFrontier, contextVV);
  return state;
}

/**
 * Joins two V5 states together.
 * Returns a new state; does not mutate inputs.
 *
 * @param {WarpStateV5} a
 * @param {WarpStateV5} b
 * @returns {WarpStateV5}
 */
export function joinStates(a, b) {
  return {
    nodeAlive: orsetJoin(a.nodeAlive, b.nodeAlive),
    edgeAlive: orsetJoin(a.edgeAlive, b.edgeAlive),
    prop: mergeProps(a.prop, b.prop),
    observedFrontier: vvMerge(a.observedFrontier, b.observedFrontier),
  };
}

/**
 * Helper to merge two prop maps using lwwMax per key.
 *
 * @param {Map<string, import('../crdt/LWW.js').LWWRegister>} a
 * @param {Map<string, import('../crdt/LWW.js').LWWRegister>} b
 * @returns {Map<string, import('../crdt/LWW.js').LWWRegister>}
 */
function mergeProps(a, b) {
  const result = new Map(a);

  for (const [key, regB] of b) {
    const regA = result.get(key);
    result.set(key, lwwMax(regA, regB));
  }

  return result;
}

/**
 * Reduces patches to a V5 state.
 *
 * @param {Array<{patch: Object, sha: string}>} patches
 * @param {WarpStateV5} [initialState] - Optional starting state (for incremental)
 * @returns {WarpStateV5}
 */
export function reduceV5(patches, initialState) {
  const state = initialState ? cloneStateV5(initialState) : createEmptyStateV5();
  for (const { patch, sha } of patches) {
    join(state, patch, sha);
  }
  return state;
}

/**
 * Deep clones a V5 state.
 *
 * @param {WarpStateV5} state
 * @returns {WarpStateV5}
 */
export function cloneStateV5(state) {
  return {
    nodeAlive: orsetJoin(state.nodeAlive, createORSet()),
    edgeAlive: orsetJoin(state.edgeAlive, createORSet()),
    prop: new Map(state.prop),
    observedFrontier: vvClone(state.observedFrontier),
  };
}
