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
 * `PatchBuilderV2.build()`/`commit()` via `lowerCanonicalOp()`.
 *
 * @module domain/services/OpNormalizer
 */

import { createNodePropSetV2, createEdgePropSetV2, createPropSetV2 } from '../types/WarpTypesV2.js';
import { isLegacyEdgePropNode, decodeLegacyEdgePropNode, encodeLegacyEdgePropNode } from './KeyCodec.js';

/**
 * Normalizes a single raw (persisted) op into its canonical form.
 *
 * - Raw `PropSet` with \x01-prefixed node → canonical `EdgePropSet`
 * - Raw `PropSet` without prefix → canonical `NodePropSet`
 * - All other op types pass through unchanged.
 *
 * @param {import('../types/WarpTypesV2.js').RawOpV2 | {type: string}} rawOp
 * @returns {import('../types/WarpTypesV2.js').CanonicalOpV2 | {type: string}}
 */
export function normalizeRawOp(rawOp) {
  if (!isPropSetOp(rawOp)) {
    return rawOp;
  }
  const op = /** @type {import('../types/WarpTypesV2.js').OpV2PropSet} */ (rawOp);
  if (isLegacyEdgePropNode(op.node)) {
    const { from, to, label } = decodeLegacyEdgePropNode(op.node);
    return createEdgePropSetV2(from, to, label, op.key, op.value);
  }
  return createNodePropSetV2(op.node, op.key, op.value);
}

/**
 * Checks whether a raw op is a PropSet that requires normalization.
 *
 * @param {unknown} rawOp
 * @returns {boolean}
 */
function isPropSetOp(rawOp) {
  return rawOp !== null
    && rawOp !== undefined
    && typeof rawOp === 'object'
    && typeof /** @type {{type?: unknown}} */ (rawOp).type === 'string'
    && /** @type {{type: string}} */ (rawOp).type === 'PropSet';
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
 *
 * @param {import('../types/WarpTypesV2.js').CanonicalOpV2 | {type: string}} canonicalOp
 * @returns {import('../types/WarpTypesV2.js').RawOpV2 | {type: string}}
 */
export function lowerCanonicalOp(canonicalOp) {
  switch (canonicalOp.type) {
    case 'NodePropSet': {
      const op = /** @type {import('../types/WarpTypesV2.js').OpV2NodePropSet} */ (canonicalOp);
      return createPropSetV2(op.node, op.key, op.value);
    }
    case 'EdgePropSet': {
      const op = /** @type {import('../types/WarpTypesV2.js').OpV2EdgePropSet} */ (canonicalOp);
      return createPropSetV2(
        encodeLegacyEdgePropNode(op.from, op.to, op.label),
        op.key,
        op.value,
      );
    }
    default:
      return canonicalOp;
  }
}
