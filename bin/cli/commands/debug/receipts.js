import { z } from 'zod';

import { OP_TYPES, RESULT_TYPES } from '../../../../src/domain/types/TickReceipt.js';
import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import {
  compareNumbers,
  compareStrings,
  matchesShaPrefix,
  materializeForDebug,
  openDebugContext,
  resolveLamportCeiling,
} from './shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {import('../../../../src/domain/types/TickReceipt.js').TickReceipt} TickReceipt */
/** @typedef {import('../../../../src/domain/types/TickReceipt.js').OpOutcome} OpOutcome */

export const DEBUG_TOPIC = Object.freeze({
  name: 'receipts',
  summary: 'Inspect reducer tick receipts and per-op outcomes',
});

const DEBUG_RECEIPT_OPTIONS = {
  'writer-id': { type: 'string' },
  patch: { type: 'string' },
  target: { type: 'string' },
  result: { type: 'string', multiple: true },
  op: { type: 'string', multiple: true },
  'lamport-ceiling': { type: 'string' },
  limit: { type: 'string' },
};

const debugReceiptsSchema = z.object({
  'writer-id': z.string().optional(),
  patch: z.string().optional(),
  target: z.string().optional(),
  result: z.union([
    z.enum(/** @type {[string, ...string[]]} */ ([...RESULT_TYPES])),
    z.array(z.enum(/** @type {[string, ...string[]]} */ ([...RESULT_TYPES]))),
  ]).optional(),
  op: z.union([
    z.enum(/** @type {[string, ...string[]]} */ ([...OP_TYPES])),
    z.array(z.enum(/** @type {[string, ...string[]]} */ ([...OP_TYPES]))),
  ]).optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).strict().transform((val) => ({
  writerId: val['writer-id'] ?? null,
  patch: val.patch ?? null,
  target: val.target ?? null,
  results: Array.isArray(val.result) ? val.result : val.result ? [val.result] : [],
  opTypes: Array.isArray(val.op) ? val.op : val.op ? [val.op] : [],
  lamportCeiling: val['lamport-ceiling'] ?? null,
  limit: val.limit ?? null,
}));

/**
 * @param {TickReceipt[]} receipts
 * @returns {TickReceipt[]}
 */
function sortReceipts(receipts) {
  return [...receipts].sort((a, b) => {
    const lamportCmp = compareNumbers(a.lamport, b.lamport);
    if (lamportCmp !== 0) {
      return lamportCmp;
    }
    const writerCmp = compareStrings(a.writer, b.writer);
    if (writerCmp !== 0) {
      return writerCmp;
    }
    return compareStrings(a.patchSha, b.patchSha);
  });
}

/**
 * @param {OpOutcome[]} ops
 * @returns {{applied: number, superseded: number, redundant: number}}
 */
function summarizeResultCounts(ops) {
  return ops.reduce((acc, op) => {
    if (op.result === 'applied') {
      acc.applied += 1;
    } else if (op.result === 'superseded') {
      acc.superseded += 1;
    } else if (op.result === 'redundant') {
      acc.redundant += 1;
    }
    return acc;
  }, { applied: 0, superseded: 0, redundant: 0 });
}

/**
 * @param {OpOutcome[]} ops
 * @returns {Record<string, number>}
 */
function summarizeOpCounts(ops) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const op of ops) {
    counts[op.op] = (counts[op.op] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {OpOutcome} op
 * @param {{
 *   target: string|null,
 *   results: string[],
 *   opTypes: string[]
 * }} filters
 * @returns {boolean}
 */
function matchesOpFilters(op, filters) {
  if (filters.target && op.target !== filters.target) {
    return false;
  }
  if (filters.results.length > 0 && !filters.results.includes(op.result)) {
    return false;
  }
  if (filters.opTypes.length > 0 && !filters.opTypes.includes(op.op)) {
    return false;
  }
  return true;
}

/**
 * @param {TickReceipt} receipt
 * @param {{
 *   writerId: string|null,
 *   patch: string|null,
 *   target: string|null,
 *   results: string[],
 *   opTypes: string[]
 * }} filters
 * @returns {{patchSha: string, writer: string, lamport: number, totalOps: number, matchedOps: number, ops: OpOutcome[]}|null}
 */
function filterReceipt(receipt, filters) {
  if (filters.writerId && receipt.writer !== filters.writerId) {
    return null;
  }
  if (!matchesShaPrefix(receipt.patchSha, filters.patch)) {
    return null;
  }

  const ops = receipt.ops.filter((op) => matchesOpFilters(op, filters));
  if (ops.length === 0) {
    return null;
  }

  return {
    patchSha: receipt.patchSha,
    writer: receipt.writer,
    lamport: receipt.lamport,
    totalOps: receipt.ops.length,
    matchedOps: ops.length,
    ops,
  };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_RECEIPT_OPTIONS, debugReceiptsSchema);
  const values = /** @type {ReturnType<typeof debugReceiptsSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);

  const materialized = /** @type {{state: unknown, receipts: TickReceipt[]}} */ (
    await materializeForDebug(graph, lamportCeiling, true)
  );
  const sortedReceipts = sortReceipts(materialized.receipts);
  const filteredReceipts = sortedReceipts
    .map((receipt) => filterReceipt(receipt, values))
    .filter((receipt) => receipt !== null);
  const returnedReceipts = values.limit === null
    ? filteredReceipts
    : filteredReceipts.slice(0, values.limit);
  const flattenedOps = returnedReceipts.flatMap((receipt) => receipt.ops);

  return {
    payload: {
      graph: graphName,
      debugTopic: 'receipts',
      lamportCeiling,
      filters: {
        writerId: values.writerId,
        patch: values.patch,
        target: values.target,
        results: values.results,
        opTypes: values.opTypes,
      },
      totalReceipts: sortedReceipts.length,
      matchedReceipts: filteredReceipts.length,
      returnedReceipts: returnedReceipts.length,
      truncated: returnedReceipts.length < filteredReceipts.length,
      summary: {
        results: summarizeResultCounts(flattenedOps),
        opTypes: summarizeOpCounts(flattenedOps),
      },
      receipts: returnedReceipts,
    },
    exitCode: EXIT_CODES.OK,
  };
}
