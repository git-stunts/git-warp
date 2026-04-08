/**
 * WARP Common Types and Shared Factories
 *
 * Pure type definitions using TypeScript for IDE autocomplete and documentation.
 * Contains types and factories shared across schema versions.
 *
 * Note: Schema-specific types are in WarpTypesV2.ts (schema:2).
 *
 * @module WarpTypes
 * @see WARP Spec Section 6
 */

// ============================================================================
// Primitive Types
// ============================================================================

/** String identifier for nodes (e.g., "user:alice", UUID) */
export type NodeId = string;

/** Edge identifier tuple */
export type EdgeKey = {
  from: NodeId;
  to: NodeId;
  label: string;
};

// ============================================================================
// Value References
// ============================================================================

/** Inline value reference - value stored directly in the operation */
export type ValueRefInline = {
  type: 'inline';
  value: unknown;
};

/** Blob value reference - value stored as a Git blob */
export type ValueRefBlob = {
  type: 'blob';
  oid: string;
};

/** Value reference - either inline or blob */
export type ValueRef = ValueRefInline | ValueRefBlob;

// ============================================================================
// Event Identification
// ============================================================================

/**
 * EventId for total ordering of operations across patches.
 * Provides a globally unique identifier for each operation.
 */
export type EventId = {
  lamport: number;
  writerId: string;
  patchSha: string;
  opIndex: number;
};

// ============================================================================
// Operations
// ============================================================================

/** Node add operation */
export type OpNodeAdd = {
  type: 'NodeAdd';
  node: NodeId;
};

/** Node tombstone operation */
export type OpNodeTombstone = {
  type: 'NodeTombstone';
  node: NodeId;
};

/** Edge add operation */
export type OpEdgeAdd = {
  type: 'EdgeAdd';
  from: NodeId;
  to: NodeId;
  label: string;
};

/** Edge tombstone operation */
export type OpEdgeTombstone = {
  type: 'EdgeTombstone';
  from: NodeId;
  to: NodeId;
  label: string;
};

/** Property set operation */
export type OpPropSet = {
  type: 'PropSet';
  node: NodeId;
  key: string;
  value: ValueRef;
};

/** Any graph operation */
export type Op = OpNodeAdd | OpNodeTombstone | OpEdgeAdd | OpEdgeTombstone | OpPropSet;

// ============================================================================
// Factory Functions - Value References
// ============================================================================

/**
 * Creates an inline value reference
 */
export function createInlineValue(value: unknown): ValueRefInline {
  return { type: 'inline', value };
}

/**
 * Creates a blob value reference
 */
export function createBlobValue(oid: string): ValueRefBlob {
  return { type: 'blob', oid };
}

// ============================================================================
// Factory Functions - Operations
// ============================================================================

/**
 * Creates a NodeAdd operation
 */
export function createNodeAdd(node: NodeId): OpNodeAdd {
  return { type: 'NodeAdd', node };
}

/**
 * Creates a NodeTombstone operation
 */
export function createNodeTombstone(node: NodeId): OpNodeTombstone {
  return { type: 'NodeTombstone', node };
}

/**
 * Creates an EdgeAdd operation
 */
export function createEdgeAdd(from: NodeId, to: NodeId, label: string): OpEdgeAdd {
  return { type: 'EdgeAdd', from, to, label };
}

/**
 * Creates an EdgeTombstone operation
 */
export function createEdgeTombstone(from: NodeId, to: NodeId, label: string): OpEdgeTombstone {
  return { type: 'EdgeTombstone', from, to, label };
}

/**
 * Creates a PropSet operation
 */
export function createPropSet(node: NodeId, key: string, value: ValueRef): OpPropSet {
  return { type: 'PropSet', node, key, value };
}

// ============================================================================
// Factory Functions - EventId
// ============================================================================

/**
 * Creates an EventId
 */
export function createEventId({ lamport, writerId, patchSha, opIndex }: { lamport: number; writerId: string; patchSha: string; opIndex: number }): EventId {
  return { lamport, writerId, patchSha, opIndex };
}
