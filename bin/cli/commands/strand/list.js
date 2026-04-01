import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'list',
  summary: 'List strand descriptors for the graph',
});

const LIST_OPTIONS = /** @type {Record<string, { type: string, short?: string, default?: unknown, multiple?: boolean }>} */ ({});
const listStrandSchema = z.object({}).strict();

/**
 * Lists all strand descriptors for the graph.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  parseCommandArgs(args, LIST_OPTIONS, listStrandSchema);
  const { graph, graphName } = await openGraph(options);
  const strands = await graph.listStrands();

  return {
    payload: {
      graph: graphName,
      strandAction: 'list',
      strands,
    },
    exitCode: EXIT_CODES.OK,
  };
}
