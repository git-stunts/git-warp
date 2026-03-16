import { z } from 'zod';

import { orsetElements } from '../../../../src/domain/crdt/ORSet.js';
import { EXIT_CODES, notFoundError, parseCommandArgs, usageError } from '../../infrastructure.js';
import { openGraph } from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const WORKING_SET_SUBCOMMAND = Object.freeze({
  name: 'materialize',
  summary: 'Materialize the pinned working-set coordinate',
});

const MATERIALIZE_OPTIONS = {
  receipts: { type: 'boolean', default: false },
};

const materializeWorkingSetSchema = z.object({
  receipts: z.boolean().default(false),
}).strict();

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleWorkingSetSubcommand({ options, args }) {
  const { values, positionals } = parseCommandArgs(args, MATERIALIZE_OPTIONS, materializeWorkingSetSchema, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usageError('Usage: warp-graph working-set materialize <id> [--receipts]');
  }

  const workingSetId = positionals[0];
  const { graph, graphName } = await openGraph(options);
  const workingSet = await graph.getWorkingSet(workingSetId);
  if (!workingSet) {
    throw notFoundError(`Working set not found: ${workingSetId}`);
  }

  const materialized = values.receipts
    ? await graph.materializeWorkingSet(workingSetId, { receipts: true })
    : await graph.materializeWorkingSet(workingSetId);

  const state = 'state' in materialized ? materialized.state : materialized;
  const receipts = 'state' in materialized ? materialized.receipts : undefined;

  return {
    payload: {
      graph: graphName,
      workingSetAction: 'materialize',
      workingSet,
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
