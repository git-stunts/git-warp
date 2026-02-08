import defaultCodec from '../utils/defaultCodec.js';
import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey, decodePropKey } from './KeyCodec.js';

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
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
 * @returns {Buffer}
 */
export function serializeStateV5(state, { codec } = {}) {
  const c = codec || defaultCodec;
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
  return c.encode({ nodes, edges: visibleEdges, props: visibleProps });
}

/**
 * Computes SHA-256 hash of canonical state bytes.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {Object} [options] - Options
 * @param {import('../../ports/CryptoPort.js').default} options.crypto - CryptoPort instance
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
 * @returns {Promise<string|null>} Hex-encoded SHA-256 hash, or null if no crypto
 */
export async function computeStateHashV5(state, { crypto, codec } = {}) {
  const serialized = serializeStateV5(state, { codec });
  return crypto ? await crypto.hash('sha256', serialized) : null;
}

/**
 * Deserializes state from CBOR bytes.
 * Note: This reconstructs the visible projection only.
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for deserialization
 * @returns {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props: Array<{node: string, key: string, value: *}>}}
 */
export function deserializeStateV5(buffer, { codec } = {}) {
  const c = codec || defaultCodec;
  return c.decode(buffer);
}

// ============================================================================
// Full State Serialization (for BTR replay)
// ============================================================================

// Re-export from CheckpointSerializerV5 for compatibility.
// Both BTR and Checkpoint use the same canonical full-state format.
export {
  serializeFullStateV5,
  deserializeFullStateV5,
} from './CheckpointSerializerV5.js';
