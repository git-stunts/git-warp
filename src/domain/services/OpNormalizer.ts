/**
 * OpNormalizer — raw ↔ canonical operation conversion.
 *
 * ADR 1 (Canonicalize Edge Property Operations Internally) requires that
 * reducers, provenance, receipts, and queries operate on canonical ops:
 *
 *   Raw (persisted):      NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, PropSet, BlobValue
 *   Canonical (internal): NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, NodePropSet, EdgePropSet, BlobValue
 *
 * **Current normalization location:** Normalization is performed at the
 * reducer entry points (`applyFast`, `applyWithReceipt`, `applyWithDiff`
 * in JoinReducer.js), not at the CBOR decode boundary as originally
 * planned in ADR 1. This is a pragmatic deviation — the reducer calls
 * `normalizeRawOp()` on each op before dispatch. Lowering happens in
 * `PatchBuilder.build()`/`commit()` via `lowerCanonicalOp()`.
 *
 * ### Boundary typing note
 *
 * Raw ops may arrive either as instances of the op classes (after
 * domain-internal construction) OR as POJOs (decoded directly from CBOR
 * and not yet re-hydrated into class instances). The parameter type is
 * a union that reflects this dual-source reality. The normalizer is a
 * parser boundary: it pattern-matches on the `type` tag and produces
 * canonical-form class instances for property operations.
 *
 * @module domain/services/OpNormalizer
 */

import NodePropSet from '../types/ops/NodePropSet.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import PropSet from '../types/ops/PropSet.ts';
import type { RawOpV2, CanonicalOpV2 } from '../types/ops/unions.ts';
import { isLegacyEdgePropNode, decodeLegacyEdgePropNode, encodeLegacyEdgePropNode } from './KeyCodec.js';

/** Minimal shape any op must present at the normalization boundary. */
type TaggedOp = { readonly type: string };

/**
 * Type guard: does this op structurally match a raw `PropSet`?
 *
 * Runtime tag check — not `instanceof` — because raw ops may arrive as
 * POJOs from CBOR decode before they are ever re-hydrated into class
 * instances. The reducer calls this on every incoming op, so class
 * identity cannot be assumed here.
 */
function isRawPropSetShape(rawOp: RawOpV2 | TaggedOp): rawOp is PropSet {
  return rawOp.type === 'PropSet';
}

function isCanonicalNodePropSetShape(
  op: CanonicalOpV2 | TaggedOp,
): op is NodePropSet {
  return op.type === 'NodePropSet';
}

function isCanonicalEdgePropSetShape(
  op: CanonicalOpV2 | TaggedOp,
): op is EdgePropSet {
  return op.type === 'EdgePropSet';
}

/**
 * Normalizes a single raw (persisted) op into its canonical form.
 *
 * - Raw `PropSet` with \x01-prefixed node → canonical `EdgePropSet`
 * - Raw `PropSet` without prefix → canonical `NodePropSet`
 * - All other op types pass through unchanged.
 */
export function normalizeRawOp(
  rawOp: RawOpV2 | TaggedOp,
): CanonicalOpV2 | TaggedOp {
  if (!isRawPropSetShape(rawOp)) {
    return rawOp;
  }
  if (isLegacyEdgePropNode(rawOp.node)) {
    const { from, to, label } = decodeLegacyEdgePropNode(rawOp.node);
    return new EdgePropSet({ from, to, label, key: rawOp.key, value: rawOp.value });
  }
  return new NodePropSet(rawOp.node, rawOp.key, rawOp.value);
}

/**
 * Lowers a single canonical op back to raw (persisted) form.
 *
 * - Canonical `NodePropSet` → raw `PropSet`
 * - Canonical `EdgePropSet` → raw `PropSet` with legacy \x01-prefixed node
 * - All other op types pass through unchanged.
 *
 * In M13, this always produces legacy raw PropSet for property ops.
 * A future graph capability cutover (ADR 2) may allow emitting raw
 * `EdgePropSet` directly.
 */
export function lowerCanonicalOp(
  canonicalOp: CanonicalOpV2 | TaggedOp,
): RawOpV2 | TaggedOp {
  if (isCanonicalNodePropSetShape(canonicalOp)) {
    return new PropSet(canonicalOp.node, canonicalOp.key, canonicalOp.value);
  }
  if (isCanonicalEdgePropSetShape(canonicalOp)) {
    return new PropSet(
      encodeLegacyEdgePropNode(canonicalOp.from, canonicalOp.to, canonicalOp.label),
      canonicalOp.key,
      canonicalOp.value,
    );
  }
  return canonicalOp;
}
