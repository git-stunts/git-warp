/**
 * Bit flags for op scope — which side of the raw/canonical boundary an op lives on.
 *
 * Raw ops are the persisted wire format. Canonical ops are the internal
 * representation used by the reducer, provenance, and receipts. Some ops
 * (NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, BlobValue) are both.
 */

/** Op is valid in the canonical (internal) pipeline. */
export const OP_SCOPE_CANONICAL = 1;

/** Op is valid in the raw (persisted) wire format. */
export const OP_SCOPE_RAW = 2;

/** Op is valid on both sides of the boundary. */
export const OP_SCOPE_BOTH = 3; // OP_SCOPE_CANONICAL | OP_SCOPE_RAW
