import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import {
  loadStrandContextForDebug,
  materializeForDebug,
  openDebugContext,
  resolveLamportCeiling,
  sortPatchEntriesCausally,
  summarizePatchEntries,
} from './shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {import('../../types.js').WarpGraphInstance} WarpGraphInstance */

export const DEBUG_TOPIC = Object.freeze({
  name: 'provenance',
  summary: 'Inspect causal patch provenance for a graph entity',
});

const DEBUG_PROVENANCE_OPTIONS = {
  'strand': { type: 'string' },
  'entity-id': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  'max-patches': { type: 'string' },
};

const debugProvenanceSchema = z.object({
  'strand': z.string().optional(),
  'entity-id': z.string().min(1, 'Missing value for --entity-id'),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'max-patches': z.coerce.number().int().positive().optional(),
}).strict().transform((val) => ({
  strandId: val.strand ?? null,
  entityId: val['entity-id'],
  lamportCeiling: val['lamport-ceiling'] ?? null,
  maxPatches: val['max-patches'] ?? null,
}));

/**
 * Loads patch SHAs for a provenance query, either strand-scoped or graph-wide.
 * @param {WarpGraphInstance} graph
 * @param {{ strandId: string|null, entityId: string, lamportCeiling: number|null }} values
 * @returns {Promise<string[]>}
 */
async function loadPatchShas(graph, { strandId, entityId, lamportCeiling }) {
  if (typeof strandId === 'string' && strandId.length > 0) {
    return await graph.patchesForStrand(
      strandId,
      entityId,
      lamportCeiling === null ? undefined : { ceiling: lamportCeiling },
    );
  }
  await materializeForDebug(graph, { lamportCeiling, collectReceipts: false });
  return await graph.patchesFor(entityId);
}

/**
 * Loads and sorts patch entries for the given SHAs.
 * @param {WarpGraphInstance} graph
 * @param {string[]} shas
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function loadAndSortEntries(graph, shas) {
  /** @type {Array<{patch: import('../../../../src/domain/types/Patch.ts').default, sha: string}>} */
  const loadedEntries = await Promise.all(
    shas.map(async (sha) => ({
      sha,
      patch: await graph.loadPatchBySha(sha),
    })),
  );
  return summarizePatchEntries(sortPatchEntriesCausally(loadedEntries));
}

/**
 * Builds the provenance payload from resolved values and entries.
 * @param {{ graphName: string, strandId: string|null, strand: unknown, entityId: string, lamportCeiling: number|null, entries: Array<Record<string, unknown>>, maxPatches: number|null }} p
 * @returns {Record<string, unknown>}
 */
function buildProvenancePayload({ graphName, strandId, strand, entityId, lamportCeiling, entries, maxPatches }) {
  const returnedEntries = maxPatches === null ? entries : entries.slice(0, maxPatches);
  return {
    graph: graphName,
    debugTopic: 'provenance',
    ...(strandId !== null ? { strandId } : {}),
    ...(strand !== null ? { strand } : {}),
    entityId,
    lamportCeiling,
    totalPatches: entries.length,
    returnedPatches: returnedEntries.length,
    truncated: returnedEntries.length < entries.length,
    entries: returnedEntries,
  };
}

/**
 * Handles the `debug provenance` topic: inspects causal patch provenance for a graph entity.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_PROVENANCE_OPTIONS, debugProvenanceSchema);
  const values = /** @type {ReturnType<typeof debugProvenanceSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const strandId = typeof values.strandId === 'string' && values.strandId.length > 0 ? values.strandId : null;
  const strand = strandId !== null ? await loadStrandContextForDebug(graph, strandId) : null;
  const shas = await loadPatchShas(graph, { strandId, entityId: values.entityId, lamportCeiling });
  const entries = await loadAndSortEntries(graph, shas);

  return {
    payload: buildProvenancePayload({ graphName, strandId, strand, entityId: values.entityId, lamportCeiling, entries, maxPatches: values.maxPatches }),
    exitCode: EXIT_CODES.OK,
  };
}
