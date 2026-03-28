import { z } from 'zod';

import { EXIT_CODES, notFoundError, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'show',
  summary: 'Show a single strand descriptor',
});

const SHOW_OPTIONS = /** @type {Record<string, { type: string, short?: string, default?: unknown, multiple?: boolean }>} */ ({});
const showStrandSchema = z.object({}).strict();

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { positionals } = parseCommandArgs(args, SHOW_OPTIONS, showStrandSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph strand show <id>');
  }

  const strandId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const strand = await graph.getStrand(strandId);
  if (!strand) {
    throw notFoundError(`Strand not found: ${strandId}`);
  }

  return {
    payload: {
      graph: graphName,
      strandAction: 'show',
      strand,
    },
    exitCode: EXIT_CODES.OK,
  };
}
