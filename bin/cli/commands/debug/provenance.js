import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import {
  loadWorkingSetContextForDebug,
  materializeForDebug,
  openDebugContext,
  resolveLamportCeiling,
  sortPatchEntriesCausally,
  summarizePatchEntries,
} from './shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const DEBUG_TOPIC = Object.freeze({
  name: 'provenance',
  summary: 'Inspect causal patch provenance for a graph entity',
});

const DEBUG_PROVENANCE_OPTIONS = {
  'working-set': { type: 'string' },
  'entity-id': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  'max-patches': { type: 'string' },
};

const debugProvenanceSchema = z.object({
  'working-set': z.string().optional(),
  'entity-id': z.string().min(1, 'Missing value for --entity-id'),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'max-patches': z.coerce.number().int().positive().optional(),
}).strict().transform((val) => ({
  workingSetId: val['working-set'] ?? null,
  entityId: val['entity-id'],
  lamportCeiling: val['lamport-ceiling'] ?? null,
  maxPatches: val['max-patches'] ?? null,
}));

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_PROVENANCE_OPTIONS, debugProvenanceSchema);
  const values = /** @type {ReturnType<typeof debugProvenanceSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const workingSet = values.workingSetId
    ? await loadWorkingSetContextForDebug(graph, values.workingSetId)
    : null;
  const shas = values.workingSetId
    ? await graph.patchesForWorkingSet(
        values.workingSetId,
        values.entityId,
        lamportCeiling === null ? undefined : { ceiling: lamportCeiling },
      )
    : (await materializeForDebug(graph, {
        lamportCeiling,
        collectReceipts: false,
      }), await graph.patchesFor(values.entityId));
  const loadedEntries = /** @type {Array<{patch: import('../../../../src/domain/types/WarpTypesV2.js').PatchV2, sha: string}>} */ (await Promise.all(
    shas.map(async (/** @type {string} */ sha) => ({
      sha,
      patch: /** @type {import('../../../../src/domain/types/WarpTypesV2.js').PatchV2} */ (await graph.loadPatchBySha(sha)),
    })),
  ));

  const entries = summarizePatchEntries(sortPatchEntriesCausally(loadedEntries));
  const returnedEntries = values.maxPatches === null
    ? entries
    : entries.slice(0, values.maxPatches);

  return {
    payload: {
      graph: graphName,
      debugTopic: 'provenance',
      ...(values.workingSetId ? { workingSetId: values.workingSetId } : {}),
      ...(workingSet ? { workingSet } : {}),
      entityId: values.entityId,
      lamportCeiling,
      totalPatches: entries.length,
      returnedPatches: returnedEntries.length,
      truncated: returnedEntries.length < entries.length,
      entries: returnedEntries,
    },
    exitCode: EXIT_CODES.OK,
  };
}
