import QueryError from '../../errors/QueryError.ts';
import { computeChecksum } from '../../utils/checksumUtils.ts';
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
  CoordinateComparisonSide,
} from '../../types/CoordinateComparison.ts';
import type { StrandDescriptor } from '../../types/StrandDescriptor.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';

export type PatchEntry = { patch: Patch; sha: string };

type ComparisonMaterializedState = {
  state: WarpState;
};

/**
 * Materialize options for the coordinate materialization path.
 *
 * This mirrors the options accepted by the WarpRuntime materialize
 * controller: a frontier record and an optional lamport ceiling.
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

export type MaterializeStrandOptions = {
  ceiling?: number | null;
};

/**
 * Host surface still required by transfer planning and full strand overlay
 * comparison. Coordinate-backed selector resolution uses
 * ComparisonCoordinateSideReadPort instead.
 */
export type ComparisonHost = ComparisonDigestHost & {
  _blobStorage: { retrieve(oid: string): Promise<Uint8Array> } | null;
  _persistence: { readBlob(oid: string): Promise<Uint8Array> };
  _materializeStrandGraph(strandId: string, options?: MaterializeStrandOptions): Promise<ComparisonMaterializedState>;
};

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

export async function computeStateHashForGraph(graph: ComparisonDigestHost, state: WarpState): Promise<string> {
  if (graph._stateHashService) {
    return await graph._stateHashService.compute(state);
  }
  return await computeStateHash(state, { crypto: graph._crypto, codec: graph._codec });
}

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

type FinalizeSideParams = {
  requested: ComparisonRequestedSide;
  state: WarpState;
  patchEntries: readonly PatchEntry[];
  coordinateKind: 'frontier' | 'strand' | 'strand_base';
  lamportCeiling: number | null;
  strand?: StrandComparisonMetadata;
};

type ScopedFinalizedSide = {
  state: WarpState;
  patchEntries: readonly PatchEntry[];
  patchFrontier: Record<string, string>;
  lamportFrontier: Record<string, number>;
  stateHash: string;
  patchShas: readonly string[];
};

export async function finalizeSide(
  graph: ComparisonDigestHost,
  params: FinalizeSideParams,
  scope: VisibleStateScope | null,
): Promise<ResolvedComparisonSide> {
  const scoped = await scopedFinalizedSide(graph, params, scope);
  const resolved = await buildResolvedPayload(graph, params, scoped);

  return new ResolvedComparisonSide({
    requested: params.requested,
    state: scoped.state,
    patchEntries: [...scoped.patchEntries],
    resolved,
  });
}

async function scopedFinalizedSide(
  graph: ComparisonDigestHost,
  params: FinalizeSideParams,
  scope: VisibleStateScope | null,
): Promise<ScopedFinalizedSide> {
  const scopedState = scopeMaterializedState(params.state, scope);
  const scopedPatchEntries = scopePatchEntries([...params.patchEntries], scope);
  return {
    state: scopedState,
    patchEntries: scopedPatchEntries,
    patchFrontier: patchFrontierFromEntries(scopedPatchEntries),
    lamportFrontier: lamportFrontierFromEntries(scopedPatchEntries),
    stateHash: await computeStateHashForGraph(graph, scopedState),
    patchShas: uniqueSortedPatchShas(scopedPatchEntries),
  };
}

async function buildResolvedPayload(
  graph: ComparisonDigestHost,
  params: FinalizeSideParams,
  scoped: ScopedFinalizedSide,
): Promise<ComparisonResolvedSide> {
  const reader = createStateReader(scoped.state);
  return {
    coordinateKind: params.coordinateKind,
    patchFrontier: scoped.patchFrontier,
    patchFrontierDigest: await computeChecksum(scoped.patchFrontier, graph._crypto),
    lamportFrontier: scoped.lamportFrontier,
    lamportFrontierDigest: await computeChecksum(scoped.lamportFrontier, graph._crypto),
    lamportCeiling: params.lamportCeiling,
    stateHash: scoped.stateHash,
    patchUniverseDigest: await computeChecksum({ patches: scoped.patchShas }, graph._crypto),
    summary: summarizeVisibleState(reader, scoped.patchEntries.length),
    ...(params.strand !== undefined ? { strand: params.strand } : {}),
  };
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
