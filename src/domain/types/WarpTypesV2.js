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

// ============================================================================
// Primitive Types
// ============================================================================

/**
 * String identifier for nodes (e.g., "user:alice", UUID)
 * @typedef {string} NodeId
 */

/**
 * Dot - causal identifier for an add operation
 * @typedef {Object} Dot
 * @property {string} writer - Writer ID that created this dot
 * @property {number} seq - Sequence number for this writer
 */

/**
 * VersionVector - maps writer IDs to their maximum observed sequence numbers
 * @typedef {Object.<string, number>} VersionVector
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
 * @property {Dot[]} observedDots - Dots being removed (add events observed)
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
 * @property {Dot[]} observedDots - Dots being removed (add events observed)
 */

/**
 * Property set operation - sets a property value on a node
 * Uses EventId for identification (derived from patch context)
 * @typedef {Object} OpV2PropSet
 * @property {'PropSet'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to set property on
 * @property {string} key - Property key
 * @property {*} value - Property value (any JSON-serializable type)
 */

/**
 * Union of all v2 operation types
 * @typedef {OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2PropSet} OpV2
 */

// ============================================================================
// Patch
// ============================================================================

/**
 * PatchV2 - A batch of ordered operations from a single writer
 * @typedef {Object} PatchV2
 * @property {2|3} schema - Schema version (2 for node-only, 3 for edge properties)
 * @property {string} writer - Writer ID (identifies the source of the patch)
 * @property {number} lamport - Lamport timestamp for ordering
 * @property {VersionVector} context - Writer's observed frontier (NOT global stability)
 * @property {OpV2[]} ops - Ordered array of operations
 */

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
 * @param {Dot[]} observedDots - Dots being removed
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
 * @param {Dot[]} observedDots - Dots being removed
 * @returns {OpV2EdgeRemove} EdgeRemove operation
 */
export function createEdgeRemoveV2(from, to, label, observedDots) {
  return { type: 'EdgeRemove', from, to, label, observedDots };
}

/**
 * Creates a PropSet operation (no dot - uses EventId)
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {*} value - Property value (any JSON-serializable type)
 * @returns {OpV2PropSet} PropSet operation
 */
export function createPropSetV2(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

// ============================================================================
// Factory Functions - Patch
// ============================================================================

/**
 * Creates a PatchV2
 * @param {Object} options - Patch options
 * @param {2|3} [options.schema=2] - Schema version (2 for node-only, 3 for edge properties)
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {VersionVector} options.context - Writer's observed frontier
 * @param {OpV2[]} options.ops - Array of operations
 * @returns {PatchV2} PatchV2 object
 */
export function createPatchV2({ schema = 2, writer, lamport, context, ops }) {
  return {
    schema,
    writer,
    lamport,
    context,
    ops,
  };
}
