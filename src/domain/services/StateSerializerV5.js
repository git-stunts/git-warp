import { createHash } from 'crypto';
import { encode, decode } from '../../infrastructure/codecs/CborCodec.js';
import { orsetContains, orsetElements, orsetSerialize, orsetDeserialize, createORSet } from '../crdt/ORSet.js';
import { vvSerialize, vvDeserialize, createVersionVector } from '../crdt/VersionVector.js';
import { decodeEdgeKey, decodePropKey } from './JoinReducer.js';

/**
 * State Serialization and Hashing for WARP v5
 *
 * Provides visibility predicates for determining what is visible in the graph,
 * canonical state serialization for deterministic hashing, and state hash computation.
 *
 * V5 uses ORSet-based state (rather than LWW registers for nodeAlive/edgeAlive).
 *
 * @module StateSerializerV5
 * @see WARP Spec Section 8.3 (Visibility)
 * @see WARP Spec Section 10.3 (Canonical Serialization)
 */

// ============================================================================
// Visibility Predicates (WARP spec Section 8.3)
// ============================================================================

/**
 * Checks if a node is visible (present in the ORSet).
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} nodeId
 * @returns {boolean}
 */
export function nodeVisibleV5(state, nodeId) {
  return orsetContains(state.nodeAlive, nodeId);
}

/**
 * Checks if an edge is visible.
 * Edge is visible if: edge is in ORSet AND both endpoints are visible.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} edgeKey - Encoded edge key
 * @returns {boolean}
 */
export function edgeVisibleV5(state, edgeKey) {
  if (!orsetContains(state.edgeAlive, edgeKey)) {
    return false;
  }
  const { from, to } = decodeEdgeKey(edgeKey);
  return nodeVisibleV5(state, from) && nodeVisibleV5(state, to);
}

/**
 * Checks if a property is visible.
 * Property is visible if: node is visible AND prop exists.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} propKey - Encoded prop key
 * @returns {boolean}
 */
export function propVisibleV5(state, propKey) {
  const { nodeId } = decodePropKey(propKey);
  if (!nodeVisibleV5(state, nodeId)) {
    return false;
  }
  return state.prop.has(propKey);
}

// ============================================================================
// Canonical State Serialization (WARP spec Section 10.3)
// ============================================================================

/**
 * Serializes state to canonical CBOR bytes.
 * Only includes VISIBLE projection with stable ordering:
 * 1. Nodes sorted by NodeId
 * 2. Edges sorted by (from, to, label)
 * 3. Props sorted by (node, key)
 *
 * Same canonical ordering as v4 for visible projection.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {Buffer}
 */
export function serializeStateV5(state) {
  // 1. Collect visible nodes, sorted
  const nodes = [...orsetElements(state.nodeAlive)].sort();

  // 2. Collect visible edges (both endpoints visible), sorted by (from, to, label)
  const visibleEdges = [];
  for (const edgeKey of orsetElements(state.edgeAlive)) {
    if (edgeVisibleV5(state, edgeKey)) {
      visibleEdges.push(decodeEdgeKey(edgeKey));
    }
  }
  visibleEdges.sort((a, b) => {
    if (a.from !== b.from) {
      return a.from < b.from ? -1 : 1;
    }
    if (a.to !== b.to) {
      return a.to < b.to ? -1 : 1;
    }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  // 3. Collect visible props (node visible), sorted by (node, key)
  const visibleProps = [];
  for (const [propKey, register] of state.prop) {
    const { nodeId, propKey: key } = decodePropKey(propKey);
    if (nodeVisibleV5(state, nodeId)) {
      visibleProps.push({ node: nodeId, key, value: register.value });
    }
  }
  visibleProps.sort((a, b) => {
    if (a.node !== b.node) {
      return a.node < b.node ? -1 : 1;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  // Encode as canonical CBOR
  return encode({ nodes, edges: visibleEdges, props: visibleProps });
}

/**
 * Computes SHA-256 hash of canonical state bytes.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function computeStateHashV5(state) {
  const serialized = serializeStateV5(state);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Deserializes state from CBOR bytes.
 * Note: This reconstructs the visible projection only.
 * @param {Buffer} buffer
 * @returns {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props: Array<{node: string, key: string, value: *}>}}
 */
export function deserializeStateV5(buffer) {
  return decode(buffer);
}

// ============================================================================
// Full State Serialization (for BTR replay)
// ============================================================================

/**
 * Serializes complete WarpStateV5 to CBOR bytes.
 * Unlike serializeStateV5, this includes the full CRDT internals:
 * - ORSet entries and tombstones for nodeAlive/edgeAlive
 * - Full LWW registers for props
 * - Full version vector for observedFrontier
 * - Edge birth events for clean-slate prop visibility
 *
 * Used for BTR creation where exact state reconstruction is required.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {Buffer}
 */
export function serializeFullStateV5(state) {
  // Serialize ORSets with full internal structure
  const nodeAliveSer = orsetSerialize(state.nodeAlive);
  const edgeAliveSer = orsetSerialize(state.edgeAlive);

  // Serialize props with full LWW register data
  const propsSer = [];
  const sortedPropKeys = [...state.prop.keys()].sort();
  for (const propKey of sortedPropKeys) {
    const register = state.prop.get(propKey);
    propsSer.push([propKey, register]);
  }

  // Serialize version vector
  const frontierSer = vvSerialize(state.observedFrontier);

  // Serialize edge birth events
  const edgeBirthSer = [];
  if (state.edgeBirthEvent) {
    const sortedEdgeKeys = [...state.edgeBirthEvent.keys()].sort();
    for (const edgeKey of sortedEdgeKeys) {
      edgeBirthSer.push([edgeKey, state.edgeBirthEvent.get(edgeKey)]);
    }
  }

  return encode({
    version: 'full-v5',
    nodeAlive: nodeAliveSer,
    edgeAlive: edgeAliveSer,
    props: propsSer,
    observedFrontier: frontierSer,
    edgeBirthEvent: edgeBirthSer,
  });
}

/**
 * Deserializes complete WarpStateV5 from CBOR bytes.
 * Reconstructs the full CRDT state including ORSet internals.
 *
 * @param {Buffer} buffer
 * @returns {import('./JoinReducer.js').WarpStateV5}
 */
export function deserializeFullStateV5(buffer) {
  const obj = decode(buffer);

  // Handle legacy or empty states
  if (!obj || obj.version !== 'full-v5') {
    // Return empty state for non-full serializations
    return {
      nodeAlive: createORSet(),
      edgeAlive: createORSet(),
      prop: new Map(),
      observedFrontier: createVersionVector(),
      edgeBirthEvent: new Map(),
    };
  }

  // Deserialize ORSets
  const nodeAlive = orsetDeserialize(obj.nodeAlive || {});
  const edgeAlive = orsetDeserialize(obj.edgeAlive || {});

  // Deserialize props
  const prop = new Map();
  if (obj.props && Array.isArray(obj.props)) {
    for (const [propKey, register] of obj.props) {
      prop.set(propKey, register);
    }
  }

  // Deserialize version vector
  const observedFrontier = obj.observedFrontier
    ? vvDeserialize(obj.observedFrontier)
    : createVersionVector();

  // Deserialize edge birth events
  const edgeBirthEvent = new Map();
  if (obj.edgeBirthEvent && Array.isArray(obj.edgeBirthEvent)) {
    for (const [edgeKey, eventId] of obj.edgeBirthEvent) {
      edgeBirthEvent.set(edgeKey, eventId);
    }
  }

  return {
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier,
    edgeBirthEvent,
  };
}
