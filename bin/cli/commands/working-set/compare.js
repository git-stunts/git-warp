import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'compare',
  summary: 'Compare a working set against base, live, or another working set',
});

const COMPARE_OPTIONS = {
  against: { type: 'string', default: 'base' },
  'target-id': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  'against-lamport-ceiling': { type: 'string' },
};

const compareWorkingSetSchema = z.object({
  against: z.string().default('base'),
  'target-id': z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'against-lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val, ctx) => {
  const rawAgainst = val.against.trim();
  let against;
  if (rawAgainst === 'base' || rawAgainst === 'live') {
    against = rawAgainst;
  } else if (rawAgainst.startsWith('working-set:') && rawAgainst.length > 'working-set:'.length) {
    against = {
      kind: /** @type {const} */ ('working_set'),
      workingSetId: rawAgainst.slice('working-set:'.length),
    };
  } else {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['against'],
      message: 'against must be base, live, or working-set:<id>',
    });
    return z.NEVER;
  }

  return {
    againstRaw: rawAgainst,
    comparisonOptions: {
      against,
      ceiling: val['lamport-ceiling'] ?? null,
      againstCeiling: val['against-lamport-ceiling'] ?? null,
      targetId: val['target-id'],
    },
  };
});

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleWorkingSetSubcommand({ options, args }) {
  const { values, positionals } = parseCommandArgs(args, COMPARE_OPTIONS, compareWorkingSetSchema, {
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw usageError(
      'Usage: warp-graph working-set compare <id> [--against base|live|working-set:<id>] [--target-id <id>] [--lamport-ceiling <n>] [--against-lamport-ceiling <n>]',
    );
  }

  const workingSetId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const comparison = await graph.compareWorkingSet(workingSetId, values.comparisonOptions);

  return {
    payload: {
      graph: graphName,
      workingSetAction: 'compare',
      workingSetId,
      against: values.againstRaw,
      comparison,
    },
    exitCode: EXIT_CODES.OK,
  };
}
