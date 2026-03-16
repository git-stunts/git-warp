import { z } from 'zod';

import { EXIT_CODES, notFoundError, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'show',
  summary: 'Show a single working-set descriptor',
});

const SHOW_OPTIONS = /** @type {Record<string, { type: string, short?: string, default?: unknown, multiple?: boolean }>} */ ({});
const showWorkingSetSchema = z.object({}).strict();

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleWorkingSetSubcommand({ options, args }) {
  const { positionals } = parseCommandArgs(args, SHOW_OPTIONS, showWorkingSetSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph working-set show <id>');
  }

  const workingSetId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const workingSet = await graph.getWorkingSet(workingSetId);
  if (!workingSet) {
    throw notFoundError(`Working set not found: ${workingSetId}`);
  }

  return {
    payload: {
      graph: graphName,
      workingSetAction: 'show',
      workingSet,
    },
    exitCode: EXIT_CODES.OK,
  };
}
