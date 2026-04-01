import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'braid',
  summary: 'Pin read-only braid overlays onto a target strand',
});

const BRAID_OPTIONS = {
  support: { type: 'string', multiple: true },
  'read-only': { type: 'boolean', default: false },
  writable: { type: 'boolean', default: false },
};

const braidStrandSchema = z.object({
  support: z.array(z.string()).optional(),
  'read-only': z.boolean().default(false),
  writable: z.boolean().default(false),
}).strict().superRefine((val, ctx) => {
  if (val['read-only'] && val.writable) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--read-only and --writable are mutually exclusive',
    });
  }
}).transform((val) => ({
  braidedStrandIds: val.support ?? [],
  writable: val['read-only'] ? false : val.writable ? true : null,
}));

/**
 * Handles the strand braid subcommand — pins read-only braid overlays onto a target strand.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { values, positionals } = parseCommandArgs(args, BRAID_OPTIONS, braidStrandSchema, {
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw usageError(
      'Usage: warp-graph strand braid <id> [--support <id> ...] [--read-only|--writable]',
    );
  }

  const strandId = positionals[0] ?? '';
  const { graph, graphName } = await openGraph(options);
  const strand = await graph.braidStrand(strandId, values);

  return {
    payload: {
      graph: graphName,
      strandAction: 'braid',
      strand,
    },
    exitCode: EXIT_CODES.OK,
  };
}
