/**
 * ComparisonSelector — validated comparison selector hierarchy and
 * frontier normalization utilities.
 *
 * Each selector subclass implements `resolve()` with the resolution
 * logic for its kind (live, coordinate, strand, strand_base),
 * eliminating dispatch switches.
 *
 * @module domain/services/controllers/ComparisonSelector
 */

import QueryError from '../../errors/QueryError.ts';
import { computeChecksum } from '../../utils/checksumUtils.ts';
import { callInternalRuntimeMethod } from '../../utils/callInternalRuntimeMethod.ts';
import createStrandCoordinator from '../strand/createStrandCoordinator.ts';
import { createStateReader } from '../state/StateReader.ts';
import { computeStateHash } from '../state/StateSerializer.ts';
import {
  scopeMaterializedState,
  scopePatchEntries,
} from '../VisibleStateScope.ts';
import type { WarpState } from '../JoinReducer.ts';
import type Patch from '../../types/Patch.ts';
import type CodecPort from '../../../ports/CodecPort.ts';

import type {
  VisibleStateScope,
  CoordinateComparisonSelectorInput,
  CoordinateComparisonSide,
} from '../../types/CoordinateComparison.ts';
import type {
  ComparisonCoordinateSideReadPort,
} from './ComparisonCoordinateSideReadPort.ts';
import type ComparisonSideFinalizer from './ComparisonSideFinalizerPort.ts';
import type { StrandDescriptor } from '../../types/StrandDescriptor.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';

// ── Shared types ─────────────────────────────────────────────────────

export type PatchEntry = { patch: Patch; sha: string };
type ComparisonMaterializedState = {
  state: WarpState;
};

/**
 * Materialize options for the coordinate materialization path.
 *
 * This mirrors the options accepted by the WarpRuntime materialize
 * controller — a frontier record and an optional lamport ceiling.
 */
export type MaterializeCoordinateOptions = {
  frontier: Map<string, string>;
  ceiling?: number | null;
};

export type ComparisonDigestHost = {
  _crypto: CryptoPort;
  _codec: CodecPort;
  _stateHashService: { compute(state: WarpState): Promise<string> } | null;
};

export type ComparisonPatchEntrySource = {
  _loadPatchChainFromSha(sha: string): Promise<PatchEntry[]>;
};

export type ComparisonCoordinateSideReadSource = ComparisonPatchEntrySource & {
  getFrontier(): Promise<Map<string, string>>;
  _materializeCoordinateGraph(opts: MaterializeCoordinateOptions): Promise<ComparisonMaterializedState>;
};

/**
 * Host surface still required by transfer planning and full strand overlay
 * comparison. Coordinate-backed selector resolution uses
 * ComparisonCoordinateSideReadPort instead.
 */
export type ComparisonHost = ComparisonDigestHost & {
  _blobStorage: { retrieve(oid: string): Promise<Uint8Array> } | null;
  _persistence: { readBlob(oid: string): Promise<Uint8Array> };
};

export type ComparisonSelectorContext = {
  readonly coordinateReader: ComparisonCoordinateSideReadPort;
  readonly sideFinalizer: ComparisonSideFinalizer;
  readonly strandGraph: ComparisonHost;
};

// ── Requested-side shapes ────────────────────────────────────────────

/**
 * The `requested` payload captured for each resolved comparison side,
 * discriminated by selector kind. Carries enough context to replay the
 * resolution deterministically and to show back to the caller.
 */
export type ComparisonRequestedSide =
  | { kind: 'live'; ceiling?: number | null }
  | { kind: 'coordinate'; frontier: Record<string, string>; ceiling: number | null }
  | { kind: 'strand'; strandId: string; ceiling?: number | null }
  | {
      kind: 'strand_base';
      strandId: string;
      frontier: Record<string, string>;
      baseLamportCeiling: number | null;
      ceiling?: number | null;
    };

/** Strand metadata attached to a strand-kind resolved side. */
export type StrandComparisonMetadata = NonNullable<CoordinateComparisonSide['resolved']['strand']>;

/** Resolved payload shape for a finalized comparison side. */
export type ComparisonResolvedSide = CoordinateComparisonSide['resolved'];

// ── Helpers ──────────────────────────────────────────────────────────

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normalizeLamportCeiling(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) { return null; }
  assertValidLamport(value, field);
  return value;
}

function assertValidLamport(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new QueryError(`${field} must be a non-negative integer or null`, {
      code: 'invalid_coordinate', context: { field, value },
    });
  }
}

export function normalizeOptionalString(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null) { return null; }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryError(`${field} must be a non-empty string when provided`, {
      code: 'invalid_coordinate', context: { field, valueType: typeof value },
    });
  }
  return value.trim();
}

export function normalizeRequiredString(
  value: string | null | undefined,
  field: string,
): string {
  const normalized = normalizeOptionalString(value, field);
  if (normalized === null) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: 'invalid_coordinate', context: { field },
    });
  }
  return normalized;
}

function frontierEntries(
  frontier: Map<string, string> | Record<string, string>,
): Array<[string, string]> {
  if (frontier instanceof Map) { return [...frontier.entries()]; }
  return Object.entries(frontier);
}

function assertFrontierEntry(writerId: string, sha: string, field: string): void {
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new QueryError(`${field} contains an invalid writer id`, {
      code: 'invalid_coordinate', context: { field, writerId },
    });
  }
  if (typeof sha !== 'string' || sha.length === 0) {
    throw new QueryError(`${field} contains an invalid patch sha`, {
      code: 'invalid_coordinate', context: { field, writerId, shaType: typeof sha },
    });
  }
}

export function normalizeFrontierRecord(
  frontier: Map<string, string> | Record<string, string>,
  field: string,
): Record<string, string> {
  if (frontier === null || frontier === undefined
      || (typeof frontier !== 'object')) {
    throw new QueryError(`${field} must be a frontier map or record`, {
      code: 'invalid_coordinate', context: { field },
    });
  }
  const entries = frontierEntries(frontier);
  const record: Record<string, string> = {};
  for (const [writerId, sha] of entries.sort(([a], [b]) => compareStrings(a, b))) {
    assertFrontierEntry(writerId, sha, field);
    record[writerId] = sha;
  }
  return record;
}

export function frontierRecordToMap(frontierRecord: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(frontierRecord).sort(([a], [b]) => compareStrings(a, b)));
}

export function optionalCeiling(ceiling: number | null): Record<string, number> {
  return ceiling === null ? {} : { ceiling };
}

export function combineCeilings(left: number | null, right: number | null): number | null {
  if (left === null) { return right; }
  if (right === null) { return left; }
  return Math.min(left, right);
}

export function buildCoordinateRequest(
  frontierRecord: Record<string, string>,
  ceiling: number | null,
): { frontier: Record<string, string>; ceiling: number | null } {
  return { frontier: { ...frontierRecord }, ceiling };
}

// ── Frontier analysis ────────────────────────────────────────────────

function updateWriterHighestPatch(
  byWriter: Map<string, { lamport: number; sha: string }>,
  writerId: string,
  patchInfo: { lamport: number; sha: string },
): void {
  const current = byWriter.get(writerId);
  const isNewer = !current || patchInfo.lamport > current.lamport ||
    (patchInfo.lamport === current.lamport && compareStrings(patchInfo.sha, current.sha) > 0);
  if (isNewer) { byWriter.set(writerId, patchInfo); }
}

export function patchFrontierFromEntries(entries: readonly PatchEntry[]): Record<string, string> {
  const byWriter = new Map<string, { lamport: number; sha: string }>();
  for (const entry of entries) {
    updateWriterHighestPatch(byWriter, entry.patch.writer, {
      lamport: entry.patch.lamport ?? 0, sha: entry.sha,
    });
  }
  const sorted = [...byWriter.entries()].sort(([a], [b]) => compareStrings(a, b));
  const record: Record<string, string> = {};
  for (const [writerId, info] of sorted) { record[writerId] = info.sha; }
  return record;
}

export function lamportFrontierFromEntries(entries: readonly PatchEntry[]): Record<string, number> {
  const byWriter = new Map<string, number>();
  for (const entry of entries) {
    const lamport = entry.patch.lamport ?? 0;
    const current = byWriter.get(entry.patch.writer);
    if (current === undefined || lamport > current) { byWriter.set(entry.patch.writer, lamport); }
  }
  return Object.fromEntries([...byWriter.entries()].sort(([a], [b]) => compareStrings(a, b)));
}

export function uniqueSortedPatchShas(entries: readonly PatchEntry[]): string[] {
  return [...new Set(entries.map(({ sha }) => sha))].sort(compareStrings);
}

// ── Patch collection ─────────────────────────────────────────────────

async function collectWriterEntries(
  graph: ComparisonPatchEntrySource,
  params: { tipSha: string; ceiling: number | null },
): Promise<PatchEntry[]> {
  const entries: PatchEntry[] = [];
  const writerEntries = await graph._loadPatchChainFromSha(params.tipSha);
  for (const entry of writerEntries) {
    if (params.ceiling === null || (entry.patch.lamport ?? 0) <= params.ceiling) {
      entries.push(entry);
    }
  }
  return entries;
}

export async function collectPatchEntriesForFrontier(
  graph: ComparisonPatchEntrySource,
  frontierRecord: Record<string, string>,
  ceiling: number | null,
): Promise<PatchEntry[]> {
  const frontier = frontierRecordToMap(frontierRecord);
  const results: PatchEntry[][] = [];
  for (const tipSha of frontier.values()) {
    if (tipSha) { results.push(await collectWriterEntries(graph, { tipSha, ceiling })); }
  }
  return results.flat();
}

// ── Strand metadata ──────────────────────────────────────────────────

export function buildStrandMetadata(
  strandId: string,
  descriptor: StrandDescriptor,
): StrandComparisonMetadata {
  const readOverlays = descriptor.braid?.readOverlays ?? [];
  return {
    strandId,
    baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
    overlayHeadPatchSha: descriptor.overlay.headPatchSha,
    overlayPatchCount: descriptor.overlay.patchCount,
    overlayWritable: descriptor.overlay.writable ?? true,
    braid: {
      readOverlayCount: readOverlays.length,
      braidedStrandIds: readOverlays.map((o: { strandId: string }) => o.strandId).sort(compareStrings),
    },
  };
}

// ── State hash ───────────────────────────────────────────────────────

export async function computeStateHashForGraph(graph: ComparisonDigestHost, state: WarpState): Promise<string> {
  if (graph._stateHashService) {
    return await graph._stateHashService.compute(state);
  }
  return await computeStateHash(state, { crypto: graph._crypto, codec: graph._codec });
}

// ── ResolvedComparisonSide ───────────────────────────────────────────

export class ResolvedComparisonSide {
  readonly requested: ComparisonRequestedSide;
  readonly resolved: ComparisonResolvedSide;
  readonly state: WarpState;
  readonly patchEntries: PatchEntry[];

  constructor(params: {
    requested: ComparisonRequestedSide;
    state: WarpState;
    patchEntries: readonly PatchEntry[];
    resolved: ComparisonResolvedSide;
  }) {
    this.requested = params.requested;
    this.resolved = params.resolved;
    this.state = params.state;
    this.patchEntries = [...params.patchEntries];
    Object.freeze(this);
  }
}

// ── finalizeSide ─────────────────────────────────────────────────────

export async function finalizeSide(
  graph: ComparisonDigestHost,
  params: {
    requested: ComparisonRequestedSide;
    state: WarpState;
    patchEntries: readonly PatchEntry[];
    coordinateKind: 'frontier' | 'strand' | 'strand_base';
    lamportCeiling: number | null;
    strand?: StrandComparisonMetadata;
  },
  scope: VisibleStateScope | null,
): Promise<ResolvedComparisonSide> {
  const scopedState = scopeMaterializedState(params.state, scope);
  const scopedPatchEntries = scopePatchEntries([...params.patchEntries], scope);
  const visiblePatchFrontier = patchFrontierFromEntries(scopedPatchEntries);
  const visibleLamportFrontier = lamportFrontierFromEntries(scopedPatchEntries);
  const reader = createStateReader(scopedState);
  const stateHash = await computeStateHashForGraph(graph, scopedState);
  const patchShas = uniqueSortedPatchShas(scopedPatchEntries);

  return new ResolvedComparisonSide({
    requested: params.requested,
    state: scopedState,
    patchEntries: [...scopedPatchEntries],
    resolved: {
      coordinateKind: params.coordinateKind,
      patchFrontier: visiblePatchFrontier,
      patchFrontierDigest: await computeChecksum(visiblePatchFrontier, graph._crypto),
      lamportFrontier: visibleLamportFrontier,
      lamportFrontierDigest: await computeChecksum(visibleLamportFrontier, graph._crypto),
      lamportCeiling: params.lamportCeiling,
      stateHash,
      patchUniverseDigest: await computeChecksum({ patches: patchShas }, graph._crypto),
      summary: summarizeVisibleState(reader, scopedPatchEntries.length),
      ...(params.strand !== undefined ? { strand: params.strand } : {}),
    },
  });
}

function summarizeVisibleState(reader: ReturnType<typeof createStateReader>, patchCount: number) {
  const nodes = reader.getNodes();
  const edges = reader.getEdges();
  let nodePropertyCount = 0;
  for (const nodeId of nodes) {
    nodePropertyCount += Object.keys(reader.getNodeProps(nodeId) ?? {}).length;
  }
  let edgePropertyCount = 0;
  for (const edge of edges) {
    edgePropertyCount += Object.keys(edge.props ?? {}).length;
  }
  return { nodeCount: nodes.length, edgeCount: edges.length, nodePropertyCount, edgePropertyCount, patchCount };
}

// ── Selector hierarchy ───────────────────────────────────────────────

export abstract class NormalizedSelector {
  readonly kind: 'live' | 'coordinate' | 'strand' | 'strand_base';
  readonly ceiling: number | null;

  constructor(
    kind: 'live' | 'coordinate' | 'strand' | 'strand_base',
    ceiling: number | null,
  ) {
    this.kind = kind;
    this.ceiling = ceiling;
  }

  abstract resolve(
    context: ComparisonSelectorContext,
    scope: VisibleStateScope | null,
    liveFrontier: Map<string, string> | null,
  ): Promise<ResolvedComparisonSide>;
}

export class LiveComparisonSelector extends NormalizedSelector {
  constructor(ceiling: number | null) { super('live', ceiling); }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null, liveFrontier: Map<string, string> | null) {
    const frontier = liveFrontier ?? await context.coordinateReader.liveFrontier();
    const read = await context.coordinateReader.readLiveSide({
      frontier,
      ceiling: this.ceiling,
    });
    return await context.sideFinalizer.finalize(read, scope);
  }
}

export class CoordinateComparisonSelector extends NormalizedSelector {
  readonly frontier: Record<string, string>;

  constructor(frontier: Record<string, string>, ceiling: number | null) {
    super('coordinate', ceiling);
    this.frontier = frontier;
  }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null) {
    const read = await context.coordinateReader.readCoordinateSide({
      frontier: this.frontier,
      ceiling: this.ceiling,
    });
    return await context.sideFinalizer.finalize(read, scope);
  }
}

/**
 * Assertion narrowing ComparisonHost to the strand coordinator's
 * parameter type.
 *
 * ComparisonHost is the structural subset of WarpRuntime that
 * comparison needs. The strand coordinator's parameter type
 * (exported only by inference) wants a wider WarpRuntime surface.
 * At runtime WarpRuntime is passed (it satisfies both), so the
 * assertion narrows the type without a value-level cast.
 */
function assertStrandCoordinatorHost(
  graph: ComparisonHost,
): asserts graph is ComparisonHost & Parameters<typeof createStrandCoordinator>[0] {
  void graph;
}

/**
 * Helper: obtain a strand coordinator for a ComparisonHost.
 */
function strandCoordinatorFor(graph: ComparisonHost): ReturnType<typeof createStrandCoordinator> {
  assertStrandCoordinatorHost(graph);
  return createStrandCoordinator(graph);
}

export class StrandComparisonSelector extends NormalizedSelector {
  readonly strandId: string;

  constructor(strandId: string, ceiling: number | null) {
    super('strand', ceiling);
    this.strandId = strandId;
  }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null) {
    const graph = context.strandGraph;
    const strands = strandCoordinatorFor(graph);
    const descriptor = await strands.getOrThrow(this.strandId);
    const state = await callInternalRuntimeMethod<WarpState>(
      graph, 'materializeStrand', this.strandId,
      this.ceiling === null ? undefined : { ceiling: this.ceiling },
    );
    const patchEntries = await strands.getPatchEntries(
      this.strandId, this.ceiling === null ? undefined : { ceiling: this.ceiling },
    );
    return await finalizeSide(graph, {
      requested: { kind: 'strand', strandId: this.strandId, ...optionalCeiling(this.ceiling) },
      state, patchEntries, coordinateKind: 'strand', lamportCeiling: this.ceiling,
      strand: buildStrandMetadata(this.strandId, descriptor),
    }, scope);
  }
}

export class StrandBaseComparisonSelector extends NormalizedSelector {
  readonly strandId: string;

  constructor(strandId: string, ceiling: number | null) {
    super('strand_base', ceiling);
    this.strandId = strandId;
  }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null) {
    const read = await context.coordinateReader.readStrandBaseSide({
      strandId: this.strandId,
      ceiling: this.ceiling,
    });
    return await context.sideFinalizer.finalize(read, scope);
  }
}

// ── Selector normalization ───────────────────────────────────────────

export function normalizeSelector(
  selector: CoordinateComparisonSelectorInput,
  field: string,
): NormalizedSelector {
  if (selector === null || selector === undefined || typeof selector !== 'object') {
    throw new QueryError(`${field} must be a selector object`, {
      code: 'invalid_coordinate', context: { field },
    });
  }
  const { kind } = selector;
  if (kind === 'live') {
    return new LiveComparisonSelector(normalizeLamportCeiling(selector.ceiling, `${field}.ceiling`));
  }
  if (kind === 'coordinate') {
    return new CoordinateComparisonSelector(
      normalizeFrontierRecord(selector.frontier, `${field}.frontier`),
      normalizeLamportCeiling(selector.ceiling, `${field}.ceiling`),
    );
  }
  if (kind === 'strand' || kind === 'strand_base') {
    const strandId = normalizeRequiredString(selector.strandId, `${field}.strandId`);
    const ceiling = normalizeLamportCeiling(selector.ceiling, `${field}.ceiling`);
    return kind === 'strand_base'
      ? new StrandBaseComparisonSelector(strandId, ceiling)
      : new StrandComparisonSelector(strandId, ceiling);
  }
  throw new QueryError(`${field}.kind is unsupported`, { code: 'invalid_coordinate', context: { field, kind } });
}
