import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'compare',
  summary: 'Compare a strand against base, live, or another strand',
});

const COMPARE_OPTIONS = {
  against: { type: 'string', default: 'base' },
  'target-id': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  'against-lamport-ceiling': { type: 'string' },
};

const compareStrandSchema = z.object({
  against: z.string().default('base'),
  'target-id': z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'against-lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val, ctx) => {
  const rawAgainst = val.against.trim();
  /** @type {'base'|'live'|{ kind: 'strand', strandId: string }} */
  let against;
  if (rawAgainst === 'base' || rawAgainst === 'live') {
    against = rawAgainst;
  } else if (rawAgainst.startsWith('strand:') && rawAgainst.length > 'strand:'.length) {
    against = {
      kind: /** @type {const} */ ('strand'),
      strandId: rawAgainst.slice('strand:'.length),
    };
  } else {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['against'],
      message: 'against must be base, live, or strand:<id>',
    });
    return z.NEVER;
  }

  const comparisonOptions = /** @type {{
    against?: 'base'|'live'|{ kind: 'strand', strandId: string },
    ceiling?: number|null,
    againstCeiling?: number|null,
    targetId?: string|null
  }} */ ({
    against,
    ceiling: val['lamport-ceiling'] ?? null,
    againstCeiling: val['against-lamport-ceiling'] ?? null,
    targetId: val['target-id'],
  });

  return {
    againstRaw: rawAgainst,
    comparisonOptions,
  };
});

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { values, positionals } = parseCommandArgs(args, COMPARE_OPTIONS, compareStrandSchema, {
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw usageError(
      'Usage: warp-graph strand compare <id> [--against base|live|strand:<id>] [--target-id <id>] [--lamport-ceiling <n>] [--against-lamport-ceiling <n>]',
    );
  }

  const strandId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const comparison = await graph.compareStrand(strandId, values.comparisonOptions);

  return {
    payload: {
      graph: graphName,
      strandAction: 'compare',
      strandId,
      against: values.againstRaw,
      comparison,
    },
    exitCode: EXIT_CODES.OK,
  };
}
