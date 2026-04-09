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
 * @module domain/services/OpNormalizer
 */

import NodePropSet from '../types/ops/NodePropSet.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import PropSet from '../types/ops/PropSet.ts';
import type { RawOpV2, CanonicalOpV2 } from '../types/ops/unions.ts';
import { isLegacyEdgePropNode, decodeLegacyEdgePropNode, encodeLegacyEdgePropNode } from './KeyCodec.js';

/**
 * Normalizes a single raw (persisted) op into its canonical form.
 *
 * - Raw `PropSet` with \x01-prefixed node → canonical `EdgePropSet`
 * - Raw `PropSet` without prefix → canonical `NodePropSet`
 * - All other op types pass through unchanged.
 *
 * Dispatch is via the discriminated `type` field. This works for both
 * class instances and POJOs decoded from CBOR — the type field is the
 * load-bearing discriminator in both cases.
 */
export function normalizeRawOp(rawOp: RawOpV2): CanonicalOpV2 {
  if (rawOp.type !== 'PropSet') {
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
export function lowerCanonicalOp(canonicalOp: CanonicalOpV2): RawOpV2 {
  if (canonicalOp.type === 'NodePropSet') {
    return new PropSet(canonicalOp.node, canonicalOp.key, canonicalOp.value);
  }
  if (canonicalOp.type === 'EdgePropSet') {
    return new PropSet(
      encodeLegacyEdgePropNode(canonicalOp.from, canonicalOp.to, canonicalOp.label),
      canonicalOp.key,
      canonicalOp.value,
    );
  }
  return canonicalOp;
}
