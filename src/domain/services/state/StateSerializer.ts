import defaultCodec from '../../utils/defaultCodec.ts';
import defaultCrypto from '../../utils/defaultCrypto.ts';
import { decodeEdgeKey, decodePropKey } from '../KeyCodec.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type { WarpState } from '../JoinReducer.ts';

/**
 * State Serialization and Hashing for WARP v5
 *
 * Provides visibility predicates for determining what is visible in the graph,
 * canonical state serialization for deterministic hashing, and state hash computation.
 *
 * V5 uses ORSet-based state (rather than LWW registers for nodeAlive/edgeAlive).
 *
 * @module StateSerializer
 * @see WARP Spec Section 8.3 (Visibility)
 * @see WARP Spec Section 10.3 (Canonical Serialization)
 */

// ============================================================================
// Visibility Predicates (WARP spec Section 8.3)
// ============================================================================

/**
 * Checks if a node is visible (present in the ORSet).
 */
export function nodeVisibleV5(state: WarpState, nodeId: string): boolean {
  return state.nodeAlive.contains(nodeId);
}

/**
 * Checks if an edge is visible.
 * Edge is visible if: edge is in ORSet AND both endpoints are visible.
 */
export function edgeVisible(state: WarpState, edgeKey: string): boolean {
  if (!state.edgeAlive.contains(edgeKey)) { return false; }
  const { from, to } = decodeEdgeKey(edgeKey);
  return nodeVisibleV5(state, from) && nodeVisibleV5(state, to);
}

/**
 * Checks if a property is visible.
 * Property is visible if: node is visible AND prop exists.
 */
export function propVisibleV5(state: WarpState, propKey: string): boolean {
  const { nodeId } = decodePropKey(propKey);
  if (!nodeVisibleV5(state, nodeId)) { return false; }
  return state.prop.has(propKey);
}

// ============================================================================
// Canonical State Serialization (WARP spec Section 10.3)
// ============================================================================

export interface StateProjection {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>;
}

/**
 * Serializes state to canonical CBOR bytes.
 * Only includes VISIBLE projection with stable ordering.
 */
export function serializeStateV5(state: WarpState, { codec }: { codec?: CodecPort } = {}): Uint8Array {
  const projection = projectState(state);
  return (codec ?? defaultCodec).encode(projection);
}

/**
 * Projects a materialized V5 state into its visible graph projection.
 */
export function projectState(state: WarpState): StateProjection {
  const nodes = [...state.nodeAlive.elements()].sort();

  const visibleEdges: Array<{ from: string; to: string; label: string }> = [];
  for (const edgeKey of state.edgeAlive.elements()) {
    if (edgeVisible(state, edgeKey)) {
      visibleEdges.push(decodeEdgeKey(edgeKey));
    }
  }
  visibleEdges.sort((a, b) => {
    if (a.from !== b.from) { return a.from < b.from ? -1 : 1; }
    if (a.to !== b.to) { return a.to < b.to ? -1 : 1; }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  const visibleProps: Array<{ node: string; key: string; value: unknown }> = [];
  for (const [propKey, register] of state.prop) {
    const { nodeId, propKey: key } = decodePropKey(propKey);
    if (nodeVisibleV5(state, nodeId)) {
      visibleProps.push({ node: nodeId, key, value: register.value });
    }
  }
  visibleProps.sort((a, b) => {
    if (a.node !== b.node) { return a.node < b.node ? -1 : 1; }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return { nodes, edges: visibleEdges, props: visibleProps };
}

interface StateHashOptions {
  crypto?: CryptoPort;
  codec?: CodecPort;
}

/**
 * Computes SHA-256 hash of canonical state bytes.
 */
export async function computeStateHash(state: WarpState, { crypto, codec }: StateHashOptions = {}): Promise<string> {
  const c = crypto ?? defaultCrypto;
  const serialized = serializeStateV5(state, codec ? { codec } : {});
  return await c.hash('sha256', serialized);
}

/**
 * Deserializes state from CBOR bytes.
 * Note: This reconstructs the visible projection only.
 */
export function deserializeStateV5(buffer: Uint8Array, { codec }: { codec?: CodecPort } = {}): StateProjection {
  const c = codec ?? defaultCodec;
  return c.decode(buffer);
}

// ============================================================================
// Full State Serialization (for BTR replay)
// ============================================================================

// Re-export from CheckpointSerializer for compatibility.
// Both BTR and Checkpoint use the same canonical full-state format.
export {
  serializeFullState,
  deserializeFullState,
} from './CheckpointSerializer.ts';
