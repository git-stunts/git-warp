import { canonicalStringify } from '../utils/canonicalStringify.js';

/**
 * Returns true if the value is null or undefined.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNullish(value) {
  return value === null || value === undefined;
}

/**
 * Asserts the value is a non-null, non-array object, throwing TypeError if not.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {asserts value is Record<string, unknown>}
 */
function requireObject(value, label) {
  if (isNullish(value) || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

export const COORDINATE_COMPARISON_FACT_EXPORT_VERSION = 'coordinate-comparison-fact/v1';
export const COORDINATE_TRANSFER_PLAN_FACT_EXPORT_VERSION = 'coordinate-transfer-plan-fact/v1';

/**
 * @typedef {{
 *   include?: string[],
 *   exclude?: string[]
 * }} VisibleStateScopePrefixFilterV1
 * @typedef {{
 *   nodeIdPrefixes?: VisibleStateScopePrefixFilterV1
 * }} VisibleStateScopeV1
 * @typedef {{ op: string, [key: string]: unknown }} VisibleStateTransferOperationV1
 * @typedef {{ op: string, [key: string]: unknown }} VisibleStateTransferOperationFactV1
 * @typedef {{
 *   comparisonVersion: string,
 *   comparisonDigest?: string,
 *   scope?: VisibleStateScopeV1|null,
 *   left: unknown,
 *   right: unknown,
 *   visiblePatchDivergence: unknown,
 *   visibleState: unknown
 * }} CoordinateComparisonV1
 * @typedef {{
 *   comparisonVersion: string,
 *   scope?: VisibleStateScopeV1,
 *   left: unknown,
 *   right: unknown,
 *   visiblePatchDivergence: unknown,
 *   visibleState: unknown
 * }} CoordinateComparisonFactV1
 * @typedef {{
 *   exportVersion: string,
 *   factKind: 'coordinate-comparison',
 *   factDigest: string,
 *   canonicalFactJson: string,
 *   fact: CoordinateComparisonFactV1
 * }} CoordinateComparisonFactExportV1
 * @typedef {{
 *   transferVersion: string,
 *   transferDigest?: string,
 *   comparisonDigest: string,
 *   scope?: VisibleStateScopeV1|null,
 *   changed: boolean,
 *   source: unknown,
 *   target: unknown,
 *   summary: unknown,
 *   ops: VisibleStateTransferOperationV1[]
 * }} CoordinateTransferPlanV1
 * @typedef {{
 *   transferVersion: string,
 *   comparisonDigest: string,
 *   scope?: VisibleStateScopeV1,
 *   changed: boolean,
 *   source: unknown,
 *   target: unknown,
 *   summary: unknown,
 *   ops: VisibleStateTransferOperationFactV1[]
 * }} CoordinateTransferPlanFactV1
 * @typedef {{
 *   exportVersion: string,
 *   factKind: 'coordinate-transfer-plan',
 *   factDigest: string,
 *   canonicalFactJson: string,
 *   fact: CoordinateTransferPlanFactV1
 * }} CoordinateTransferPlanFactExportV1
 */

/**
 * Validates that a value is a non-empty string, throwing if not.
 *
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
 * Serializes an attach_node_content operation to its fact form.
 *
 * @param {VisibleStateTransferOperationV1} op
 * @returns {VisibleStateTransferOperationFactV1}
 */
function serializeNodeContentOp(op) {
  return {
    op: op.op,
    nodeId: op.nodeId,
    contentOid: op.contentOid,
    mime: op.mime ?? null,
    size: op.size ?? null,
  };
}

/**
 * Serializes an attach_edge_content operation to its fact form.
 *
 * @param {VisibleStateTransferOperationV1} op
 * @returns {VisibleStateTransferOperationFactV1}
 */
function serializeEdgeContentOp(op) {
  return {
    op: op.op,
    from: op.from,
    to: op.to,
    label: op.label,
    contentOid: op.contentOid,
    mime: op.mime ?? null,
    size: op.size ?? null,
  };
}

/**
 * Serializes a single transfer operation into its JSON-safe fact form.
 *
 * @param {VisibleStateTransferOperationV1} op
 * @returns {VisibleStateTransferOperationFactV1}
 */
function serializeSingleTransferOp(op) {
  switch (op.op) {
    case 'attach_node_content':
      return serializeNodeContentOp(op);
    case 'attach_edge_content':
      return serializeEdgeContentOp(op);
    default:
      return { ...op };
  }
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

  return ops.map((op) => serializeSingleTransferOp(op));
}

/**
 * Builds the exact substrate fact payload hashed by `comparisonDigest`.
 *
 * @param {Pick<CoordinateComparisonV1, 'comparisonVersion'|'left'|'right'|'visiblePatchDivergence'|'visibleState'> & { scope?: VisibleStateScopeV1|null }} comparison
 * @returns {CoordinateComparisonFactV1}
 */
export function buildCoordinateComparisonFact(comparison) {
  requireObject(comparison, 'comparison');

  requireNonEmptyString(comparison.comparisonVersion, 'comparison.comparisonVersion');
  return {
    comparisonVersion: comparison.comparisonVersion,
    ...(comparison.scope ? { scope: comparison.scope } : {}),
    left: comparison.left,
    right: comparison.right,
    visiblePatchDivergence: comparison.visiblePatchDivergence,
    visibleState: comparison.visibleState,
  };
}

/**
 * Builds the exact JSON-safe substrate fact payload hashed by `transferDigest`.
 *
 * @param {Pick<CoordinateTransferPlanV1, 'transferVersion'|'comparisonDigest'|'changed'|'source'|'target'|'summary'|'ops'> & { scope?: VisibleStateScopeV1|null }} transferPlan
 * @returns {CoordinateTransferPlanFactV1}
 */
export function buildCoordinateTransferPlanFact(transferPlan) {
  requireObject(transferPlan, 'transferPlan');

  requireNonEmptyString(transferPlan.transferVersion, 'transferPlan.transferVersion');
  requireNonEmptyString(transferPlan.comparisonDigest, 'transferPlan.comparisonDigest');
  return {
    transferVersion: transferPlan.transferVersion,
    comparisonDigest: transferPlan.comparisonDigest,
    ...(transferPlan.scope ? { scope: transferPlan.scope } : {}),
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
