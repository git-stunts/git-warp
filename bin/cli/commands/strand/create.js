import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'create',
  summary: 'Create a pinned strand descriptor',
});

const CREATE_OPTIONS = {
  id: { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  owner: { type: 'string' },
  scope: { type: 'string' },
  'lease-expires-at': { type: 'string' },
};

const createStrandSchema = z.object({
  id: z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  owner: z.string().optional(),
  scope: z.string().optional(),
  'lease-expires-at': z.string().optional(),
}).strict().transform((val) => ({
  strandId: val.id,
  lamportCeiling: val['lamport-ceiling'] ?? null,
  owner: val.owner,
  scope: val.scope,
  leaseExpiresAt: val['lease-expires-at'],
}));

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { values } = parseCommandArgs(args, CREATE_OPTIONS, createStrandSchema);
  const { graph, graphName } = await openGraph(options);
  const strand = await graph.createStrand(values);

  return {
    payload: {
      graph: graphName,
      strandAction: 'create',
      strand,
    },
    exitCode: EXIT_CODES.OK,
  };
}
