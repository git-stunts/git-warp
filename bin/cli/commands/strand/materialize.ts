import { z } from 'zod';

import { EXIT_CODES, notFoundError, parseCommandArgs, usageError } from '../../infrastructure.ts';
import { openGraph } from '../../shared.ts';
import type { CliOptions } from '../../types.ts';

export const STRAND_SUBCOMMAND = Object.freeze({
  name: 'materialize',
  summary: 'Materialize the pinned strand coordinate',
});

const MATERIALIZE_OPTIONS = {
  receipts: { type: 'boolean', default: false },
};

const materializeStrandSchema = z.object({
  receipts: z.boolean().default(false),
}).strict();

/** Builds the summary payload from a materialized strand state. */
function buildMaterializePayload(graphName: string, strand: unknown, materialized: unknown): { payload: unknown; exitCode: number } {
  const mat = materialized as { state?: { nodeAlive: unknown; edgeAlive: unknown; prop: Map<string, unknown> }; receipts?: unknown[] };
  const state = (
    mat.state !== undefined ? mat.state : mat
  ) as { nodeAlive: unknown; edgeAlive: unknown; prop: Map<string, unknown> };
  const receipts = mat.state !== undefined ? mat.receipts : undefined;

  return {
    payload: {
      graph: graphName,
      strandAction: 'materialize',
      strand,
      state,
      receipts,
      summary: {
        nodeCount: (state.nodeAlive as { elements: () => Array<number> }).elements().length,
        edgeCount: (state.edgeAlive as { elements: () => Array<number> }).elements().length,
        propertyCount: state.prop.size,
        receiptCount: receipts?.length ?? 0,
      },
    },
    exitCode: EXIT_CODES.OK,
  };
}

/** Materializes a pinned strand coordinate and returns its state with optional tick receipts. */
export async function handleStrandSubcommand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values, positionals } = parseCommandArgs(args, MATERIALIZE_OPTIONS, materializeStrandSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph strand materialize <id> [--receipts]');
  }

  const strandId = positionals[0] as string;
  const { graph, graphName } = await openGraph(options);
  const strand = await graph.getStrand(strandId);
  if (!strand) {
    throw notFoundError(`Strand not found: ${strandId}`);
  }

  const materialized = values.receipts
    ? await graph.materializeStrand(strandId, { receipts: true })
    : await graph.materializeStrand(strandId);

  return buildMaterializePayload(graphName, strand, materialized);
}
