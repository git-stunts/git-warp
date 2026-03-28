import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'drop',
  summary: 'Delete a strand descriptor',
});

const DROP_OPTIONS = /** @type {Record<string, { type: string, short?: string, default?: unknown, multiple?: boolean }>} */ ({});
const dropStrandSchema = z.object({}).strict();

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { positionals } = parseCommandArgs(args, DROP_OPTIONS, dropStrandSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph strand drop <id>');
  }

  const strandId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const dropped = await graph.dropStrand(strandId);

  return {
    payload: {
      graph: graphName,
      strandAction: 'drop',
      strandId,
      dropped,
    },
    exitCode: dropped ? EXIT_CODES.OK : EXIT_CODES.NOT_FOUND,
  };
}
