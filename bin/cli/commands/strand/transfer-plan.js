import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'transfer-plan',
  summary: 'Plan a deterministic transfer from one strand into live, base, or another strand',
});

const TRANSFER_PLAN_OPTIONS = {
  into: { type: 'string', default: 'live' },
  'lamport-ceiling': { type: 'string' },
  'into-lamport-ceiling': { type: 'string' },
};

const transferPlanSchema = z.object({
  into: z.string().default('live'),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'into-lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val, ctx) => {
  const rawInto = val.into.trim();
  /** @type {'base'|'live'|{ kind: 'strand', strandId: string }} */
  let into;
  if (rawInto === 'base' || rawInto === 'live') {
    into = rawInto;
  } else if (rawInto.startsWith('strand:') && rawInto.length > 'strand:'.length) {
    into = {
      kind: /** @type {const} */ ('strand'),
      strandId: rawInto.slice('strand:'.length),
    };
  } else {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['into'],
      message: 'into must be base, live, or strand:<id>',
    });
    return z.NEVER;
  }

  return {
    intoRaw: rawInto,
    transferOptions: /** @type {{
      into?: 'base'|'live'|{ kind: 'strand', strandId: string },
      ceiling?: number|null,
      intoCeiling?: number|null
    }} */ ({
      into,
      ceiling: val['lamport-ceiling'] ?? null,
      intoCeiling: val['into-lamport-ceiling'] ?? null,
    }),
  };
});

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { values, positionals } = parseCommandArgs(args, TRANSFER_PLAN_OPTIONS, transferPlanSchema, {
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw usageError(
      'Usage: warp-graph strand transfer-plan <id> [--into live|base|strand:<id>] [--lamport-ceiling <n>] [--into-lamport-ceiling <n>]',
    );
  }

  const strandId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const transferPlan = await graph.planStrandTransfer(strandId, values.transferOptions);

  return {
    payload: {
      graph: graphName,
      strandAction: 'transfer-plan',
      strandId,
      into: values.intoRaw,
      transferPlan,
    },
    exitCode: EXIT_CODES.OK,
  };
}
