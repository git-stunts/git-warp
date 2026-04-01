import { z } from 'zod';

import { orsetElements } from '../../../../src/domain/crdt/ORSet.js';
import { EXIT_CODES, notFoundError, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

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

/**
 * Builds the summary payload from a materialized strand state.
 * @param {string} graphName - Name of the graph
 * @param {unknown} strand - Strand descriptor
 * @param {unknown} materialized - Raw materialization result (may contain receipts)
 * @returns {{payload: unknown, exitCode: number}}
 */
function buildMaterializePayload(graphName, strand, materialized) {
  const mat = /** @type {Record<string, unknown>} */ (materialized);
  const state = /** @type {{ nodeAlive: unknown, edgeAlive: unknown, prop: Map<string, unknown> }} */ (
    'state' in mat ? mat['state'] : mat
  );
  const receipts = 'state' in mat ? /** @type {unknown[]|undefined} */ (mat['receipts']) : undefined;

  return {
    payload: {
      graph: graphName,
      strandAction: 'materialize',
      strand,
      state,
      receipts,
      summary: {
        nodeCount: orsetElements(state.nodeAlive).length,
        edgeCount: orsetElements(state.edgeAlive).length,
        propertyCount: state.prop.size,
        receiptCount: receipts?.length ?? 0,
      },
    },
    exitCode: EXIT_CODES.OK,
  };
}

/**
 * Materializes a pinned strand coordinate and returns its state with optional tick receipts.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleStrandSubcommand({ options, args }) {
  const { values, positionals } = parseCommandArgs(args, MATERIALIZE_OPTIONS, materializeStrandSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph strand materialize <id> [--receipts]');
  }

  const strandId = positionals[0];
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
