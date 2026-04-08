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
import { isLegacyEdgePropNode, decodeLegacyEdgePropNode, encodeLegacyEdgePropNode } from './KeyCodec.js';

/**
 * Normalizes a single raw (persisted) op into its canonical form.
 *
 * - Raw `PropSet` with \x01-prefixed node → canonical `EdgePropSet`
 * - Raw `PropSet` without prefix → canonical `NodePropSet`
 * - All other op types pass through unchanged.
 *
 * @param {import('../types/ops/unions.ts').RawOpV2 | {type: string}} rawOp
 * @returns {import('../types/ops/unions.ts').CanonicalOpV2 | {type: string}}
 */
export function normalizeRawOp(rawOp) {
  if (!isPropSetOp(rawOp)) {
    return rawOp;
  }
  const op = /** @type {PropSet} */ (rawOp);
  if (isLegacyEdgePropNode(op.node)) {
    const { from, to, label } = decodeLegacyEdgePropNode(op.node);
    return new EdgePropSet({ from, to, label, key: op.key, value: op.value });
  }
  return new NodePropSet(op.node, op.key, op.value);
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
 * @param {import('../types/ops/unions.ts').CanonicalOpV2 | {type: string}} canonicalOp
 * @returns {import('../types/ops/unions.ts').RawOpV2 | {type: string}}
 */
export function lowerCanonicalOp(canonicalOp) {
  switch (canonicalOp.type) {
    case 'NodePropSet': {
      const op = /** @type {NodePropSet} */ (canonicalOp);
      return new PropSet(op.node, op.key, op.value);
    }
    case 'EdgePropSet': {
      const op = /** @type {EdgePropSet} */ (canonicalOp);
      return new PropSet(
        encodeLegacyEdgePropNode(op.from, op.to, op.label),
        op.key,
        op.value,
      );
    }
    default:
      return canonicalOp;
  }
}
