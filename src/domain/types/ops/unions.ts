/**
 * Union types for WARP patch operations.
 *
 * These unions categorize ops by persistence vs. internal-only forms.
 * Concrete classes live in their own files; this module only re-exports
 * the aggregate union aliases that reducers, codec boundaries, and
 * type annotations need.
 *
 * @module domain/types/ops/unions
 */

import type NodeAdd from './NodeAdd.ts';
import type NodeRemove from './NodeRemove.ts';
import type EdgeAdd from './EdgeAdd.ts';
import type EdgeRemove from './EdgeRemove.ts';
import type PropSet from './PropSet.ts';
import type NodePropSet from './NodePropSet.ts';
import type EdgePropSet from './EdgePropSet.ts';
import type BlobValue from './BlobValue.ts';

/** String identifier for nodes (e.g., "user:alice", UUID). */
export type NodeId = string;

/**
 * Union of all raw persisted operation types.
 */
export type RawPatchOp = NodeAdd | NodeRemove | EdgeAdd | EdgeRemove | PropSet | BlobValue;

/**
 * Union of all canonical internal operation types.
 * Reducers, provenance, receipts, and queries operate on canonical ops only.
 */
export type CanonicalPatchOp = NodeAdd | NodeRemove | EdgeAdd | EdgeRemove | NodePropSet | EdgePropSet | BlobValue;

/**
 * Union of all operation types (raw + canonical).
 * Used in patch containers that may hold either raw ops (from disk)
 * or canonical ops (after normalization).
 */
export type PatchOp = RawPatchOp | CanonicalPatchOp;
