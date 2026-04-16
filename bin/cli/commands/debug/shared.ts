/**
 * Counts each op type found in a patch operation list.
 */
function summarizeOps(ops: Array<{ type: string }>): Record<string, number> {
  const summary: Record<string, number> = { NodeAdd: 0, EdgeAdd: 0, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 };
  for (const op of ops) { if (op.type in summary) { summary[op.type] = (summary[op.type] ?? 0) + 1; } }
  return summary;
}
import {
  openGraph,
  readActiveCursor,
  emitCursorWarning,
} from '../../shared.ts';
import { notFoundError } from '../../infrastructure.ts';

import type { CliOptions, WarpGraphInstance, Persistence, CursorBlob } from '../../types.ts';
import type WarpCore from '../../../../src/domain/WarpCore.ts';
import type WarpRuntime from '../../../../src/domain/WarpRuntime.ts';
import type Patch from '../../../../src/domain/types/Patch.ts';
import type { StrandDescriptor } from '../../../../src/domain/types/StrandDescriptor.ts';

type WarpCoreRuntime = WarpCore & WarpRuntime;

/**
 * Opens a graph with debug context including cursor state for exploratory analysis.
 */
export async function openDebugContext(options: CliOptions): Promise<{ graph: WarpGraphInstance; graphName: string; persistence: Persistence; activeCursor: CursorBlob | null }> {
  const { graph, graphName, persistence } = await openGraph(options);
  const activeCursor = await readActiveCursor(persistence, graphName);
  emitCursorWarning({
    active: activeCursor !== null,
    tick: activeCursor?.tick ?? null,
    maxTick: null,
  }, null);
  return { graph, graphName, persistence, activeCursor };
}

/**
 * Resolves the effective lamport ceiling from an explicit value or cursor state.
 */
export function resolveLamportCeiling(explicitLamportCeiling: number | null, activeCursor: CursorBlob | null): number | null {
  return explicitLamportCeiling ?? activeCursor?.tick ?? null;
}

/**
 * Materialize explicitly for debugger commands so they operate against an
 * intentional observation coordinate instead of relying on auto-materialize.
 *
 * The main git-warp CLI does not attach a checkpoint policy or persistent seek
 * cache when opening graphs, so this remains a read-only exploratory path.
 */
export async function materializeForDebug(graph: WarpGraphInstance, options: { lamportCeiling: number | null; collectReceipts: boolean; strandId?: string | null }): Promise<unknown> {
  const debugGraph = graph as unknown as WarpCoreRuntime;
  const {
    lamportCeiling,
    collectReceipts,
    strandId = null,
  } = options;
  if (strandId !== null && strandId !== undefined && strandId.length > 0) {
    return await materializeStrandForDebug(debugGraph, strandId, { lamportCeiling, collectReceipts });
  }
  return await materializeGraphForDebug(debugGraph, { lamportCeiling, collectReceipts });
}

/**
 * Materializes a single strand with optional ceiling and receipt collection.
 */
async function materializeStrandForDebug(debugGraph: WarpCoreRuntime, strandId: string, opts: { lamportCeiling: number | null; collectReceipts: boolean }): Promise<unknown> {
  const matOpts: Record<string, unknown> = {};
  if (opts.collectReceipts) {
    matOpts['receipts'] = true;
  }
  if (opts.lamportCeiling !== null) {
    matOpts['ceiling'] = opts.lamportCeiling;
  }
  return Object.keys(matOpts).length > 0
    ? await debugGraph.materializeStrand(strandId, matOpts)
    : await debugGraph.materializeStrand(strandId);
}

/**
 * Materializes the full graph with optional ceiling and receipt collection.
 */
async function materializeGraphForDebug(debugGraph: WarpCoreRuntime, opts: { lamportCeiling: number | null; collectReceipts: boolean }): Promise<unknown> {
  const matOpts: Record<string, unknown> = {};
  if (opts.collectReceipts) {
    matOpts['receipts'] = true;
  }
  if (opts.lamportCeiling !== null) {
    matOpts['ceiling'] = opts.lamportCeiling;
  }
  return Object.keys(matOpts).length > 0
    ? await debugGraph.materialize(matOpts)
    : await debugGraph.materialize();
}

/**
 * Retrieves decoded patch entries for a specific strand, optionally capped by lamport ceiling.
 */
export async function getStrandPatchEntriesForDebug(graph: WarpGraphInstance, strandId: string, lamportCeiling: number | null): Promise<Array<{ patch: Patch; sha: string }>> {
  const debugGraph = graph as unknown as WarpCoreRuntime;
  if (lamportCeiling === null) {
    return await debugGraph.getStrandPatches(strandId) as Array<{ patch: Patch; sha: string }>;
  }
  return await debugGraph.getStrandPatches(strandId, { ceiling: lamportCeiling }) as Array<{ patch: Patch; sha: string }>;
}

/**
 * Produces a serializable summary of a strand's context for debug output.
 */
function summarizeStrandContextForDebug(strand: StrandDescriptor): {
  strandId: string;
  baseLamportCeiling: number | null;
  overlayHeadPatchSha: string | null;
  overlayPatchCount: number;
  overlayWritable: boolean;
  braid: {
    readOverlayCount: number;
    braidedStrandIds: string[];
  };
} {
  return {
    strandId: strand.strandId,
    baseLamportCeiling: strand.baseObservation.lamportCeiling,
    overlayHeadPatchSha: strand.overlay.headPatchSha,
    overlayPatchCount: strand.overlay.patchCount,
    overlayWritable: strand.overlay.writable,
    braid: {
      readOverlayCount: strand.braid.readOverlays.length,
      braidedStrandIds: strand.braid.readOverlays
        .map((overlay) => overlay.strandId)
        .sort(compareStrings),
    },
  };
}

/**
 * Loads and summarizes a strand's debug context, throwing if the strand is not found.
 */
export async function loadStrandContextForDebug(graph: WarpGraphInstance, strandId: string): Promise<ReturnType<typeof summarizeStrandContextForDebug>> {
  const strand = await graph.getStrand(strandId);
  if (!strand) {
    throw notFoundError(`Strand not found: ${strandId}`);
  }
  return summarizeStrandContextForDebug(strand);
}

/**
 * Explicit byte/hex-safe string ordering for deterministic debug output.
 */
export function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Numeric comparator for deterministic sorting.
 */
export function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : (a < b ? -1 : 1);
}

type DebugOpLike = { type: string; node?: string; from?: string; to?: string };

/**
 * Adds a string field from an op to the set if it is a non-empty string.
 */
function addIfNonEmptyString(ids: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) {
    ids.add(value);
  }
}

/**
 * Collects unique node/edge endpoint IDs referenced by patch operations.
 */
function collectTouchedIds(ops: DebugOpLike[] | undefined): string[] {
  if (!Array.isArray(ops) || ops.length === 0) {
    return [];
  }

  const ids: Set<string> = new Set();
  for (const op of ops) {
    addIfNonEmptyString(ids, op.node);
    addIfNonEmptyString(ids, op.from);
    addIfNonEmptyString(ids, op.to);
  }

  return ([...ids].sort(compareStrings));
}

/**
 * Returns the lamport value from a patch, defaulting to zero if absent.
 */
function patchLamport(patch: { lamport?: number }): number {
  return patch.lamport ?? 0;
}

/**
 * Returns the writer value from a patch, defaulting to empty string if absent.
 */
function patchWriter(patch: { writer?: string }): string {
  return patch.writer ?? '';
}

/**
 * Compares two patch entries by lamport, then writer, then SHA for deterministic ordering.
 */
function comparePatchEntries(a: { patch: { writer?: string; lamport?: number }; sha: string }, b: { patch: { writer?: string; lamport?: number }; sha: string }): number {
  return compareNumbers(patchLamport(a.patch), patchLamport(b.patch))
    || compareStrings(patchWriter(a.patch), patchWriter(b.patch))
    || compareStrings(a.sha, b.sha);
}

/**
 * Deterministic causal sort for patch entries.
 */
export function sortPatchEntriesCausally(entries: Array<{ patch: { writer?: string; lamport?: number }; sha: string }>): Array<{ patch: { writer?: string; lamport?: number }; sha: string }> {
  return [...entries].sort(comparePatchEntries);
}

type DebugPatch = { writer?: string; lamport?: number; schema?: number; ops?: DebugOpLike[]; reads?: string[] | undefined; writes?: string[] | undefined };

/**
 * Safely copies a string array or returns an empty array.
 */
function copyStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) {
    return [];
  }
  const result: string[] = [];
  for (const item of arr as string[]) {
    result.push(item);
  }
  return result;
}

/**
 * Summarizes a single patch entry into a compact debug-friendly shape.
 */
function summarizeSinglePatch({ patch, sha }: { patch: DebugPatch; sha: string }): { sha: string; writer: string; lamport: number; schema: number | undefined; opCount: number; opSummary: Record<string, number>; reads: string[]; writes: string[]; targets: string[] } {
  const ops = Array.isArray(patch.ops) ? patch.ops : [];
  return {
    sha,
    writer: patch.writer ?? '',
    lamport: patch.lamport ?? 0,
    schema: patch.schema,
    opCount: ops.length,
    opSummary: ops.length > 0 ? summarizeOps(ops) : {},
    reads: copyStringArray(patch.reads),
    writes: copyStringArray(patch.writes),
    targets: collectTouchedIds(patch.ops),
  };
}

/**
 * Transforms raw patch entries into compact summaries for debug display.
 */
export function summarizePatchEntries(entries: Array<{ patch: DebugPatch; sha: string }>): Array<{ sha: string; writer: string; lamport: number; schema: number | undefined; opCount: number; opSummary: Record<string, number>; reads: string[]; writes: string[]; targets: string[] }> {
  return entries.map(summarizeSinglePatch);
}

/**
 * Returns true if the SHA matches a given prefix, or if no prefix is provided.
 */
export function matchesShaPrefix(sha: string, prefix: string | null): boolean {
  if (prefix === null || prefix === undefined || prefix.length === 0) {
    return true;
  }
  return sha === prefix || sha.startsWith(prefix);
}
