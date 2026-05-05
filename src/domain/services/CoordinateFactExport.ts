import { canonicalStringify } from '../utils/canonicalStringify.ts';
import WarpError from '../errors/WarpError.ts';

/**
 * Returns true if the value is null or undefined.
 */
function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Asserts the value is a non-null, non-array object, throwing if not.
 */
function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (isNullish(value) || typeof value !== 'object' || Array.isArray(value)) {
    throw new WarpError(`${label} must be an object`, 'E_COORDINATE_FACT_NOT_OBJECT', { context: { label } });
  }
}

const COORDINATE_COMPARISON_FACT_EXPORT_VERSION = 'coordinate-comparison-fact/v1';
const COORDINATE_TRANSFER_PLAN_FACT_EXPORT_VERSION = 'coordinate-transfer-plan-fact/v1';

export interface VisibleStateScopePrefixFilterV1 {
  include?: string[];
  exclude?: string[];
}

export interface VisibleStateScope {
  nodeIdPrefixes?: VisibleStateScopePrefixFilterV1;
}

export interface VisibleStateTransferOperationV1 {
  op: string;
  [key: string]: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export interface VisibleStateTransferOperationFactV1 {
  op: string;
  [key: string]: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export interface CoordinateComparisonV1 {
  comparisonVersion: string;
  comparisonDigest?: string;
  scope?: VisibleStateScope | null;
  left: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  right: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  visiblePatchDivergence: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  visibleState: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export interface CoordinateComparisonFactV1 {
  comparisonVersion: string;
  scope?: VisibleStateScope;
  left: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  right: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  visiblePatchDivergence: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  visibleState: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export interface CoordinateComparisonFactExportV1 {
  exportVersion: string;
  factKind: 'coordinate-comparison';
  factDigest: string;
  canonicalFactJson: string;
  fact: CoordinateComparisonFactV1;
}

export interface CoordinateTransferPlanV1 {
  transferVersion: string;
  transferDigest?: string;
  comparisonDigest: string;
  scope?: VisibleStateScope | null;
  changed: boolean;
  source: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  target: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  summary: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  ops: VisibleStateTransferOperationV1[];
}

export interface CoordinateTransferPlanFactV1 {
  transferVersion: string;
  comparisonDigest: string;
  scope?: VisibleStateScope;
  changed: boolean;
  source: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  target: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  summary: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  ops: VisibleStateTransferOperationFactV1[];
}

export interface CoordinateTransferPlanFactExportV1 {
  exportVersion: string;
  factKind: 'coordinate-transfer-plan';
  factDigest: string;
  canonicalFactJson: string;
  fact: CoordinateTransferPlanFactV1;
}

/**
 * Validates that a value is a non-empty string, throwing if not.
 */
function requireNonEmptyString(value: unknown, label: string): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(`${label} must be a non-empty string`, 'E_COORDINATE_FACT_NOT_STRING', { context: { label } });
  }
  return value;
}

/**
 * Serializes an attach_node_content operation to its fact form.
 */
function serializeNodeContentOp(op: VisibleStateTransferOperationV1): VisibleStateTransferOperationFactV1 {
  return {
    op: op.op,
    nodeId: op['nodeId'],
    contentOid: op['contentOid'],
    mime: op['mime'] ?? null,
    size: op['size'] ?? null,
  };
}

/**
 * Serializes an attach_edge_content operation to its fact form.
 */
function serializeEdgeContentOp(op: VisibleStateTransferOperationV1): VisibleStateTransferOperationFactV1 {
  return {
    op: op.op,
    from: op['from'],
    to: op['to'],
    label: op['label'],
    contentOid: op['contentOid'],
    mime: op['mime'] ?? null,
    size: op['size'] ?? null,
  };
}

/**
 * Serializes a single transfer operation into its JSON-safe fact form.
 */
function serializeSingleTransferOp(op: VisibleStateTransferOperationV1): VisibleStateTransferOperationFactV1 {
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
 */
function serializeTransferOpsForFact(ops: VisibleStateTransferOperationV1[]): VisibleStateTransferOperationFactV1[] {
  if (!Array.isArray(ops)) {
    throw new WarpError('ops must be an array', 'E_COORDINATE_FACT_OPS_NOT_ARRAY');
  }

  return ops.map((op) => serializeSingleTransferOp(op));
}

/**
 * Builds the exact substrate fact payload hashed by `comparisonDigest`.
 */
export function buildCoordinateComparisonFact(
  comparison: Pick<CoordinateComparisonV1, 'comparisonVersion' | 'left' | 'right' | 'visiblePatchDivergence' | 'visibleState'> & {
    scope?: VisibleStateScope | null;
  },
): CoordinateComparisonFactV1 {
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
 */
export function buildCoordinateTransferPlanFact(
  transferPlan: Pick<CoordinateTransferPlanV1, 'transferVersion' | 'comparisonDigest' | 'changed' | 'source' | 'target' | 'summary' | 'ops'> & {
    scope?: VisibleStateScope | null;
  },
): CoordinateTransferPlanFactV1 {
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
 */
export function exportCoordinateComparisonFact(comparison: CoordinateComparisonV1): CoordinateComparisonFactExportV1 {
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
 */
export function exportCoordinateTransferPlanFact(transferPlan: CoordinateTransferPlanV1): CoordinateTransferPlanFactExportV1 {
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
