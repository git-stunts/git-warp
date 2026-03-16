import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import {
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
  'entity-id': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  'max-patches': { type: 'string' },
};

const debugProvenanceSchema = z.object({
  'entity-id': z.string().min(1, 'Missing value for --entity-id'),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'max-patches': z.coerce.number().int().positive().optional(),
}).strict().transform((val) => ({
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

  await materializeForDebug(graph, lamportCeiling, false);

  const shas = await graph.patchesFor(values.entityId);
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
