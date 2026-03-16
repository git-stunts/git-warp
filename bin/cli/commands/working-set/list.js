import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'list',
  summary: 'List working-set descriptors for the graph',
});

const LIST_OPTIONS = /** @type {Record<string, { type: string, short?: string, default?: unknown, multiple?: boolean }>} */ ({});
const listWorkingSetSchema = z.object({}).strict();

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleWorkingSetSubcommand({ options, args }) {
  parseCommandArgs(args, LIST_OPTIONS, listWorkingSetSchema);
  const { graph, graphName } = await openGraph(options);
  const workingSets = await graph.listWorkingSets();

  return {
    payload: {
      graph: graphName,
      workingSetAction: 'list',
      workingSets,
    },
    exitCode: EXIT_CODES.OK,
  };
}
