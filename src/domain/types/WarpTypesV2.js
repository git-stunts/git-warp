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
import NodeAddClass from './ops/NodeAdd.js';
import NodeRemoveClass from './ops/NodeRemove.js';
import EdgeAddClass from './ops/EdgeAdd.js';
import EdgeRemoveClass from './ops/EdgeRemove.js';
import NodePropSetClass from './ops/NodePropSet.js';
import EdgePropSetClass from './ops/EdgePropSet.js';
import PropSetClass from './ops/PropSet.js';

/** @typedef {import('./ops/BlobValue.js').default} BlobValueClass */

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
 * Node add operation - creates a new node with a dot.
 * @typedef {NodeAddClass} OpV2NodeAdd
 */

/**
 * Node remove operation - removes a node by observed dots.
 * @typedef {NodeRemoveClass} OpV2NodeRemove
 */

/**
 * Edge add operation - creates a new edge with a dot.
 * @typedef {EdgeAddClass} OpV2EdgeAdd
 */

/**
 * Edge remove operation - removes an edge by observed dots.
 * @typedef {EdgeRemoveClass} OpV2EdgeRemove
 */

/**
 * Property set operation - sets a property value on a node (raw/persisted form).
 * Uses EventId for identification (derived from patch context).
 *
 * In raw patches, edge properties are also encoded as PropSet with the node
 * field carrying a \x01-prefixed edge identity. See {@link OpV2NodePropSet}
 * and {@link OpV2EdgePropSet} for the canonical (internal) representations.
 *
 * @typedef {PropSetClass} OpV2PropSet
 */

/**
 * Canonical node property set operation (internal only — never persisted).
 * @typedef {NodePropSetClass} OpV2NodePropSet
 */

/**
 * Canonical edge property set operation (internal only — never persisted).
 * @typedef {EdgePropSetClass} OpV2EdgePropSet
 */

/**
 * Blob value reference operation.
 * @typedef {BlobValueClass} OpV2BlobValue
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
 * @returns {NodeAddClass} NodeAdd operation
 */
export function createNodeAddV2(node, dot) {
  return new NodeAddClass(node, dot);
}

/**
 * Creates a NodeRemove operation with observed dots
 * @param {NodeId} node - Node ID to remove
 * @param {string[]} observedDots - Encoded dot strings being removed
 * @returns {NodeRemoveClass} NodeRemove operation
 */
export function createNodeRemoveV2(node, observedDots) {
  return new NodeRemoveClass(node, observedDots);
}

/**
 * Creates an EdgeAdd operation with a dot
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {Dot} dot - Causal identifier for this add
 * @returns {EdgeAddClass} EdgeAdd operation
 */
export function createEdgeAddV2(from, to, label, dot) {
  return new EdgeAddClass({ from, to, label, dot });
}

/**
 * Creates an EdgeRemove operation with observed dots
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {string[]} observedDots - Encoded dot strings being removed
 * @returns {EdgeRemoveClass} EdgeRemove operation
 */
export function createEdgeRemoveV2(from, to, label, observedDots) {
  return new EdgeRemoveClass({ from, to, label, observedDots });
}

/**
 * Creates a raw PropSet operation (no dot - uses EventId).
 * This is the persisted form. For internal use, prefer
 * {@link createNodePropSetV2} or {@link createEdgePropSetV2}.
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {PropSetClass} PropSet operation
 */
export function createPropSetV2(node, key, value) {
  return new PropSetClass(node, key, value);
}

/**
 * Creates a canonical NodePropSet operation (internal only).
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {NodePropSetClass} NodePropSet operation
 */
export function createNodePropSetV2(node, key, value) {
  return new NodePropSetClass(node, key, value);
}

/**
 * Creates a canonical EdgePropSet operation (internal only).
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {EdgePropSetClass} EdgePropSet operation
 */
export function createEdgePropSetV2(from, to, label, key, value) {
  return new EdgePropSetClass({ from, to, label, key, value });
}

// ============================================================================
// Factory Functions - Patch
// ============================================================================

/**
 * Creates a PatchV2.
 *
 * @deprecated Use `new PatchV2(...)` directly
 * @param {{ schema?: 2|3, writer: string, lamport: number, context: import('../crdt/VersionVector.js').default | Record<string, number>, ops: OpV2[], reads?: string[] | undefined, writes?: string[] | undefined }} options
 * @returns {PatchV2}
 */
export function createPatchV2({ schema = 2, writer, lamport, context, ops, reads, writes }) {
  return new PatchV2({ schema, writer, lamport, context, ops, reads, writes });
}
