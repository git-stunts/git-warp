/**
 * WARP OpV2/PatchV2 Types and Schema
 *
 * Pure type definitions using JSDoc for IDE autocomplete and documentation.
 * Factory functions for creating WARP v5 operations and patches.
 *
 * Key differences from V1:
 * - Add operations carry dots (causal identifiers)
 * - Remove operations carry observedDots (set of dots being removed)
 * - PropSet uses EventId for identification (no dot field)
 * - PatchV2 includes context (VersionVector) for writer's observed frontier
 *
 * @module WarpTypesV2
 * @see WARP v5 Spec
 */

import PatchV2 from './PatchV2.js';

// Re-export PatchV2 class for consumers that import from this module.
export { PatchV2 };

// ============================================================================
// Primitive Types
// ============================================================================

/**
 * String identifier for nodes (e.g., "user:alice", UUID)
 * @typedef {string} NodeId
 */

/**
 * Dot - causal identifier for an add operation
 * @typedef {import('../crdt/Dot.js').Dot} Dot
 */

// ============================================================================
// Operations (OpV2)
// ============================================================================

/**
 * Node add operation - creates a new node with a dot
 * @typedef {Object} OpV2NodeAdd
 * @property {'NodeAdd'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to add
 * @property {Dot} dot - Causal identifier for this add
 */

/**
 * Node remove operation - removes a node by observed dots
 * @typedef {Object} OpV2NodeRemove
 * @property {'NodeRemove'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to remove
 * @property {string[]} observedDots - Encoded dot strings being removed (add events observed)
 */

/**
 * Edge add operation - creates a new edge with a dot
 * @typedef {Object} OpV2EdgeAdd
 * @property {'EdgeAdd'} type - Operation type discriminator
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label/type
 * @property {Dot} dot - Causal identifier for this add
 */

/**
 * Edge remove operation - removes an edge by observed dots
 * @typedef {Object} OpV2EdgeRemove
 * @property {'EdgeRemove'} type - Operation type discriminator
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label/type
 * @property {string[]} observedDots - Encoded dot strings being removed (add events observed)
 */

/**
 * Property set operation - sets a property value on a node (raw/persisted form).
 * Uses EventId for identification (derived from patch context).
 *
 * In raw patches, edge properties are also encoded as PropSet with the node
 * field carrying a \x01-prefixed edge identity. See {@link OpV2NodePropSet}
 * and {@link OpV2EdgePropSet} for the canonical (internal) representations.
 *
 * @typedef {Object} OpV2PropSet
 * @property {'PropSet'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to set property on (may contain \x01 prefix for edge props)
 * @property {string} key - Property key
 * @property {unknown} value - Property value (any JSON-serializable type)
 */

/**
 * Canonical node property set operation (internal only — never persisted).
 * @typedef {Object} OpV2NodePropSet
 * @property {'NodePropSet'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to set property on
 * @property {string} key - Property key
 * @property {unknown} value - Property value (any JSON-serializable type)
 */

/**
 * Canonical edge property set operation (internal only — never persisted).
 * @typedef {Object} OpV2EdgePropSet
 * @property {'EdgePropSet'} type - Operation type discriminator
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label
 * @property {string} key - Property key
 * @property {unknown} value - Property value (any JSON-serializable type)
 */

/**
 * Blob value reference operation.
 * @typedef {Object} OpV2BlobValue
 * @property {'BlobValue'} type - Operation type discriminator
 * @property {string} node - Node ID the blob is attached to
 * @property {string} oid - Blob object ID in the Git object store
 */

/**
 * Union of all raw (persisted) v2 operation types.
 * @typedef {OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2PropSet | OpV2BlobValue} RawOpV2
 */

/**
 * Union of all canonical (internal) v2 operation types.
 * Reducers, provenance, receipts, and queries operate on canonical ops only.
 * @typedef {OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2NodePropSet | OpV2EdgePropSet | OpV2BlobValue} CanonicalOpV2
 */

/**
 * Union of all v2 operation types (raw + canonical).
 * Used in patch containers that may hold either raw ops (from disk)
 * or canonical ops (after normalization).
 * @typedef {RawOpV2 | CanonicalOpV2} OpV2
 */

// ============================================================================
// Patch
// ============================================================================

// PatchV2 is now a class — see ./PatchV2.js (re-exported above).

// ============================================================================
// Factory Functions - Operations
// ============================================================================

/**
 * Creates a NodeAdd operation with a dot
 * @param {NodeId} node - Node ID to add
 * @param {Dot} dot - Causal identifier for this add
 * @returns {OpV2NodeAdd} NodeAdd operation
 */
export function createNodeAddV2(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/**
 * Creates a NodeRemove operation with observed dots
 * @param {NodeId} node - Node ID to remove
 * @param {string[]} observedDots - Encoded dot strings being removed
 * @returns {OpV2NodeRemove} NodeRemove operation
 */
export function createNodeRemoveV2(node, observedDots) {
  return { type: 'NodeRemove', node, observedDots };
}

/**
 * Creates an EdgeAdd operation with a dot
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {Dot} dot - Causal identifier for this add
 * @returns {OpV2EdgeAdd} EdgeAdd operation
 */
export function createEdgeAddV2(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/**
 * Creates an EdgeRemove operation with observed dots
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {string[]} observedDots - Encoded dot strings being removed
 * @returns {OpV2EdgeRemove} EdgeRemove operation
 */
export function createEdgeRemoveV2(from, to, label, observedDots) {
  return { type: 'EdgeRemove', from, to, label, observedDots };
}

/**
 * Creates a raw PropSet operation (no dot - uses EventId).
 * This is the persisted form. For internal use, prefer
 * {@link createNodePropSetV2} or {@link createEdgePropSetV2}.
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {OpV2PropSet} PropSet operation
 */
export function createPropSetV2(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

/**
 * Creates a canonical NodePropSet operation (internal only).
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {OpV2NodePropSet} NodePropSet operation
 */
export function createNodePropSetV2(node, key, value) {
  return { type: 'NodePropSet', node, key, value };
}

/**
 * Creates a canonical EdgePropSet operation (internal only).
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {OpV2EdgePropSet} EdgePropSet operation
 */
export function createEdgePropSetV2(from, to, label, key, value) {
  return { type: 'EdgePropSet', from, to, label, key, value };
}

// ============================================================================
// Factory Functions - Patch
// ============================================================================

/**
 * Creates a PatchV2.
 *
 * @deprecated Use `new PatchV2(...)` directly
 * @param {{ schema?: 2|3, writer: string, lamport: number, context: import('../crdt/VersionVector.js').default | Record<string, number>, ops: OpV2[], reads?: string[], writes?: string[] }} options
 * @returns {PatchV2}
 */
export function createPatchV2({ schema = 2, writer, lamport, context, ops, reads, writes }) {
  return new PatchV2({ schema, writer, lamport, context, ops, reads, writes });
}
