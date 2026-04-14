import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../../infrastructure.ts';
import { openGraph } from '../../shared.ts';
import type { CliOptions } from '../../types.ts';

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'drop',
  summary: 'Delete a strand descriptor',
});

const DROP_OPTIONS: Record<string, { type: string; short?: string; default?: unknown; multiple?: boolean }> = {};
const dropStrandSchema = z.object({}).strict();

/** Handles the `strand drop` CLI subcommand, deleting a strand descriptor by ID. */
export async function handleStrandSubcommand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { positionals } = parseCommandArgs(args, DROP_OPTIONS, dropStrandSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph strand drop <id>');
  }

  const strandId = positionals[0] ?? '';
  const { graph, graphName } = await openGraph(options);
  const dropped = await graph.dropStrand(strandId);

  return {
    payload: {
      graph: graphName,
      strandAction: 'drop',
      strandId,
      dropped,
    },
    exitCode: dropped ? EXIT_CODES.OK : EXIT_CODES.NOT_FOUND,
  };
}
