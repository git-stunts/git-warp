import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.ts';
import { openGraph } from '../../shared.ts';
import type { CliOptions } from '../../types.ts';

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'list',
  summary: 'List strand descriptors for the graph',
});

const LIST_OPTIONS: Record<string, { type: string; short?: string; default?: unknown; multiple?: boolean }> = {};
const listStrandSchema = z.object({}).strict();

/** Lists all strand descriptors for the graph. */
export async function handleStrandSubcommand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  parseCommandArgs(args, LIST_OPTIONS, listStrandSchema);
  const { graph, graphName } = await openGraph(options);
  const strands = await graph.listStrands();

  return {
    payload: {
      graph: graphName,
      strandAction: 'list',
      strands,
    },
    exitCode: EXIT_CODES.OK,
  };
}
