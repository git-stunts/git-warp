import { z } from 'zod';

import { OP_TYPES, RESULT_TYPES } from '../../../../src/domain/types/TickReceipt.js';
import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import {
  compareNumbers,
  compareStrings,
  loadStrandContextForDebug,
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
  'strand': { type: 'string' },
  'writer-id': { type: 'string' },
  patch: { type: 'string' },
  target: { type: 'string' },
  result: { type: 'string', multiple: true },
  op: { type: 'string', multiple: true },
  'lamport-ceiling': { type: 'string' },
  limit: { type: 'string' },
};

/**
 * Return the value if defined, otherwise null.
 * @template T
 * @param {T|undefined} value - Possibly undefined value.
 * @returns {T|null}
 */
function orNull(value) {
  return value === undefined ? null : value;
}

/**
 * Transform raw parsed CLI values into the internal receipt filter shape.
 * @param {Record<string, unknown>} val - Raw parsed values from Zod schema.
 * @returns {{strandId: string|null, writerId: string|null, patch: string|null, target: string|null, results: string[], opTypes: string[], lamportCeiling: number|null, limit: number|null}}
 */
function transformReceiptValues(val) {
  return {
    strandId: orNull(/** @type {string|undefined} */ (val.strand)),
    writerId: orNull(/** @type {string|undefined} */ (val['writer-id'])),
    patch: orNull(/** @type {string|undefined} */ (val.patch)),
    target: orNull(/** @type {string|undefined} */ (val.target)),
    results: normalizeRepeatedOption(/** @type {string|string[]|undefined} */ (val.result)),
    opTypes: normalizeRepeatedOption(/** @type {string|string[]|undefined} */ (val.op)),
    lamportCeiling: orNull(/** @type {number|undefined} */ (val['lamport-ceiling'])),
    limit: orNull(/** @type {number|undefined} */ (val.limit)),
  };
}

const debugReceiptsSchema = z.object({
  'strand': z.string().optional(),
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
}).strict().transform(transformReceiptValues);

/**
 * Normalize a CLI option that may be a single string, an array, or undefined into an array.
 * @param {string|string[]|undefined} value - Raw option value.
 * @returns {string[]}
 */
function normalizeRepeatedOption(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== undefined && value !== '') {
    return [value];
  }
  return [];
}

/**
 * Sort receipts by lamport clock, then writer, then patch SHA for deterministic output.
 * @param {TickReceipt[]} receipts - Unsorted receipts.
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
 * Count occurrences of each result type across all op outcomes.
 * @param {OpOutcome[]} ops - Op outcomes to summarize.
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
 * Count occurrences of each op type across all op outcomes.
 * @param {OpOutcome[]} ops - Op outcomes to summarize.
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
 * Check whether a target filter matches the given op.
 * @param {OpOutcome} op - The op outcome to test.
 * @param {string|null} target - Target filter value.
 * @returns {boolean}
 */
function matchesTargetFilter(op, target) {
  return target === null || op.target === target;
}

/**
 * Check whether a list filter includes the given value (empty list means no filter).
 * @param {string[]} allowed - Allowed values (empty = accept all).
 * @param {string} value - Value to check.
 * @returns {boolean}
 */
function matchesListFilter(allowed, value) {
  return allowed.length === 0 || allowed.includes(value);
}

/**
 * Check whether an op matches all active filters (target, result type, op type).
 * @param {OpOutcome} op - The op outcome to test.
 * @param {{
 *   target: string|null,
 *   results: string[],
 *   opTypes: string[]
 * }} filters - Active filters.
 * @returns {boolean}
 */
function matchesOpFilters(op, filters) {
  return matchesTargetFilter(op, filters.target) &&
    matchesListFilter(filters.results, op.result) &&
    matchesListFilter(filters.opTypes, op.op);
}

/**
 * Filter a receipt by writer, patch SHA, and op-level filters; return null if no ops match.
 * @param {TickReceipt} receipt - The tick receipt to filter.
 * @param {{
 *   writerId: string|null,
 *   patch: string|null,
 *   target: string|null,
 *   results: string[],
 *   opTypes: string[]
 * }} filters - Active filters.
 * @returns {{patchSha: string, writer: string, lamport: number, totalOps: number, matchedOps: number, ops: OpOutcome[]}|null}
 */
function filterReceipt(receipt, filters) {
  if (filters.writerId !== null && receipt.writer !== filters.writerId) {
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
 * Materialize the graph with receipt collection enabled and return the receipts.
 * @param {{
 *   graph: import('../../types.js').WarpGraphInstance,
 *   lamportCeiling: number|null,
 *   strandId: string|null
 * }} params - Materialization parameters.
 * @returns {Promise<TickReceipt[]>}
 */
async function loadReceipts({ graph, lamportCeiling, strandId }) {
  const materialized = /** @type {{state: unknown, receipts: TickReceipt[]}} */ (
    await materializeForDebug(graph, {
      lamportCeiling,
      collectReceipts: true,
      strandId,
    })
  );
  return materialized.receipts;
}

/**
 * Build the JSON payload for the receipts debug topic.
 * @param {{
 *   graphName: string,
 *   values: ReturnType<typeof debugReceiptsSchema.parse>,
 *   strand: unknown,
 *   lamportCeiling: number|null,
 *   sortedReceipts: TickReceipt[],
 *   returnedReceipts: Array<{ops: OpOutcome[]}>,
 *   filteredCount: number
 * }} ctx - Aggregated receipt data.
 * @returns {Record<string, unknown>}
 */
function buildReceiptsPayload(ctx) {
  const flattenedOps = ctx.returnedReceipts.flatMap((r) => r.ops);
  return {
    graph: ctx.graphName,
    debugTopic: 'receipts',
    ...(ctx.values.strandId !== null ? { strandId: ctx.values.strandId } : {}),
    ...(ctx.strand !== null ? { strand: ctx.strand } : {}),
    lamportCeiling: ctx.lamportCeiling,
    filters: {
      writerId: ctx.values.writerId,
      patch: ctx.values.patch,
      target: ctx.values.target,
      results: ctx.values.results,
      opTypes: ctx.values.opTypes,
    },
    totalReceipts: ctx.sortedReceipts.length,
    matchedReceipts: ctx.filteredCount,
    returnedReceipts: ctx.returnedReceipts.length,
    truncated: ctx.returnedReceipts.length < ctx.filteredCount,
    summary: {
      results: summarizeResultCounts(flattenedOps),
      opTypes: summarizeOpCounts(flattenedOps),
    },
    receipts: ctx.returnedReceipts,
  };
}

/**
 * Handle the 'receipts' debug topic — load, filter, and format tick receipts.
 * @param {{options: CliOptions, args: string[]}} params - CLI invocation context.
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_RECEIPT_OPTIONS, debugReceiptsSchema);
  const values = /** @type {ReturnType<typeof debugReceiptsSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const strand = values.strandId !== null
    ? await loadStrandContextForDebug(graph, values.strandId)
    : null;
  const sortedReceipts = sortReceipts(await loadReceipts({
    graph, lamportCeiling, strandId: values.strandId,
  }));
  const filteredReceipts = sortedReceipts
    .map((receipt) => filterReceipt(receipt, values))
    .filter((receipt) => receipt !== null);
  const returnedReceipts = values.limit === null
    ? filteredReceipts
    : filteredReceipts.slice(0, values.limit);

  return {
    payload: buildReceiptsPayload({
      graphName, values, strand, lamportCeiling,
      sortedReceipts, returnedReceipts, filteredCount: filteredReceipts.length,
    }),
    exitCode: EXIT_CODES.OK,
  };
}
