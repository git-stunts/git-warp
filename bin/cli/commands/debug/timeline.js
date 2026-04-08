import { z } from 'zod';

import { EXIT_CODES, notFoundError, parseCommandArgs } from '../../infrastructure.js';

import {
  getStrandPatchEntriesForDebug,
  loadStrandContextForDebug,
  openDebugContext,
  resolveLamportCeiling,
  sortPatchEntriesCausally,
  summarizePatchEntries,
} from './shared.js';

/**
 * Returns true if the value is a non-empty string.
 *
 * @param {string|null|undefined} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {import('../../types.js').WarpGraphInstance} WarpGraphInstance */
/** @typedef {import('../../types.js').CursorBlob} CursorBlob */
/** @typedef {{patch: import('../../../../src/domain/types/Patch.ts').default, sha: string}} PatchEntry */

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

/**
 * Validates that lamport-floor is not greater than lamport-ceiling.
 *
 * @param {Record<string, unknown>} val
 * @returns {boolean}
 */
const validateLamportRange = (val) => {
  const floor = val['lamport-floor'];
  const ceiling = val['lamport-ceiling'];
  if (floor === undefined || ceiling === undefined) {
    return true;
  }
  return Number(floor) <= Number(ceiling);
};

/**
 * Coerces an optional string to string or null.
 *
 * @param {string|undefined} value
 * @returns {string|null}
 */
function strOrNull(value) {
  return value ?? null;
}

/**
 * Coerces an optional number to number or null.
 *
 * @param {number|undefined} value
 * @returns {number|null}
 */
function numOrNull(value) {
  return value ?? null;
}

/**
 * Normalizes parsed Zod values into a timeline coordinate shape.
 *
 * @param {{ strand?: string | undefined, 'entity-id'?: string | undefined, 'writer-id'?: string | undefined, 'lamport-floor'?: number | undefined, 'lamport-ceiling'?: number | undefined, limit?: number | undefined }} val
 * @param {unknown} _ctx
 * @returns {{ strandId: string|null, entityId: string|null, writerId: string|null, lamportFloor: number|null, lamportCeiling: number|null, limit: number|null }}
 */
function normalizeTimelineValues(val, _ctx) {
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

/**
 * Loads all patches for a specific writer.
 *
 * @param {{graph: WarpGraphInstance, writerId: string}} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadWriterTimeline({ graph, writerId }) {
  return /** @type {PatchEntry[]} */ (await graph.getWriterPatches(writerId));
}

/**
 * Loads all patches that affected a specific entity.
 *
 * @param {{graph: WarpGraphInstance, entityId: string}} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadEntityTimeline({ graph, entityId }) {
  const shas = await graph.patchesFor(entityId);
  const patches = await Promise.all(
    shas.map(async (sha) => ({
      sha,
      patch: /** @type {import('../../../../src/domain/types/Patch.ts').default} */ (await graph.loadPatchBySha(sha)),
    })),
  );
  return /** @type {PatchEntry[]} */ (patches);
}

/**
 * Resolves timeline entries for a non-strand coordinate.
 *
 * @param {{
 *   graph: WarpGraphInstance,
 *   entityId: string|null,
 *   writerId: string|null
 * }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadTimelineEntries({ graph, entityId, writerId }) {
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

/**
 * Loads patches for a specific entity within a strand up to an optional ceiling.
 *
 * @param {{ graph: WarpGraphInstance, strandId: string, entityId: string, lamportCeiling: number|null }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadStrandEntityEntries({ graph, strandId, entityId, lamportCeiling }) {
  const c = (lamportCeiling !== null && lamportCeiling !== undefined) ? { ceiling: lamportCeiling } : undefined;
  const shas = await graph.patchesForStrand(strandId, entityId, c);
  return /** @type {PatchEntry[]} */ (await Promise.all(
    shas.map(async (sha) => ({
      sha,
      patch: /** @type {import('../../../../src/domain/types/Patch.ts').default} */ (await graph.loadPatchBySha(sha)),
    })),
  ));
}

/**
 * Loads timeline entries visible from a specific strand at a ceiling.
 *
 * @param {{
 *   graph: WarpGraphInstance,
 *   strandId: string,
 *   lamportCeiling: number|null,
 *   entityId: string|null,
 *   writerId: string|null
 * }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadStrandTimelineEntries({ graph, strandId, lamportCeiling, entityId, writerId }) {
  const entries = isNonEmptyString(entityId)
    ? await loadStrandEntityEntries({ graph, strandId, entityId, lamportCeiling })
    : await getStrandPatchEntriesForDebug(graph, strandId, lamportCeiling);
  if (isNonEmptyString(writerId)) {
    return entries.filter(({ patch }) => patch.writer === writerId);
  }
  return entries;
}

/**
 * Filters patch entries by lamport range.
 *
 * @param {PatchEntry[]} entries
 * @param {{lamportFloor: number|null, lamportCeiling: number|null}} filters
 * @returns {PatchEntry[]}
 */
function filterTimelineEntries(entries, filters) {
  return entries.filter(({ patch }) => isWithinLamportRange(patch, filters));
}

/**
 * Returns true if the lamport value is at or above the floor.
 *
 * @param {number} lamp
 * @param {number|null} floor
 * @returns {boolean}
 */
function isAboveFloor(lamp, floor) {
  return floor === null || lamp >= floor;
}

/**
 * Returns true if the lamport value is at or below the ceiling.
 *
 * @param {number} lamp
 * @param {number|null} ceiling
 * @returns {boolean}
 */
function isBelowCeiling(lamp, ceiling) {
  return ceiling === null || lamp <= ceiling;
}

/**
 * Checks whether a patch falls within the lamport range.
 *
 * @param {{ lamport?: number }} patch
 * @param {{ lamportFloor: number|null, lamportCeiling: number|null }} filters
 * @returns {boolean}
 */
function isWithinLamportRange(patch, filters) {
  const lamp = patch.lamport ?? 0;
  return isAboveFloor(lamp, filters.lamportFloor) && isBelowCeiling(lamp, filters.lamportCeiling);
}

/**
 * Limits the number of entries returned.
 *
 * @param {PatchEntry[]} entries
 * @param {number|null} limit
 * @returns {PatchEntry[]}
 */
function limitTimelineEntries(entries, limit) {
  if (limit === null || entries.length <= limit) {
    return entries;
  }
  return entries.slice(-limit);
}

/**
 * Asserts that a writer ID is known by the graph.
 *
 * @param {{graph: WarpGraphInstance, writerId: string}} params
 * @returns {Promise<void>}
 */
async function ensureKnownWriter({ graph, writerId }) {
  const known = await graph.discoverWriters();
  if (known.includes(writerId)) { return; }
  const msg = known.length > 0 ? `Unknown writer: ${writerId}\nKnown writers: ${known.join(', ')}` : `Unknown writer: ${writerId}`;
  throw notFoundError(msg);
}

/**
 * Resolves the semantic source of the timeline coordinate.
 *
 * @param {number|null} ceil
 * @param {CursorBlob|null} cursor
 * @returns {'explicit'|'cursor'|'frontier'}
 */
function resolveCoordinateSource(ceil, cursor) {
  if (ceil !== null) { return 'explicit'; }
  return cursor ? 'cursor' : 'frontier';
}

/**
 * Dispatches timeline resolution based on strand presence.
 *
 * @param {{
 *   graph: WarpGraphInstance,
 *   values: { strandId: string|null, entityId: string|null, writerId: string|null, lamportCeiling: number|null },
 *   lamportCeiling: number|null
 * }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function resolveTimelineEntries({ graph, values, lamportCeiling }) {
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

/**
 * Prepares the payload for the debug timeline result.
 *
 * @param {{ graphName: string, coordinateSource: string, values: { strandId: string|null, entityId: string|null, writerId: string|null, lamportFloor: number|null, lamportCeiling: number|null, limit: number|null }, strand: Record<string, unknown>|null, filteredEntries: PatchEntry[], returnedEntries: PatchEntry[], lamportCeiling: number|null }} params
 * @returns {Record<string, unknown>}
 * @private
 */
function buildDebugTimelinePayload({ graphName, coordinateSource, values, strand, filteredEntries, returnedEntries, lamportCeiling }) {
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

/**
 * Handles the 'debug timeline' CLI command.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_TIMELINE_OPTIONS, debugTimelineSchema);
  const values = /** @type {ReturnType<typeof debugTimelineSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const entries = await resolveTimelineEntries({ graph, values, lamportCeiling });

  if (entries.length === 0 && isNonEmptyString(values.writerId) && !isNonEmptyString(values.strandId)) {
    await ensureKnownWriter({ graph, writerId: values.writerId });
  }

  const f = sortPatchEntriesCausally(
    /** @type {Array<{patch: {writer?: string, lamport?: number}, sha: string}>} */ (filterTimelineEntries(entries, {
      lamportFloor: values.lamportFloor,
      lamportCeiling,
    })),
  );
  const filteredEntries = /** @type {PatchEntry[]} */ (f);
  const returnedEntries = limitTimelineEntries(filteredEntries, values.limit);
  const strand = isNonEmptyString(values.strandId) ? await loadStrandContextForDebug(graph, values.strandId) : null;

  return {
    payload: buildDebugTimelinePayload({ graphName, coordinateSource: resolveCoordinateSource(values.lamportCeiling, activeCursor), values, strand, filteredEntries, returnedEntries, lamportCeiling }),
    exitCode: EXIT_CODES.OK,
  };
}
