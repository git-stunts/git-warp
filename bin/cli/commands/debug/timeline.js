import { z } from 'zod';

import { EXIT_CODES, notFoundError, parseCommandArgs } from '../../infrastructure.js';

import {
  getWorkingSetPatchEntriesForDebug,
  loadWorkingSetContextForDebug,
  openDebugContext,
  resolveLamportCeiling,
  sortPatchEntriesCausally,
  summarizePatchEntries,
} from './shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {{patch: import('../../../../src/domain/types/WarpTypesV2.js').PatchV2, sha: string}} PatchEntry */

export const DEBUG_TOPIC = Object.freeze({
  name: 'timeline',
  summary: 'Inspect a cross-writer causal patch timeline at a coordinate',
});

const DEBUG_TIMELINE_OPTIONS = {
  'working-set': { type: 'string' },
  'entity-id': { type: 'string' },
  'writer-id': { type: 'string' },
  'lamport-floor': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  limit: { type: 'string' },
};

const debugTimelineSchema = z.object({
  'working-set': z.string().optional(),
  'entity-id': z.string().optional(),
  'writer-id': z.string().optional(),
  'lamport-floor': z.coerce.number().int().nonnegative().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).strict().refine((val) => {
  if (val['lamport-floor'] === undefined || val['lamport-ceiling'] === undefined) {
    return true;
  }
  return val['lamport-floor'] <= val['lamport-ceiling'];
}, {
  message: '--lamport-floor must be less than or equal to --lamport-ceiling',
  path: ['lamport-floor'],
}).transform((val) => ({
  workingSetId: val['working-set'] ?? null,
  entityId: val['entity-id'] ?? null,
  writerId: val['writer-id'] ?? null,
  lamportFloor: val['lamport-floor'] ?? null,
  lamportCeiling: val['lamport-ceiling'] ?? null,
  limit: val.limit ?? null,
}));

/**
 * @param {{graph: import('../../types.js').WarpGraphInstance, writerId: string}} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadWriterTimeline({ graph, writerId }) {
  const patches = /** @type {PatchEntry[]} */ (await graph.getWriterPatches(writerId));
  return patches;
}

/**
 * @param {{graph: import('../../types.js').WarpGraphInstance, entityId: string}} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadEntityTimeline({ graph, entityId }) {
  const shas = await graph.patchesFor(entityId);
  return /** @type {PatchEntry[]} */ (await Promise.all(
    shas.map(async (sha) => ({
      sha,
      patch: /** @type {import('../../../../src/domain/types/WarpTypesV2.js').PatchV2} */ (await graph.loadPatchBySha(sha)),
    })),
  ));
}

/**
 * @param {{
 *   graph: import('../../types.js').WarpGraphInstance,
 *   entityId: string|null,
 *   writerId: string|null
 * }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadTimelineEntries({ graph, entityId, writerId }) {
  if (entityId) {
    const entries = await loadEntityTimeline({ graph, entityId });
    if (!writerId) {
      return entries;
    }
    return entries.filter(({ patch }) => patch.writer === writerId);
  }

  if (writerId) {
    return await loadWriterTimeline({ graph, writerId });
  }

  const writerIds = await graph.discoverWriters();
  const arrays = await Promise.all(writerIds.map(async (id) => await loadWriterTimeline({ graph, writerId: id })));
  return arrays.flat();
}

/**
 * @param {{
 *   graph: import('../../types.js').WarpGraphInstance,
 *   workingSetId: string,
 *   lamportCeiling: number|null,
 *   entityId: string|null,
 *   writerId: string|null
 * }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function loadWorkingSetTimelineEntries({ graph, workingSetId, lamportCeiling, entityId, writerId }) {
  let entries;
  if (entityId) {
    const shas = await graph.patchesForWorkingSet(
      workingSetId,
      entityId,
      lamportCeiling === null ? undefined : { ceiling: lamportCeiling },
    );
    entries = /** @type {PatchEntry[]} */ (await Promise.all(
      shas.map(async (sha) => ({
        sha,
        patch: /** @type {import('../../../../src/domain/types/WarpTypesV2.js').PatchV2} */ (
          await graph.loadPatchBySha(sha)
        ),
      })),
    ));
  } else {
    entries = await getWorkingSetPatchEntriesForDebug(graph, workingSetId, lamportCeiling);
  }
  if (writerId) {
    entries = entries.filter(({ patch }) => patch.writer === writerId);
  }
  return entries;
}

/**
 * @param {PatchEntry[]} entries
 * @param {{lamportFloor: number|null, lamportCeiling: number|null}} filters
 * @returns {PatchEntry[]}
 */
function filterTimelineEntries(entries, filters) {
  return entries.filter(({ patch }) => {
    const lamport = patch.lamport ?? 0;
    if (filters.lamportFloor !== null && lamport < filters.lamportFloor) {
      return false;
    }
    if (filters.lamportCeiling !== null && lamport > filters.lamportCeiling) {
      return false;
    }
    return true;
  });
}

/**
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
 * @param {{graph: import('../../types.js').WarpGraphInstance, writerId: string}} params
 * @returns {Promise<void>}
 */
async function ensureKnownWriter({ graph, writerId }) {
  const knownWriters = await graph.discoverWriters();
  if (!knownWriters.includes(writerId)) {
    if (knownWriters.length > 0) {
      throw notFoundError(`Unknown writer: ${writerId}\nKnown writers: ${knownWriters.join(', ')}`);
    }
    throw notFoundError(`Unknown writer: ${writerId}`);
  }
}

/**
 * @param {number|null} explicitLamportCeiling
 * @param {import('../../types.js').CursorBlob|null} activeCursor
 * @returns {'explicit'|'cursor'|'frontier'}
 */
function resolveCoordinateSource(explicitLamportCeiling, activeCursor) {
  if (explicitLamportCeiling !== null) {
    return 'explicit';
  }
  return activeCursor ? 'cursor' : 'frontier';
}

/**
 * @param {{
 *   graph: import('../../types.js').WarpGraphInstance,
 *   values: ReturnType<typeof debugTimelineSchema.parse>,
 *   lamportCeiling: number|null
 * }} params
 * @returns {Promise<PatchEntry[]>}
 */
async function resolveTimelineEntries({ graph, values, lamportCeiling }) {
  if (values.workingSetId) {
    return await loadWorkingSetTimelineEntries({
      graph,
      workingSetId: values.workingSetId,
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
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_TIMELINE_OPTIONS, debugTimelineSchema);
  const values = /** @type {ReturnType<typeof debugTimelineSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const coordinateSource = resolveCoordinateSource(values.lamportCeiling, activeCursor);
  const workingSet = values.workingSetId
    ? await loadWorkingSetContextForDebug(graph, values.workingSetId)
    : null;
  const entries = await resolveTimelineEntries({ graph, values, lamportCeiling });

  if (entries.length === 0 && values.writerId && !values.workingSetId) {
    await ensureKnownWriter({ graph, writerId: values.writerId });
  }

  const filteredEntries = /** @type {PatchEntry[]} */ (sortPatchEntriesCausally(
    /** @type {Array<{patch: {writer?: string, lamport?: number}, sha: string}>} */ (filterTimelineEntries(entries, {
      lamportFloor: values.lamportFloor,
      lamportCeiling,
    })),
  ));
  const returnedEntries = limitTimelineEntries(filteredEntries, values.limit);

  return {
    payload: {
      graph: graphName,
      debugTopic: 'timeline',
      coordinateSource,
      ...(values.workingSetId ? { workingSetId: values.workingSetId } : {}),
      ...(workingSet ? { workingSet } : {}),
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
    },
    exitCode: EXIT_CODES.OK,
  };
}
