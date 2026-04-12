/**
 * ConflictFrameLoader — loads and prepares patch frames for conflict analysis.
 *
 * Owns frontier/strand context resolution, patch frame construction,
 * reducer replay for receipt attachment, and scan-window budgeting.
 *
 * @module domain/services/strand/ConflictFrameLoader
 */

import VersionVector from '../../crdt/VersionVector.ts';
import ConflictAnchor from '../../types/conflict/ConflictAnchor.ts';
import ConflictDiagnostic from '../../types/conflict/ConflictDiagnostic.ts';
import ConflictResolvedCoordinate from '../../types/conflict/ConflictResolvedCoordinate.ts';
import { compareStrings } from '../../types/conflict/validation.ts';
import { reduceV5 } from '../JoinReducer.ts';
import createStrandCoordinator from './createStrandCoordinator.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type Patch from '../../types/Patch.ts';
import type ConflictAnalysisRequest from './ConflictAnalysisRequest.ts';


// ── Constants re-exported for caller convenience ────────────────────

export const CONFLICT_ANALYSIS_VERSION = 'conflict-analyzer/v2';
export const CONFLICT_TRAVERSAL_ORDER = 'lamport_desc_writer_desc_patch_desc';
export const CONFLICT_TRUNCATION_POLICY = 'scan_budget_max_patches_reverse_causal';

// ── PatchFrame ──────────────────────────────────────────────────────

/**
 * A loaded patch with its receipt and causal context.
 *
 * Not frozen — `receipt` is mutated by `attachReceipts` after construction.
 */
export class PatchFrame {
  patch: Patch;
  sha: string;
  patchOrder: number;
  context: Map<string, number>;
  receipt: TickReceipt;

  constructor({
    patch,
    sha,
    patchOrder,
    context,
    receipt,
  }: {
    patch: Patch;
    sha: string;
    patchOrder: number;
    context: Map<string, number>;
    receipt?: TickReceipt;
  }) {
    this.patch = patch;
    this.sha = sha;
    this.patchOrder = patchOrder;
    this.context = context;
    this.receipt = receipt ?? emptyReceipt();
  }
}

// ── Comparison helpers ──────────────────────────────────────────────

function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : (a < b ? -1 : 1);
}

function safeLamport(frame: PatchFrame): number {
  return frame.patch.lamport ?? 0;
}

function safeWriter(frame: PatchFrame): string {
  return frame.patch.writer ?? '';
}

function compareByLamportThenWriterThenSha(first: PatchFrame, second: PatchFrame): number {
  const lamportCmp = compareNumbers(safeLamport(first), safeLamport(second));
  if (lamportCmp !== 0) {
    return lamportCmp;
  }
  const writerCmp = compareStrings(safeWriter(first), safeWriter(second));
  return writerCmp !== 0 ? writerCmp : compareStrings(first.sha, second.sha);
}

function comparePatchFramesReverseCausal(a: PatchFrame, b: PatchFrame): number {
  return compareByLamportThenWriterThenSha(b, a);
}

// ── Context normalization ───────────────────────────────────────────

function normalizeContext(
  context: VersionVector | Map<string, number> | Record<string, number> | undefined | null,
): Map<string, number> {
  if (context instanceof VersionVector || context instanceof Map) {
    return new Map(context);
  }
  return normalizeContextFromValue(context);
}

function normalizeContextFromValue(context: Record<string, number> | undefined | null): Map<string, number> {
  if (context === null || context === undefined || typeof context !== 'object') {
    return new Map();
  }
  return buildContextMapFromEntries(context);
}

function buildContextMapFromEntries(obj: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [writerId, value] of Object.entries(obj)) {
    if (Number.isInteger(value) && value >= 0) {
      map.set(writerId, value);
    }
  }
  return map;
}

// ── Frontier helpers ────────────────────────────────────────────────

function frontierToRecord(frontier: Map<string, string>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [writerId, sha] of [...frontier.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    record[writerId] = sha;
  }
  return record;
}

function describeLamportCeiling(lamportCeiling: number | null): string {
  return lamportCeiling === null ? 'head' : String(lamportCeiling);
}

// ── Frame construction ──────────────────────────────────────────────

function emptyReceipt(): TickReceipt {
  return { patchSha: '', writer: '', lamport: 0, ops: [] } as unknown as TickReceipt;
}

function buildPatchFrames(entries: Array<{ patch: Patch; sha: string }>): PatchFrame[] {
  return entries.map((entry, i) => new PatchFrame({
    patch: entry.patch,
    sha: entry.sha,
    patchOrder: i,
    context: normalizeContext(entry.patch.context as Record<string, number> | undefined | null),
  }));
}

// ── Receipt attachment ──────────────────────────────────────────────

/**
 * Replays all patches through the reducer and attaches the resulting receipts to each frame.
 */
export function attachReceipts(patchFrames: PatchFrame[]): void {
  const reduced = reduceV5(
    patchFrames.map(({ patch, sha }) => ({ patch, sha })) as Parameters<typeof reduceV5>[0],
    undefined,
    { receipts: true },
  ) as { receipts: TickReceipt[] };
  for (let i = 0; i < patchFrames.length; i++) {
    const frame = patchFrames[i];
    const receipt = reduced.receipts[i];
    if (frame !== undefined && receipt !== undefined) {
      frame.receipt = receipt;
    }
  }
}

// ── Scan window ─────────────────────────────────────────────────────

function emitTruncationDiagnostic(
  diagnostics: ConflictDiagnostic[],
  {
    scannedFrames,
    maxPatches,
    lamportCeiling,
  }: {
    scannedFrames: PatchFrame[];
    maxPatches: number | null;
    lamportCeiling: number | null;
  },
): void {
  const lastScanned = scannedFrames[scannedFrames.length - 1];
  if (lastScanned === null || lastScanned === undefined) {
    return;
  }
  diagnostics.push(new ConflictDiagnostic({
    code: 'budget_truncated',
    message: `Conflict analysis truncated to ${String(maxPatches)} patches at ceiling ${describeLamportCeiling(lamportCeiling)}`,
    severity: 'warning',
    data: {
      traversalOrder: CONFLICT_TRAVERSAL_ORDER,
      scannedPatchCount: scannedFrames.length,
      lastScannedAnchor: ConflictAnchor.fromFrame(lastScanned),
    },
  }));
}

/**
 * A scan window over patch frames with reverse-causal ordering and budget truncation.
 */
export class ScanWindow {
  readonly reverseCausalFrames: PatchFrame[];
  readonly scannedFrames: PatchFrame[];
  readonly truncated: boolean;
  readonly scannedPatchShas: Set<string>;

  constructor({
    patchFrames,
    maxPatches,
    lamportCeiling,
    diagnostics,
  }: {
    patchFrames: PatchFrame[];
    maxPatches: number | null;
    lamportCeiling: number | null;
    diagnostics: ConflictDiagnostic[];
  }) {
    this.reverseCausalFrames = [...patchFrames].sort(comparePatchFramesReverseCausal);
    this.scannedFrames = maxPatches === null
      ? this.reverseCausalFrames
      : this.reverseCausalFrames.slice(0, maxPatches);
    this.truncated = maxPatches !== null && this.reverseCausalFrames.length > maxPatches;
    this.scannedPatchShas = new Set(this.scannedFrames.map((frame) => frame.sha));
    if (this.truncated) {
      emitTruncationDiagnostic(diagnostics, { scannedFrames: this.scannedFrames, maxPatches, lamportCeiling });
    }
    Object.freeze(this);
  }
}

// ── Coordinate building ─────────────────────────────────────────────

type ResolvedStrandDescriptor = {
  strandId: string;
  baseObservation: { lamportCeiling: number | null };
  overlay: { headPatchSha: string | null; patchCount: number; writable: boolean };
  braid: { readOverlays: Array<{ strandId: string }> };
};

function buildResolvedStrandMetadata(descriptor: ResolvedStrandDescriptor): Record<string, unknown> {
  return {
    strandId: descriptor.strandId,
    baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
    overlayHeadPatchSha: descriptor.overlay.headPatchSha,
    overlayPatchCount: descriptor.overlay.patchCount,
    overlayWritable: descriptor.overlay.writable,
    braid: {
      readOverlayCount: descriptor.braid.readOverlays.length,
      braidedStrandIds: descriptor.braid.readOverlays
        .map((overlay) => overlay.strandId)
        .sort(compareStrings),
    },
  };
}

function buildResolvedCoordinate({
  frontier,
  lamportCeiling,
  maxPatches,
  frontierDigest,
  coordinateKind = 'frontier',
  strand,
}: {
  frontier: Map<string, string>;
  lamportCeiling: number | null;
  maxPatches: number | null;
  frontierDigest: string;
  coordinateKind?: 'frontier' | 'strand';
  strand?: Record<string, unknown>;
}): ConflictResolvedCoordinate {
  return new ConflictResolvedCoordinate({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    coordinateKind,
    frontier: frontierToRecord(frontier),
    frontierDigest,
    lamportCeiling,
    scanBudgetApplied: { maxPatches },
    truncationPolicy: CONFLICT_TRUNCATION_POLICY,
    ...(strand !== undefined ? { strand } : {}),
  });
}

// ── Context resolution ──────────────────────────────────────────────

export type AnalyzerService = {
  _graph: {
    getFrontier(): Promise<Map<string, string>>;
    _loadWriterPatches(writerId: string): Promise<Array<{ patch: Patch; sha: string }>>;
    [key: string]: unknown;
  };
  _hash(payload: unknown): Promise<string>;
};

type AnalysisContext = {
  patchFrames: PatchFrame[];
  resolvedCoordinate: ConflictResolvedCoordinate;
};

async function resolveStrandContext(
  service: AnalyzerService,
  request: ConflictAnalysisRequest,
): Promise<AnalysisContext> {
  // Adapter boundary: _graph satisfies the structural subset that createStrandCoordinator uses
  const strands = createStrandCoordinator(service._graph as unknown as Parameters<typeof createStrandCoordinator>[0]);
  const descriptor = await strands.getOrThrow(request.strandId!);
  const entries = await strands.getPatchEntries(request.strandId!, {
    ceiling: request.lamportCeiling,
  });
  const frontier = new Map(
    Object.entries(descriptor.baseObservation.frontier).sort(([a], [b]) => compareStrings(a, b)),
  );
  return {
    patchFrames: buildPatchFrames(entries),
    resolvedCoordinate: buildResolvedCoordinate({
      coordinateKind: 'strand',
      frontier,
      lamportCeiling: request.lamportCeiling,
      maxPatches: request.maxPatches,
      frontierDigest: descriptor.baseObservation.frontierDigest,
      strand: buildResolvedStrandMetadata(descriptor as unknown as ResolvedStrandDescriptor),
    }),
  };
}

async function resolveFrontierContext(
  service: AnalyzerService,
  request: ConflictAnalysisRequest,
): Promise<AnalysisContext> {
  const { frontier, patchFrames } = await loadFrontierPatchFrames(
    service._graph,
    request.lamportCeiling,
  );
  const frontierDigest = await service._hash(frontierToRecord(frontier));
  return {
    patchFrames,
    resolvedCoordinate: buildResolvedCoordinate({
      coordinateKind: 'frontier',
      frontier,
      lamportCeiling: request.lamportCeiling,
      maxPatches: request.maxPatches,
      frontierDigest,
    }),
  };
}

async function loadFrontierPatchFrames(
  graph: AnalyzerService['_graph'],
  lamportCeiling: number | null,
): Promise<{ frontier: Map<string, string>; patchFrames: PatchFrame[] }> {
  const frontier = await graph.getFrontier();
  const writerIds = [...frontier.keys()].sort(compareStrings);
  const entries: Array<{ patch: Patch; sha: string }> = [];
  for (const writerId of writerIds) {
    const writerEntries = await graph._loadWriterPatches(writerId);
    for (const entry of writerEntries) {
      if (lamportCeiling !== null && (entry.patch.lamport ?? 0) > lamportCeiling) {
        continue;
      }
      entries.push(entry);
    }
  }
  return { frontier, patchFrames: buildPatchFrames(entries) };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolves the full analysis context (patch frames + coordinate) from either
 * strand or frontier coordinates.
 */
export async function resolveAnalysisContext(
  service: AnalyzerService,
  request: ConflictAnalysisRequest,
): Promise<AnalysisContext> {
  if (request.usesStrandCoordinate()) {
    return await resolveStrandContext(service, request);
  }
  return await resolveFrontierContext(service, request);
}
