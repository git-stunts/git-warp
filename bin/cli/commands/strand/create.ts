import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.ts';
import { openGraph } from '../../shared.ts';
import type { CliOptions } from '../../types.ts';

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'create',
  summary: 'Create a pinned strand descriptor',
});

const CREATE_OPTIONS = {
  id: { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  owner: { type: 'string' },
  scope: { type: 'string' },
  'lease-expires-at': { type: 'string' },
};

const createStrandSchema = z.object({
  id: z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  owner: z.string().optional(),
  scope: z.string().optional(),
  'lease-expires-at': z.string().optional(),
}).strict().transform(normalizeStrandValues);

/** Spreads an optional value into an object if defined. */
function optSpread(key: string, value: unknown): Record<string, unknown> {
  return value !== undefined ? { [key]: value } : {};
}

/** Normalizes parsed Zod values into strand create options. */
function normalizeStrandValues(val: { id?: string | undefined; 'lamport-ceiling'?: number | undefined; owner?: string | undefined; scope?: string | undefined; 'lease-expires-at'?: string | undefined }, _ctx: z.RefinementCtx): { strandId?: string; lamportCeiling: number | null; owner?: string; scope?: string; leaseExpiresAt?: string } {
  return {
    ...optSpread('strandId', val.id),
    lamportCeiling: val['lamport-ceiling'] ?? null,
    ...optSpread('owner', val.owner),
    ...optSpread('scope', val.scope),
    ...optSpread('leaseExpiresAt', val['lease-expires-at']),
  } as { strandId?: string; lamportCeiling: number | null; owner?: string; scope?: string; leaseExpiresAt?: string };
}

/** Handles the strand create subcommand by parsing arguments and creating a new strand descriptor. */
export async function handleStrandSubcommand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values } = parseCommandArgs(args, CREATE_OPTIONS, createStrandSchema);
  const { graph, graphName } = await openGraph(options);
  const strand = await graph.createStrand(values);

  return {
    payload: {
      graph: graphName,
      strandAction: 'create',
      strand,
    },
    exitCode: EXIT_CODES.OK,
  };
}
