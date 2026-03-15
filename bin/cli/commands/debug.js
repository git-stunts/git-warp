import { z } from 'zod';

import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.js';
import {
  openGraph,
  readActiveCursor,
  emitCursorWarning,
} from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const DEBUG_CONFLICT_OPTIONS = {
  'entity-id': { type: 'string' },
  'target-kind': { type: 'string' },
  'property-key': { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  label: { type: 'string' },
  kind: { type: 'string', multiple: true },
  'writer-id': { type: 'string' },
  'lamport-ceiling': { type: 'string' },
  evidence: { type: 'string' },
  'max-patches': { type: 'string' },
};

/**
 * @param {Record<string, unknown>} val
 * @param {import('zod').RefinementCtx} ctx
 * @returns {void}
 */
function validateConflictSelectorShape(val, ctx) {
  const targetKind = val['target-kind'];
  const propertyKey = val['property-key'];
  const { from, to, label } = val;
  const hasTargetField = propertyKey !== undefined ||
    from !== undefined ||
    to !== undefined ||
    label !== undefined;

  if (hasTargetField && targetKind === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--target-kind is required when using --property-key, --from, --to, or --label',
    });
    return;
  }

  if (targetKind === 'node') {
    validateNodeSelector({ propertyKey, from, to, label, ctx });
    return;
  }
  if (targetKind === 'edge') {
    validateEdgeSelector({ propertyKey, from, to, label, ctx });
    return;
  }
  if (targetKind === 'node_property') {
    validateNodePropertySelector({ from, to, label, ctx });
    return;
  }
  if (targetKind === 'edge_property') {
    validateEdgePropertySelector({ propertyKey, from, to, label, ctx });
  }
}

/**
 * @param {{propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params
 * @returns {void}
 */
function validateNodeSelector({ propertyKey, from, to, label, ctx }) {
  if (propertyKey !== undefined || from !== undefined || to !== undefined || label !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'node target selector only supports --entity-id',
    });
  }
}

/**
 * @param {{propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params
 * @returns {void}
 */
function validateEdgeSelector({ propertyKey, from, to, label, ctx }) {
  if (propertyKey !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'edge target selector does not support --property-key',
    });
  }
  validateEdgeIdentity({ from, to, label, ctx });
}

/**
 * @param {{from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params
 * @returns {void}
 */
function validateNodePropertySelector({ from, to, label, ctx }) {
  if (from !== undefined || to !== undefined || label !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'node_property target selector only supports --entity-id and --property-key',
    });
  }
}

/**
 * @param {{propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params
 * @returns {void}
 */
function validateEdgePropertySelector({ propertyKey, from, to, label, ctx }) {
  if (propertyKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--property-key is required for edge_property target selector',
    });
  }
  validateEdgeIdentity({ from, to, label, ctx });
}

/**
 * @param {{from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params
 * @returns {void}
 */
function validateEdgeIdentity({ from, to, label, ctx }) {
  if (from === undefined || to === undefined || label === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--from, --to, and --label are required for edge and edge_property target selectors',
    });
  }
}

const debugConflictsSchema = z.object({
  'entity-id': z.string().optional(),
  'target-kind': z.enum(['node', 'edge', 'node_property', 'edge_property']).optional(),
  'property-key': z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  label: z.string().optional(),
  kind: z.union([
    z.enum(['supersession', 'eventual_override', 'redundancy']),
    z.array(z.enum(['supersession', 'eventual_override', 'redundancy'])),
  ]).optional(),
  'writer-id': z.string().optional(),
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
  evidence: z.enum(['summary', 'standard', 'full']).optional(),
  'max-patches': z.coerce.number().int().positive().optional(),
}).strict().superRefine((val, ctx) => validateConflictSelectorShape(val, ctx)).transform((val) => {
  const kinds = Array.isArray(val.kind) ? val.kind : val.kind ? [val.kind] : [];
  const target = val['target-kind'] ? {
    targetKind: val['target-kind'],
    entityId: val['entity-id'],
    propertyKey: val['property-key'],
    from: val.from,
    to: val.to,
    label: val.label,
  } : null;

  return {
    entityId: val['entity-id'] ?? null,
    target,
    kinds,
    writerId: val['writer-id'] ?? null,
    lamportCeiling: val['lamport-ceiling'] ?? null,
    evidence: val.evidence ?? 'standard',
    maxPatches: val['max-patches'] ?? null,
  };
});

/**
 * @param {ReturnType<typeof debugConflictsSchema.parse>} spec
 * @param {number|null} lamportCeiling
 * @returns {import('../../../src/domain/services/ConflictAnalyzerService.js').ConflictAnalyzeOptions}
 */
function buildConflictAnalyzeOptions(spec, lamportCeiling) {
  return {
    at: lamportCeiling === null ? undefined : { lamportCeiling },
    entityId: spec.entityId ?? undefined,
    target: spec.target ?? undefined,
    kind: spec.kinds.length === 0 ? undefined : spec.kinds,
    writerId: spec.writerId ?? undefined,
    evidence: spec.evidence,
    scanBudget: spec.maxPatches === null ? undefined : { maxPatches: spec.maxPatches },
  };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleDebug({ options, args }) {
  const topic = args[0];
  const rest = args.slice(1);

  if (topic === 'conflicts') {
    return await handleDebugConflicts({ options, args: rest });
  }

  if (!topic) {
    throw usageError(
      'Usage: warp-graph debug <conflicts> [options]\n' +
      '  conflicts   Analyze conflict provenance at the current frontier'
    );
  }

  throw usageError(`Unknown debug topic: ${topic}. Use: conflicts`);
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
async function handleDebugConflicts({ options, args }) {
  const { values } = parseCommandArgs(args, DEBUG_CONFLICT_OPTIONS, debugConflictsSchema);
  const { graph, graphName, persistence } = await openGraph(options);
  const activeCursor = await readActiveCursor(persistence, graphName);
  const cursorInfo = {
    active: activeCursor !== null,
    tick: activeCursor?.tick ?? null,
    maxTick: null,
  };
  emitCursorWarning(cursorInfo, null);

  const lamportCeiling = values.lamportCeiling ?? activeCursor?.tick ?? null;
  const analysis = await graph.analyzeConflicts(buildConflictAnalyzeOptions(values, lamportCeiling));

  return {
    payload: {
      graph: graphName,
      debugTopic: 'conflicts',
      ...analysis,
    },
    exitCode: EXIT_CODES.OK,
  };
}
