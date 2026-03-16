import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'drop',
  summary: 'Delete a working-set descriptor',
});

const DROP_OPTIONS = /** @type {Record<string, { type: string, short?: string, default?: unknown, multiple?: boolean }>} */ ({});
const dropWorkingSetSchema = z.object({}).strict();

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleWorkingSetSubcommand({ options, args }) {
  const { positionals } = parseCommandArgs(args, DROP_OPTIONS, dropWorkingSetSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph working-set drop <id>');
  }

  const workingSetId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const dropped = await graph.dropWorkingSet(workingSetId);

  return {
    payload: {
      graph: graphName,
      workingSetAction: 'drop',
      workingSetId,
      dropped,
    },
    exitCode: dropped ? EXIT_CODES.OK : EXIT_CODES.NOT_FOUND,
  };
}
