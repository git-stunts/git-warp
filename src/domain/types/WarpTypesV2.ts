/**
 * WARP OpV2/PatchV2 Types and Schema
 *
 * Type definitions and factory functions for WARP v5 operations and patches.
 *
 * Key differences from V1:
 * - Add operations carry dots (causal identifiers)
 * - Remove operations carry observedDots (set of dots being removed)
 * - PropSet uses EventId for identification (derived from patch context)
 * - PatchV2 includes context (VersionVector) for writer's observed frontier
 *
 * @module WarpTypesV2
 * @see WARP v5 Spec
 */

import type { Dot } from '../crdt/Dot.js';
import type VersionVector from '../crdt/VersionVector.js';
import PatchV2 from './PatchV2.ts';
import NodeAddClass from './ops/NodeAdd.ts';
import NodeRemoveClass from './ops/NodeRemove.ts';
import EdgeAddClass from './ops/EdgeAdd.ts';
import EdgeRemoveClass from './ops/EdgeRemove.ts';
import NodePropSetClass from './ops/NodePropSet.ts';
import EdgePropSetClass from './ops/EdgePropSet.ts';
import PropSetClass from './ops/PropSet.ts';
import type BlobValueClass from './ops/BlobValue.ts';

// Re-export PatchV2 class for consumers that import from this module.
export { PatchV2 };

// ============================================================================
// Primitive Types
// ============================================================================

/** String identifier for nodes (e.g., "user:alice", UUID) */
export type NodeId = string;

// ============================================================================
// Operations (OpV2)
// ============================================================================

/** Node add operation - creates a new node with a dot. */
export type OpV2NodeAdd = NodeAddClass;

/** Node remove operation - removes a node by observed dots. */
export type OpV2NodeRemove = NodeRemoveClass;

/** Edge add operation - creates a new edge with a dot. */
export type OpV2EdgeAdd = EdgeAddClass;

/** Edge remove operation - removes an edge by observed dots. */
export type OpV2EdgeRemove = EdgeRemoveClass;

/**
 * Property set operation - sets a property value on a node (raw/persisted form).
 * Uses EventId for identification (derived from patch context).
 *
 * In raw patches, edge properties are also encoded as PropSet with the node
 * field carrying a \x01-prefixed edge identity. See OpV2NodePropSet
 * and OpV2EdgePropSet for the canonical (internal) representations.
 */
export type OpV2PropSet = PropSetClass;

/** Canonical node property set operation (internal only — never persisted). */
export type OpV2NodePropSet = NodePropSetClass;

/** Canonical edge property set operation (internal only — never persisted). */
export type OpV2EdgePropSet = EdgePropSetClass;

/** Blob value reference operation. */
export type OpV2BlobValue = BlobValueClass;

/**
 * Union of all raw (persisted) v2 operation types.
 */
export type RawOpV2 = OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2PropSet | OpV2BlobValue;

/**
 * Union of all canonical (internal) v2 operation types.
 * Reducers, provenance, receipts, and queries operate on canonical ops only.
 */
export type CanonicalOpV2 = OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2NodePropSet | OpV2EdgePropSet | OpV2BlobValue;

/**
 * Union of all v2 operation types (raw + canonical).
 * Used in patch containers that may hold either raw ops (from disk)
 * or canonical ops (after normalization).
 */
export type OpV2 = RawOpV2 | CanonicalOpV2;

// ============================================================================
// Patch
// ============================================================================

// PatchV2 is now a class — see ./PatchV2.ts (re-exported above).

// ============================================================================
// Factory Functions - Operations
// ============================================================================

/**
 * Creates a NodeAdd operation with a dot
 */
export function createNodeAddV2(node: NodeId, dot: Dot): NodeAddClass {
  return new NodeAddClass(node, dot);
}

/**
 * Creates a NodeRemove operation with observed dots
 */
export function createNodeRemoveV2(node: NodeId, observedDots: string[]): NodeRemoveClass {
  return new NodeRemoveClass(node, observedDots);
}

/**
 * Creates an EdgeAdd operation with a dot
 */
export function createEdgeAddV2(from: NodeId, to: NodeId, label: string, dot: Dot): EdgeAddClass {
  return new EdgeAddClass({ from, to, label, dot });
}

/**
 * Creates an EdgeRemove operation with observed dots
 */
export function createEdgeRemoveV2(from: NodeId, to: NodeId, label: string, observedDots: string[]): EdgeRemoveClass {
  return new EdgeRemoveClass({ from, to, label, observedDots });
}

/**
 * Creates a raw PropSet operation (no dot - uses EventId).
 * This is the persisted form. For internal use, prefer
 * createNodePropSetV2 or createEdgePropSetV2.
 */
export function createPropSetV2(node: NodeId, key: string, value: unknown): PropSetClass {
  return new PropSetClass(node, key, value);
}

/**
 * Creates a canonical NodePropSet operation (internal only).
 */
export function createNodePropSetV2(node: NodeId, key: string, value: unknown): NodePropSetClass {
  return new NodePropSetClass(node, key, value);
}

/**
 * Creates a canonical EdgePropSet operation (internal only).
 */
export function createEdgePropSetV2(from: NodeId, to: NodeId, label: string, key: string, value: unknown): EdgePropSetClass {
  return new EdgePropSetClass({ from, to, label, key, value });
}

// ============================================================================
// Factory Functions - Patch
// ============================================================================

/**
 * Creates a PatchV2.
 *
 * @deprecated Use `new PatchV2(...)` directly
 */
export function createPatchV2({ schema = 2, writer, lamport, context, ops, reads, writes }: {
  schema?: 2 | 3;
  writer: string;
  lamport: number;
  context: VersionVector | Record<string, number>;
  ops: OpV2[];
  reads?: string[] | undefined;
  writes?: string[] | undefined;
}): PatchV2 {
  return new PatchV2({ schema, writer, lamport, context, ops, reads, writes });
}
