/**
 * ComparisonEngine — coordinate comparison and transfer planning logic.
 *
 * Contains the implementations for compareCoordinates, compareStrand,
 * planCoordinateTransfer, and planStrandTransfer. All functions are
 * free (not methods) — the ComparisonController facade delegates here.
 *
 * @module domain/services/controllers/ComparisonEngine
 */

import QueryError from '../../errors/QueryError.ts';
import { computeChecksum } from '../../utils/checksumUtils.ts';
import {
  buildCoordinateComparisonFact,
  buildCoordinateTransferPlanFact,
} from '../CoordinateFactExport.ts';
import { createStateReader } from '../state/StateReader.ts';
import { compareVisibleState } from '../comparison/VisibleStateComparison.ts';
import { planVisibleStateTransfer } from '../transfer/VisibleStateTransferPlanner.ts';
import { normalizeVisibleStateScope } from '../VisibleStateScope.ts';
import type {
  VisibleStateScope,
  CoordinateComparisonSelectorInput,
  CoordinateTransferPlanSelectorInput,
  CoordinateComparison,
  CoordinateTransferPlan,
} from '../../types/CoordinateComparison.ts';
import type {
  CompareStrandOptions,
  PlanStrandTransferOptions,
  CompareCoordinatesOptions,
  PlanCoordinateTransferOptions,
} from '../../capabilities/ComparisonCapability.ts';
import type Patch from '../../types/Patch.ts';
import {
  type ComparisonHost,
  type ComparisonSelectorContext,
  type PatchEntry,
  type NormalizedSelector,
  type ResolvedComparisonSide,
  normalizeSelector,
  normalizeRequiredString,
  normalizeLamportCeiling,
  normalizeOptionalString,
  uniqueSortedPatchShas,
  compareStrings,
} from './ComparisonSelector.ts';

const COORDINATE_COMPARISON_VERSION = 'coordinate-compare/v1';
const COORDINATE_TRANSFER_PLAN_VERSION = 'coordinate-transfer-plan/v1';

// ── Result shapes ────────────────────────────────────────────────────

export type VisiblePatchDivergence = CoordinateComparison['visiblePatchDivergence'];
export type VisiblePatchDivergenceTarget = NonNullable<VisiblePatchDivergence['target']>;

// ── Divergence ───────────────────────────────────────────────────────

function patchTouchesEntity(patch: Patch, entityId: string): boolean {
  const reads = Array.isArray(patch.reads) ? patch.reads : [];
  const writes = Array.isArray(patch.writes) ? patch.writes : [];
  return reads.includes(entityId) || writes.includes(entityId);
}

function targetPatchShas(entries: PatchEntry[], targetId: string): string[] {
  const filtered = entries.filter(({ patch }) => patchTouchesEntity(patch, targetId));
  return [...new Set(filtered.map(({ sha }) => sha))].sort(compareStrings);
}

function buildTargetDivergence(
  leftEntries: PatchEntry[],
  rightEntries: PatchEntry[],
  targetId: string,
): VisiblePatchDivergenceTarget {
  const leftTarget = targetPatchShas(leftEntries, targetId);
  const rightTarget = targetPatchShas(rightEntries, targetId);
  const rightTargetSet = new Set(rightTarget);
  const leftTargetSet = new Set(leftTarget);

  return {
    targetId,
    leftCount: leftTarget.length,
    rightCount: rightTarget.length,
    sharedCount: leftTarget.filter((sha) => rightTargetSet.has(sha)).length,
    leftOnlyCount: leftTarget.filter((sha) => !rightTargetSet.has(sha)).length,
    rightOnlyCount: rightTarget.filter((sha) => !leftTargetSet.has(sha)).length,
    leftOnlyPatchShas: leftTarget.filter((sha) => !rightTargetSet.has(sha)),
    rightOnlyPatchShas: rightTarget.filter((sha) => !leftTargetSet.has(sha)),
  };
}

export function buildPatchDivergenceImpl(
  leftEntries: PatchEntry[],
  rightEntries: PatchEntry[],
  targetId: string | null,
): VisiblePatchDivergence {
  const leftShas = uniqueSortedPatchShas(leftEntries);
  const rightShas = uniqueSortedPatchShas(rightEntries);
  const rightSet = new Set(rightShas);
  const leftSet = new Set(leftShas);
  const leftOnly = leftShas.filter((sha) => !rightSet.has(sha));
  const rightOnly = rightShas.filter((sha) => !leftSet.has(sha));

  const base: VisiblePatchDivergence = {
    sharedCount: leftShas.filter((sha) => rightSet.has(sha)).length,
    leftOnlyCount: leftOnly.length,
    rightOnlyCount: rightOnly.length,
    leftOnlyPatchShas: leftOnly,
    rightOnlyPatchShas: rightOnly,
  };

  if (targetId !== null && targetId !== undefined && targetId !== '') {
    return { ...base, target: buildTargetDivergence(leftEntries, rightEntries, targetId) };
  }

  return base;
}

// ── Option-object validation ─────────────────────────────────────────

function assertOptionsObject<T extends object>(
  options: T | null | undefined,
  callerName: string,
): asserts options is T {
  if (options === null || options === undefined
      || typeof options !== 'object' || Array.isArray(options)) {
    throw new QueryError(`${callerName} options must be an object`, {
      code: 'invalid_coordinate',
    });
  }
}

function assertRequiredOptions<T extends object>(
  options: T | null | undefined,
  callerName: string,
): asserts options is T {
  if (options === null || options === undefined
      || typeof options !== 'object' || Array.isArray(options)) {
    throw new QueryError(`${callerName} requires an options object`, {
      code: 'invalid_coordinate',
    });
  }
}

// ── Strand option normalization ──────────────────────────────────────

type CompareAgainst = NonNullable<CompareStrandOptions['against']>;
type PlanTransferInto = NonNullable<PlanStrandTransferOptions['into']>;

function isStrandLiteralKind(
  value: CompareAgainst | PlanTransferInto,
): value is { kind: 'strand'; strandId: string } {
  return value !== null && typeof value === 'object'
    && 'kind' in value && value.kind === 'strand';
}

function normalizeAgainstSelector(
  normalizedStrandId: string,
  against: CompareAgainst,
  againstCeiling: number | null,
): CoordinateComparisonSelectorInput {
  if (against === 'base') {
    return { kind: 'strand_base', strandId: normalizedStrandId, ceiling: againstCeiling };
  }
  if (against === 'live') {
    return { kind: 'live', ceiling: againstCeiling };
  }
  if (isStrandLiteralKind(against)) {
    return {
      kind: 'strand',
      strandId: normalizeRequiredString(against.strandId, 'against.strandId'),
      ceiling: againstCeiling,
    };
  }
  throw new QueryError('against must be base, live, or { kind: "strand", strandId }', {
    code: 'invalid_coordinate',
  });
}

function normalizeIntoSelector(
  normalizedStrandId: string,
  into: PlanTransferInto,
  intoCeiling: number | null,
): CoordinateTransferPlanSelectorInput {
  if (into === 'base') {
    return { kind: 'strand_base', strandId: normalizedStrandId, ceiling: intoCeiling };
  }
  if (into === 'live') {
    return { kind: 'live', ceiling: intoCeiling };
  }
  if (isStrandLiteralKind(into)) {
    return {
      kind: 'strand',
      strandId: normalizeRequiredString(into.strandId, 'into.strandId'),
      ceiling: intoCeiling,
    };
  }
  throw new QueryError('into must be base, live, or { kind: "strand", strandId }', {
    code: 'invalid_coordinate',
  });
}

// ── Blob reading ─────────────────────────────────────────────────────

async function readContentBlobByOid(graph: ComparisonHost, oid: string): Promise<Uint8Array> {
  const buf = (graph._blobStorage !== null && graph._blobStorage !== undefined)
    ? await graph._blobStorage.retrieve(oid)
    : await graph._persistence.readBlob(oid);
  if (!(buf instanceof Uint8Array)) {
    throw new QueryError(`content blob '${oid}' is missing from the object store`, {
      code: 'invalid_coordinate', context: { oid },
    });
  }
  return buf;
}

// ── Core comparison ──────────────────────────────────────────────────

function extractComparisonInputs(options: CompareCoordinatesOptions): {
  normalizedLeft: NormalizedSelector;
  normalizedRight: NormalizedSelector;
  targetId: string | null;
  scope: VisibleStateScope | null;
} {
  return {
    normalizedLeft: normalizeSelector(options.left, 'left'),
    normalizedRight: normalizeSelector(options.right, 'right'),
    targetId: normalizeOptionalString(options.targetId, 'targetId'),
    scope: normalizeVisibleStateScope(options.scope, 'scope'),
  };
}

export async function compareCoordinatesImpl(
  graph: ComparisonHost,
  selectorContext: ComparisonSelectorContext,
  options: CompareCoordinatesOptions,
): Promise<CoordinateComparison> {
  assertRequiredOptions(options, 'compareCoordinates()');
  const { normalizedLeft, normalizedRight, targetId, scope } = extractComparisonInputs(options);

  const liveFrontier = (normalizedLeft.kind === 'live' || normalizedRight.kind === 'live')
    ? await selectorContext.coordinateReader.liveFrontier()
    : null;
  const left = await normalizedLeft.resolve(selectorContext, scope, liveFrontier);
  const right = await normalizedRight.resolve(selectorContext, scope, liveFrontier);
  const visiblePatchDivergence = buildPatchDivergenceImpl(left.patchEntries, right.patchEntries, targetId);
  const visibleState = compareVisibleState(left.state, right.state, { targetId });

  const fact = buildCoordinateComparisonFact({
    comparisonVersion: COORDINATE_COMPARISON_VERSION,
    ...(scope !== null && scope !== undefined ? { scope } : {}),
    left: { requested: left.requested, resolved: left.resolved },
    right: { requested: right.requested, resolved: right.resolved },
    visiblePatchDivergence,
    visibleState,
  });
  const digest = await computeChecksum(fact, graph._crypto);
  return {
    comparisonVersion: COORDINATE_COMPARISON_VERSION,
    comparisonDigest: digest,
    ...(scope !== null && scope !== undefined ? { scope } : {}),
    left: { requested: left.requested, resolved: left.resolved },
    right: { requested: right.requested, resolved: right.resolved },
    visiblePatchDivergence,
    visibleState,
  };
}

export async function compareStrandImpl(
  graph: ComparisonHost,
  selectorContext: ComparisonSelectorContext,
  strandId: string,
  options: CompareStrandOptions = {},
): Promise<CoordinateComparison> {
  assertOptionsObject(options, 'compareStrand()');
  const normalizedStrandId = normalizeRequiredString(strandId, 'strandId');
  const ceiling = normalizeLamportCeiling(options.ceiling, 'ceiling');
  const againstCeiling = normalizeLamportCeiling(options.againstCeiling, 'againstCeiling');
  const targetId = normalizeOptionalString(options.targetId, 'targetId');
  const scope = normalizeVisibleStateScope(options.scope, 'scope');

  const left: CoordinateComparisonSelectorInput = { kind: 'strand', strandId: normalizedStrandId, ceiling };
  const right = normalizeAgainstSelector(normalizedStrandId, options.against ?? 'base', againstCeiling);

  return await compareCoordinatesImpl(graph, selectorContext, {
    left,
    right,
    targetId,
    ...(scope ? { scope } : {}),
  });
}

// ── Transfer planning ────────────────────────────────────────────────

async function finalizeTransferPlan(params: {
  graph: ComparisonHost;
  sourceSide: ResolvedComparisonSide;
  targetSide: ResolvedComparisonSide;
  transfer: Awaited<ReturnType<typeof planVisibleStateTransfer>>;
  comparisonDigest: string;
  scope: VisibleStateScope | null;
}): Promise<CoordinateTransferPlan> {
  const { graph, sourceSide, targetSide, transfer, comparisonDigest, scope } = params;
  const changed = transfer.summary.opCount > 0;
  const sides = {
    source: { requested: sourceSide.requested, resolved: sourceSide.resolved },
    target: { requested: targetSide.requested, resolved: targetSide.resolved },
  };
  const fact = buildCoordinateTransferPlanFact({
    transferVersion: COORDINATE_TRANSFER_PLAN_VERSION, comparisonDigest,
    ...(scope ? { scope } : {}), changed, ...sides,
    summary: transfer.summary, ops: transfer.ops,
  });
  const digest = await computeChecksum(fact, graph._crypto);
  return {
    transferVersion: COORDINATE_TRANSFER_PLAN_VERSION,
    transferDigest: digest,
    comparisonDigest,
    changed,
    ...sides,
    summary: transfer.summary,
    ops: transfer.ops,
    ...(scope ? { scope } : {}),
  };
}

export async function planCoordinateTransferImpl(
  graph: ComparisonHost,
  selectorContext: ComparisonSelectorContext,
  options: PlanCoordinateTransferOptions,
): Promise<CoordinateTransferPlan> {
  assertRequiredOptions(options, 'planCoordinateTransfer()');
  const normalizedSource = normalizeSelector(options.source, 'source');
  const normalizedTarget = normalizeSelector(options.target, 'target');
  const scope = normalizeVisibleStateScope(options.scope, 'scope');
  const liveFrontier = (normalizedSource.kind === 'live' || normalizedTarget.kind === 'live')
    ? await selectorContext.coordinateReader.liveFrontier()
    : null;
  const comp = await compareCoordinatesImpl(graph, selectorContext, {
    left: options.source,
    right: options.target,
    ...(scope !== null && scope !== undefined ? { scope } : {}),
  });
  const sourceSide = await normalizedSource.resolve(selectorContext, scope, liveFrontier);
  const targetSide = await normalizedTarget.resolve(selectorContext, scope, liveFrontier);
  const loadNodeContent = async (_nodeId: string, meta: { oid: string }) =>
    await readContentBlobByOid(graph, meta.oid);
  const loadEdgeContent = async (
    _edge: { from: string; to: string; label: string },
    meta: { oid: string },
  ) =>
    await readContentBlobByOid(graph, meta.oid);
  const transfer = await planVisibleStateTransfer(
    createStateReader(sourceSide.state),
    createStateReader(targetSide.state),
    { loadNodeContent, loadEdgeContent },
  );
  return await finalizeTransferPlan({
    graph, sourceSide, targetSide, transfer,
    comparisonDigest: comp.comparisonDigest, scope,
  });
}

export async function planStrandTransferImpl(
  graph: ComparisonHost,
  selectorContext: ComparisonSelectorContext,
  strandId: string,
  options: PlanStrandTransferOptions = {},
): Promise<CoordinateTransferPlan> {
  assertOptionsObject(options, 'planStrandTransfer()');
  const normalizedStrandId = normalizeRequiredString(strandId, 'strandId');
  const ceiling = normalizeLamportCeiling(options.ceiling, 'ceiling');
  const intoCeiling = normalizeLamportCeiling(options.intoCeiling, 'intoCeiling');
  const scope = normalizeVisibleStateScope(options.scope, 'scope');

  const source: CoordinateTransferPlanSelectorInput = { kind: 'strand', strandId: normalizedStrandId, ceiling };
  const target = normalizeIntoSelector(normalizedStrandId, options.into ?? 'live', intoCeiling);

  return await planCoordinateTransferImpl(graph, selectorContext, {
    source,
    target,
    ...(scope ? { scope } : {}),
  });
}
