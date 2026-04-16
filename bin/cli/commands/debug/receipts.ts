import { z } from 'zod';

import { OP_TYPES, RESULT_TYPES } from '../../../../src/domain/types/TickReceipt.ts';
import type { TickReceipt, OpOutcome } from '../../../../src/domain/types/TickReceipt.ts';
import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.ts';

import {
  compareNumbers,
  compareStrings,
  loadStrandContextForDebug,
  matchesShaPrefix,
  materializeForDebug,
  openDebugContext,
  resolveLamportCeiling,
} from './shared.ts';
import type { CliOptions, WarpGraphInstance } from '../../types.ts';

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

/** Return the value if defined, otherwise null. */
function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

type ReceiptFilter = {
  strandId: string | null;
  writerId: string | null;
  patch: string | null;
  target: string | null;
  results: string[];
  opTypes: string[];
  lamportCeiling: number | null;
  limit: number | null;
};

/** Transform raw parsed CLI values into the internal receipt filter shape. */
function transformReceiptValues(val: Record<string, unknown>): ReceiptFilter {
  return {
    strandId: orNull(val['strand'] as string | undefined),
    writerId: orNull(val['writer-id'] as string | undefined),
    patch: orNull(val['patch'] as string | undefined),
    target: orNull(val['target'] as string | undefined),
    results: normalizeRepeatedOption(val['result'] as string | string[] | undefined),
    opTypes: normalizeRepeatedOption(val['op'] as string | string[] | undefined),
    lamportCeiling: orNull(val['lamport-ceiling'] as number | undefined),
    limit: orNull(val['limit'] as number | undefined),
  };
}

const debugReceiptsSchema = z.object({
  'strand': z.string().optional(),
  'writer-id': z.string().optional(),
  patch: z.string().optional(),
  target: z.string().optional(),
  result: z.union([
    z.enum([...RESULT_TYPES] as [string, ...string[]]),
    z.array(z.enum([...RESULT_TYPES] as [string, ...string[]])),
  ]).optional(),
  op: z.union([
    z.enum([...OP_TYPES] as [string, ...string[]]),
    z.array(z.enum([...OP_TYPES] as [string, ...string[]])),
  ]).optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).strict().transform(transformReceiptValues);

/** Normalize a CLI option that may be a single string, an array, or undefined into an array. */
function normalizeRepeatedOption(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== undefined && value !== '') {
    return [value];
  }
  return [];
}

/** Sort receipts by lamport clock, then writer, then patch SHA for deterministic output. */
function sortReceipts(receipts: TickReceipt[]): TickReceipt[] {
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

/** Count occurrences of each result type across all op outcomes. */
function summarizeResultCounts(ops: OpOutcome[]): { applied: number; superseded: number; redundant: number } {
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

/** Count occurrences of each op type across all op outcomes. */
function summarizeOpCounts(ops: OpOutcome[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const op of ops) {
    counts[op.op] = (counts[op.op] ?? 0) + 1;
  }
  return counts;
}

/** Check whether a target filter matches the given op. */
function matchesTargetFilter(op: OpOutcome, target: string | null): boolean {
  return target === null || op.target === target;
}

/** Check whether a list filter includes the given value (empty list means no filter). */
function matchesListFilter(allowed: string[], value: string): boolean {
  return allowed.length === 0 || allowed.includes(value);
}

/** Check whether an op matches all active filters (target, result type, op type). */
function matchesOpFilters(op: OpOutcome, filters: { target: string | null; results: string[]; opTypes: string[] }): boolean {
  return matchesTargetFilter(op, filters.target) &&
    matchesListFilter(filters.results, op.result) &&
    matchesListFilter(filters.opTypes, op.op);
}

/** Filter a receipt by writer, patch SHA, and op-level filters; return null if no ops match. */
function filterReceipt(receipt: TickReceipt, filters: ReceiptFilter): { patchSha: string; writer: string; lamport: number; totalOps: number; matchedOps: number; ops: OpOutcome[] } | null {
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

/** Materialize the graph with receipt collection enabled and return the receipts. */
async function loadReceipts({ graph, lamportCeiling, strandId }: {
  graph: WarpGraphInstance;
  lamportCeiling: number | null;
  strandId: string | null;
}): Promise<TickReceipt[]> {
  const materialized = await materializeForDebug(graph, {
    lamportCeiling,
    collectReceipts: true,
    strandId,
  }) as { state: unknown; receipts: TickReceipt[] };
  return materialized.receipts;
}

/** Build the JSON payload for the receipts debug topic. */
function buildReceiptsPayload(ctx: {
  graphName: string;
  values: ReceiptFilter;
  strand: unknown;
  lamportCeiling: number | null;
  sortedReceipts: TickReceipt[];
  returnedReceipts: Array<{ ops: OpOutcome[] }>;
  filteredCount: number;
}): Record<string, unknown> {
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

/** Handle the 'receipts' debug topic — load, filter, and format tick receipts. */
export async function handleDebugTopic({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_RECEIPT_OPTIONS, debugReceiptsSchema);
  const values = rawValues;
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
    .filter((receipt): receipt is NonNullable<typeof receipt> => receipt !== null);
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
