import { canonicalStringify } from '../utils/canonicalStringify.js';

export const COORDINATE_COMPARISON_FACT_EXPORT_VERSION = 'coordinate-comparison-fact/v1';
export const COORDINATE_TRANSFER_PLAN_FACT_EXPORT_VERSION = 'coordinate-transfer-plan-fact/v1';

/**
 * @typedef {import('../../../index.js').CoordinateComparisonV1} CoordinateComparisonV1
 * @typedef {import('../../../index.js').CoordinateComparisonFactV1} CoordinateComparisonFactV1
 * @typedef {import('../../../index.js').CoordinateComparisonFactExportV1} CoordinateComparisonFactExportV1
 * @typedef {import('../../../index.js').CoordinateTransferPlanV1} CoordinateTransferPlanV1
 * @typedef {import('../../../index.js').CoordinateTransferPlanFactV1} CoordinateTransferPlanFactV1
 * @typedef {import('../../../index.js').CoordinateTransferPlanFactExportV1} CoordinateTransferPlanFactExportV1
 * @typedef {import('../../../index.js').VisibleStateTransferOperationV1} VisibleStateTransferOperationV1
 * @typedef {import('../../../index.js').VisibleStateTransferOperationFactV1} VisibleStateTransferOperationFactV1
 */

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

/**
 * Produces the JSON-safe transfer-op representation used for deterministic
 * transfer digests and higher-layer factual exports.
 *
 * @param {VisibleStateTransferOperationV1[]} ops
 * @returns {VisibleStateTransferOperationFactV1[]}
 */
export function serializeTransferOpsForFact(ops) {
  if (!Array.isArray(ops)) {
    throw new TypeError('ops must be an array');
  }

  return ops.map((op) => {
    switch (op.op) {
      case 'attach_node_content':
        return {
          op: op.op,
          nodeId: op.nodeId,
          contentOid: op.contentOid,
          mime: op.mime ?? null,
          size: op.size ?? null,
        };
      case 'attach_edge_content':
        return {
          op: op.op,
          from: op.from,
          to: op.to,
          label: op.label,
          contentOid: op.contentOid,
          mime: op.mime ?? null,
          size: op.size ?? null,
        };
      default:
        return { ...op };
    }
  });
}

/**
 * Builds the exact substrate fact payload hashed by `comparisonDigest`.
 *
 * @param {Pick<CoordinateComparisonV1, 'comparisonVersion'|'left'|'right'|'visiblePatchDivergence'|'visibleState'>} comparison
 * @returns {CoordinateComparisonFactV1}
 */
export function buildCoordinateComparisonFact(comparison) {
  if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) {
    throw new TypeError('comparison must be an object');
  }

  requireNonEmptyString(comparison.comparisonVersion, 'comparison.comparisonVersion');
  return {
    comparisonVersion: comparison.comparisonVersion,
    left: comparison.left,
    right: comparison.right,
    visiblePatchDivergence: comparison.visiblePatchDivergence,
    visibleState: comparison.visibleState,
  };
}

/**
 * Builds the exact JSON-safe substrate fact payload hashed by `transferDigest`.
 *
 * @param {Pick<CoordinateTransferPlanV1, 'transferVersion'|'comparisonDigest'|'changed'|'source'|'target'|'summary'|'ops'>} transferPlan
 * @returns {CoordinateTransferPlanFactV1}
 */
export function buildCoordinateTransferPlanFact(transferPlan) {
  if (!transferPlan || typeof transferPlan !== 'object' || Array.isArray(transferPlan)) {
    throw new TypeError('transferPlan must be an object');
  }

  requireNonEmptyString(transferPlan.transferVersion, 'transferPlan.transferVersion');
  requireNonEmptyString(transferPlan.comparisonDigest, 'transferPlan.comparisonDigest');
  return {
    transferVersion: transferPlan.transferVersion,
    comparisonDigest: transferPlan.comparisonDigest,
    changed: !!transferPlan.changed,
    source: transferPlan.source,
    target: transferPlan.target,
    summary: transferPlan.summary,
    ops: serializeTransferOpsForFact(transferPlan.ops),
  };
}

/**
 * Exports a coordinate comparison as a deterministic substrate fact envelope
 * suitable for higher-layer storage or attestation context.
 *
 * @param {CoordinateComparisonV1} comparison
 * @returns {CoordinateComparisonFactExportV1}
 */
export function exportCoordinateComparisonFact(comparison) {
  const fact = buildCoordinateComparisonFact(comparison);
  const factDigest = requireNonEmptyString(comparison.comparisonDigest, 'comparison.comparisonDigest');
  return {
    exportVersion: COORDINATE_COMPARISON_FACT_EXPORT_VERSION,
    factKind: 'coordinate-comparison',
    factDigest,
    canonicalFactJson: canonicalStringify(fact),
    fact,
  };
}

/**
 * Exports a coordinate transfer plan as a deterministic substrate fact
 * envelope without embedding raw attachment bytes.
 *
 * @param {CoordinateTransferPlanV1} transferPlan
 * @returns {CoordinateTransferPlanFactExportV1}
 */
export function exportCoordinateTransferPlanFact(transferPlan) {
  const fact = buildCoordinateTransferPlanFact(transferPlan);
  const factDigest = requireNonEmptyString(transferPlan.transferDigest, 'transferPlan.transferDigest');
  return {
    exportVersion: COORDINATE_TRANSFER_PLAN_FACT_EXPORT_VERSION,
    factKind: 'coordinate-transfer-plan',
    factDigest,
    canonicalFactJson: canonicalStringify(fact),
    fact,
  };
}
