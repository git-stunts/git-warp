import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.ts';
import { openGraph } from '../../shared.ts';
import type { CliOptions } from '../../types.ts';

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

/** Parses and resolves the --against flag into a typed comparison target. */
function resolveAgainstTarget(rawAgainst: string, ctx: z.RefinementCtx): 'base' | 'live' | { kind: 'strand'; strandId: string } | typeof z.NEVER {
  if (rawAgainst === 'base' || rawAgainst === 'live') {
    return rawAgainst;
  }
  if (rawAgainst.startsWith('strand:') && rawAgainst.length > 'strand:'.length) {
    return {
      kind: 'strand' as const,
      strandId: rawAgainst.slice('strand:'.length),
    };
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['against'],
    message: 'against must be base, live, or strand:<id>',
  });
  return z.NEVER;
}

const compareStrandSchema = z.object({
  against: z.string().default('base'),
  'target-id': z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  'against-lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val, ctx) => {
  const rawAgainst = val.against.trim();
  const against = resolveAgainstTarget(rawAgainst, ctx);

  const comparisonOptions = {
    against,
    ceiling: val['lamport-ceiling'] ?? null,
    againstCeiling: val['against-lamport-ceiling'] ?? null,
    targetId: val['target-id'],
  } as {
    against?: 'base' | 'live' | { kind: 'strand'; strandId: string };
    ceiling?: number | null;
    againstCeiling?: number | null;
    targetId?: string | null;
  };

  return {
    againstRaw: rawAgainst,
    comparisonOptions,
  };
});

/** Handles the `strand compare` CLI subcommand, comparing a strand against a target. */
export async function handleStrandSubcommand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values, positionals } = parseCommandArgs(args, COMPARE_OPTIONS, compareStrandSchema, {
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw usageError(
      'Usage: warp-graph strand compare <id> [--against base|live|strand:<id>] [--target-id <id>] [--lamport-ceiling <n>] [--against-lamport-ceiling <n>]',
    );
  }

  const strandId = positionals[0] ?? '';
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
