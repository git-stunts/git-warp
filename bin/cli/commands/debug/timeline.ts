import { z } from 'zod';

import { EXIT_CODES, notFoundError, parseCommandArgs } from '../../infrastructure.ts';

import {
  getStrandPatchEntriesForDebug,
  loadStrandContextForDebug,
  openDebugContext,
  resolveLamportCeiling,
  sortPatchEntriesCausally,
  summarizePatchEntries,
} from './shared.ts';
import type { CliOptions, WarpGraphInstance, CursorBlob } from '../../types.ts';
import type Patch from '../../../../src/domain/types/Patch.ts';

/** Returns true if the value is a non-empty string. */
function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

type PatchEntry = { patch: Patch; sha: string };

export const DEBUG_TOPIC = Object.freeze({
  name: 'timeline',
  summary: 'Inspect a cross-writer causal patch timeline at a coordinate',
});

const DEBUG_TIMELINE_OPTIONS = {
  'strand': { type: 'string' },
  'entity-id': { type: 'string' },
  'writer-id': { type: 'string' },
  'lamport-floor': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  limit: { type: 'string' },
};

/** Validates that lamport-floor is not greater than lamport-ceiling. */
const validateLamportRange = (val: Record<string, unknown>): boolean => {
  const floor = val['lamport-floor'];
  const ceiling = val['lamport-ceiling'];
  if (floor === undefined || ceiling === undefined) {
    return true;
  }
  return Number(floor) <= Number(ceiling);
};

/** Coerces an optional string to string or null. */
function strOrNull(value: string | undefined): string | null {
  return value ?? null;
}

/** Coerces an optional number to number or null. */
function numOrNull(value: number | undefined): number | null {
  return value ?? null;
}

type TimelineValues = {
  strandId: string | null;
  entityId: string | null;
  writerId: string | null;
  lamportFloor: number | null;
  lamportCeiling: number | null;
  limit: number | null;
};

/** Normalizes parsed Zod values into a timeline coordinate shape. */
function normalizeTimelineValues(val: { strand?: string | undefined; 'entity-id'?: string | undefined; 'writer-id'?: string | undefined; 'lamport-floor'?: number | undefined; 'lamport-ceiling'?: number | undefined; limit?: number | undefined }, _ctx: z.RefinementCtx): TimelineValues {
  return {
    strandId: strOrNull(val.strand),
    entityId: strOrNull(val['entity-id']),
    writerId: strOrNull(val['writer-id']),
    lamportFloor: numOrNull(val['lamport-floor']),
    lamportCeiling: numOrNull(val['lamport-ceiling']),
    limit: numOrNull(val.limit),
  };
}

const debugTimelineSchema = z.object({
  'strand': z.string().optional(),
  'entity-id': z.string().optional(),
  'writer-id': z.string().optional(),
  'lamport-floor': z.coerce.number().int().nonnegative().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).strict().refine(validateLamportRange, {
  message: '--lamport-floor must be less than or equal to --lamport-ceiling',
  path: ['lamport-floor'],
}).transform(normalizeTimelineValues);

/** Loads all patches for a specific writer. */
async function loadWriterTimeline({ graph, writerId }: { graph: WarpGraphInstance; writerId: string }): Promise<PatchEntry[]> {
  return await graph.getWriterPatches(writerId) as PatchEntry[];
}

/** Loads all patches that affected a specific entity. */
async function loadEntityTimeline({ graph, entityId }: { graph: WarpGraphInstance; entityId: string }): Promise<PatchEntry[]> {
  const shas = await graph.patchesFor(entityId);
  const patches = await Promise.all(
    shas.map(async (sha) => ({
      sha,
      patch: await graph.loadPatchBySha(sha),
    })),
  );
  return patches as PatchEntry[];
}

/** Resolves timeline entries for a non-strand coordinate. */
async function loadTimelineEntries({ graph, entityId, writerId }: {
  graph: WarpGraphInstance;
  entityId: string | null;
  writerId: string | null;
}): Promise<PatchEntry[]> {
  if (isNonEmptyString(entityId)) {
    const entries = await loadEntityTimeline({ graph, entityId });
    if (isNonEmptyString(writerId)) {
      return entries.filter(({ patch }) => patch.writer === writerId);
    }
    return entries;
  }

  if (isNonEmptyString(writerId)) {
    return await loadWriterTimeline({ graph, writerId });
  }

  const ids = await graph.discoverWriters();
  const arrays = await Promise.all(ids.map(async (id) => await loadWriterTimeline({ graph, writerId: id })));
  return arrays.flat();
}

/** Loads patches for a specific entity within a strand up to an optional ceiling. */
async function loadStrandEntityEntries({ graph, strandId, entityId, lamportCeiling }: { graph: WarpGraphInstance; strandId: string; entityId: string; lamportCeiling: number | null }): Promise<PatchEntry[]> {
  const c = (lamportCeiling !== null && lamportCeiling !== undefined) ? { ceiling: lamportCeiling } : undefined;
  const shas = await graph.patchesForStrand(strandId, entityId, c);
  return await Promise.all(
    shas.map(async (sha) => ({
      sha,
      patch: await graph.loadPatchBySha(sha),
    })),
  ) as PatchEntry[];
}

/** Loads timeline entries visible from a specific strand at a ceiling. */
async function loadStrandTimelineEntries({ graph, strandId, lamportCeiling, entityId, writerId }: {
  graph: WarpGraphInstance;
  strandId: string;
  lamportCeiling: number | null;
  entityId: string | null;
  writerId: string | null;
}): Promise<PatchEntry[]> {
  const entries = isNonEmptyString(entityId)
    ? await loadStrandEntityEntries({ graph, strandId, entityId, lamportCeiling })
    : await getStrandPatchEntriesForDebug(graph, strandId, lamportCeiling);
  if (isNonEmptyString(writerId)) {
    return entries.filter(({ patch }) => patch.writer === writerId);
  }
  return entries;
}

/** Filters patch entries by lamport range. */
function filterTimelineEntries(entries: PatchEntry[], filters: { lamportFloor: number | null; lamportCeiling: number | null }): PatchEntry[] {
  return entries.filter(({ patch }) => isWithinLamportRange(patch, filters));
}

/** Returns true if the lamport value is at or above the floor. */
function isAboveFloor(lamp: number, floor: number | null): boolean {
  return floor === null || lamp >= floor;
}

/** Returns true if the lamport value is at or below the ceiling. */
function isBelowCeiling(lamp: number, ceiling: number | null): boolean {
  return ceiling === null || lamp <= ceiling;
}

/** Checks whether a patch falls within the lamport range. */
function isWithinLamportRange(patch: { lamport?: number }, filters: { lamportFloor: number | null; lamportCeiling: number | null }): boolean {
  const lamp = patch.lamport ?? 0;
  return isAboveFloor(lamp, filters.lamportFloor) && isBelowCeiling(lamp, filters.lamportCeiling);
}

/** Limits the number of entries returned. */
function limitTimelineEntries(entries: PatchEntry[], limit: number | null): PatchEntry[] {
  if (limit === null || entries.length <= limit) {
    return entries;
  }
  return entries.slice(-limit);
}

/** Asserts that a writer ID is known by the graph. */
async function ensureKnownWriter({ graph, writerId }: { graph: WarpGraphInstance; writerId: string }): Promise<void> {
  const known = await graph.discoverWriters();
  if (known.includes(writerId)) { return; }
  const msg = known.length > 0 ? `Unknown writer: ${writerId}\nKnown writers: ${known.join(', ')}` : `Unknown writer: ${writerId}`;
  throw notFoundError(msg);
}

/** Resolves the semantic source of the timeline coordinate. */
function resolveCoordinateSource(ceil: number | null, cursor: CursorBlob | null): 'explicit' | 'cursor' | 'frontier' {
  if (ceil !== null) { return 'explicit'; }
  return cursor ? 'cursor' : 'frontier';
}

/** Dispatches timeline resolution based on strand presence. */
async function resolveTimelineEntries({ graph, values, lamportCeiling }: {
  graph: WarpGraphInstance;
  values: { strandId: string | null; entityId: string | null; writerId: string | null; lamportCeiling: number | null };
  lamportCeiling: number | null;
}): Promise<PatchEntry[]> {
  if (isNonEmptyString(values.strandId)) {
    return await loadStrandTimelineEntries({
      graph,
      strandId: values.strandId,
      lamportCeiling,
      entityId: values.entityId,
      writerId: values.writerId,
    });
  }

  return await loadTimelineEntries({
    graph,
    entityId: values.entityId,
    writerId: values.writerId,
  });
}

/** Prepares the payload for the debug timeline result. */
function buildDebugTimelinePayload({ graphName, coordinateSource, values, strand, filteredEntries, returnedEntries, lamportCeiling }: {
  graphName: string;
  coordinateSource: string;
  values: TimelineValues;
  strand: Record<string, unknown> | null;
  filteredEntries: PatchEntry[];
  returnedEntries: PatchEntry[];
  lamportCeiling: number | null;
}): Record<string, unknown> {
  return {
    graph: graphName,
    debugTopic: 'timeline',
    coordinateSource,
    ...(isNonEmptyString(values.strandId) ? { strandId: values.strandId } : {}),
    ...(strand !== null && strand !== undefined ? { strand } : {}),
    filters: {
      entityId: values.entityId,
      writerId: values.writerId,
      lamportFloor: values.lamportFloor,
      lamportCeiling,
    },
    totalEntries: filteredEntries.length,
    returnedEntries: returnedEntries.length,
    truncated: returnedEntries.length < filteredEntries.length,
    entries: summarizePatchEntries(returnedEntries),
  };
}

/** Handles the 'debug timeline' CLI command. */
export async function handleDebugTopic({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_TIMELINE_OPTIONS, debugTimelineSchema);
  const values = rawValues as TimelineValues;
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const entries = await resolveTimelineEntries({ graph, values, lamportCeiling });

  if (entries.length === 0 && isNonEmptyString(values.writerId) && !isNonEmptyString(values.strandId)) {
    await ensureKnownWriter({ graph, writerId: values.writerId });
  }

  const filteredEntries = sortPatchEntriesCausally(
    filterTimelineEntries(entries, {
      lamportFloor: values.lamportFloor,
      lamportCeiling,
    }) as Array<{ patch: { writer?: string; lamport?: number }; sha: string }>,
  ) as PatchEntry[];
  const returnedEntries = limitTimelineEntries(filteredEntries, values.limit);
  const strand = isNonEmptyString(values.strandId) ? await loadStrandContextForDebug(graph, values.strandId) : null;

  return {
    payload: buildDebugTimelinePayload({ graphName, coordinateSource: resolveCoordinateSource(values.lamportCeiling, activeCursor), values, strand, filteredEntries, returnedEntries, lamportCeiling }),
    exitCode: EXIT_CODES.OK,
  };
}
