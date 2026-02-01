/**
 * WARP Common Types and Shared Factories
 *
 * Pure type definitions using JSDoc for IDE autocomplete and documentation.
 * Contains types and factories shared across schema versions.
 *
 * Note: Schema-specific types are in WarpTypesV2.js (schema:2).
 *
 * @module WarpTypes
 * @see WARP Spec Section 6
 */

// ============================================================================
// Primitive Types
// ============================================================================

/**
 * String identifier for nodes (e.g., "user:alice", UUID)
 * @typedef {string} NodeId
 */

/**
 * Edge identifier tuple
 * @typedef {Object} EdgeKey
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label/type
 */

// ============================================================================
// Value References
// ============================================================================

/**
 * Inline value reference - value stored directly in the operation
 * @typedef {Object} ValueRefInline
 * @property {'inline'} type - Discriminator for inline values
 * @property {*} value - The actual value (any JSON-serializable type)
 */

/**
 * Blob value reference - value stored as a Git blob
 * @typedef {Object} ValueRefBlob
 * @property {'blob'} type - Discriminator for blob references
 * @property {string} oid - Git blob OID (object identifier)
 */

/**
 * Value reference - either inline or blob
 * @typedef {ValueRefInline | ValueRefBlob} ValueRef
 */

// ============================================================================
// Event Identification
// ============================================================================

/**
 * EventId for total ordering of operations across patches
 * Provides a globally unique identifier for each operation
 * @typedef {Object} EventId
 * @property {number} lamport - Lamport timestamp from the patch
 * @property {string} writerId - Writer ID from the patch
 * @property {string} patchSha - SHA of the patch/commit containing this operation
 * @property {number} opIndex - Index of the operation within the patch
 */

// ============================================================================
// Factory Functions - Value References
// ============================================================================

/**
 * Creates an inline value reference
 * @param {*} value - The value to store inline
 * @returns {ValueRefInline} Inline value reference
 */
export function createInlineValue(value) {
  return { type: 'inline', value };
}

/**
 * Creates a blob value reference
 * @param {string} oid - Git blob OID
 * @returns {ValueRefBlob} Blob value reference
 */
export function createBlobValue(oid) {
  return { type: 'blob', oid };
}

// ============================================================================
// Factory Functions - Operations
// ============================================================================

/**
 * Creates a NodeAdd operation
 * @param {NodeId} node - Node ID to add
 * @returns {OpNodeAdd} NodeAdd operation
 */
export function createNodeAdd(node) {
  return { type: 'NodeAdd', node };
}

/**
 * Creates a NodeTombstone operation
 * @param {NodeId} node - Node ID to tombstone
 * @returns {OpNodeTombstone} NodeTombstone operation
 */
export function createNodeTombstone(node) {
  return { type: 'NodeTombstone', node };
}

/**
 * Creates an EdgeAdd operation
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @returns {OpEdgeAdd} EdgeAdd operation
 */
export function createEdgeAdd(from, to, label) {
  return { type: 'EdgeAdd', from, to, label };
}

/**
 * Creates an EdgeTombstone operation
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @returns {OpEdgeTombstone} EdgeTombstone operation
 */
export function createEdgeTombstone(from, to, label) {
  return { type: 'EdgeTombstone', from, to, label };
}

/**
 * Creates a PropSet operation
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {ValueRef} value - Property value reference
 * @returns {OpPropSet} PropSet operation
 */
export function createPropSet(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

// ============================================================================
// Factory Functions - EventId
// ============================================================================

/**
 * Creates an EventId
 * @param {Object} options - EventId options
 * @param {number} options.lamport - Lamport timestamp
 * @param {string} options.writerId - Writer ID
 * @param {string} options.patchSha - Patch SHA
 * @param {number} options.opIndex - Operation index within patch
 * @returns {EventId} EventId object
 */
export function createEventId({ lamport, writerId, patchSha, opIndex }) {
  return { lamport, writerId, patchSha, opIndex };
}
