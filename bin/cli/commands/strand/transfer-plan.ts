import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.ts';
import { openGraph } from '../../shared.ts';
import type { CliOptions } from '../../types.ts';

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'transfer-plan',
  summary: 'Plan a deterministic transfer from one strand into live, base, or another strand',
});

const TRANSFER_PLAN_OPTIONS = {
  into: { type: 'string', default: 'live' },
  'lamport-ceiling': { type: 'string' },
  'into-lamport-ceiling': { type: 'string' },
};

/** Parses the raw `into` string into a typed target descriptor. */
function parseIntoTarget(rawInto: string, ctx: z.RefinementCtx): 'base' | 'live' | { kind: 'strand'; strandId: string } | typeof z.NEVER {
  if (rawInto === 'base' || rawInto === 'live') {
    return rawInto;
  }
  if (rawInto.startsWith('strand:') && rawInto.length > 'strand:'.length) {
    return { kind: 'strand' as const, strandId: rawInto.slice('strand:'.length) };
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['into'], message: 'into must be base, live, or strand:<id>' });
  return z.NEVER;
}

const transferPlanSchema = z.object({
  into: z.string().default('live'),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'into-lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val, ctx) => {
  const rawInto = val.into.trim();
  const into = parseIntoTarget(rawInto, ctx);

  return {
    intoRaw: rawInto,
    transferOptions: {
      into,
      ceiling: val['lamport-ceiling'] ?? null,
      intoCeiling: val['into-lamport-ceiling'] ?? null,
    } as {
      into?: 'base' | 'live' | { kind: 'strand'; strandId: string };
      ceiling?: number | null;
      intoCeiling?: number | null;
    },
  };
});

/** Plans a deterministic transfer from one strand into a target. */
export async function handleStrandSubcommand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values, positionals } = parseCommandArgs(args, TRANSFER_PLAN_OPTIONS, transferPlanSchema, {
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw usageError(
      'Usage: warp-graph strand transfer-plan <id> [--into live|base|strand:<id>] [--lamport-ceiling <n>] [--into-lamport-ceiling <n>]',
    );
  }

  const strandId = positionals[0] ?? '';
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
