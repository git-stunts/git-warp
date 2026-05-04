import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.ts';

import { openDebugContext, resolveLamportCeiling } from './shared.ts';
import type { CliOptions, WarpGraphInstance } from '../../types.ts';

export const DEBUG_TOPIC = Object.freeze({
  name: 'conflicts',
  summary: 'Analyze conflict provenance at the current frontier',
});

type ConflictKind = 'supersession' | 'eventual_override' | 'redundancy';

const DEBUG_CONFLICT_OPTIONS = {
  'strand': { type: 'string' },
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
 * Check whether any target-narrowing fields are present without a target-kind.
 * Returns true if validation should stop early.
 */
function rejectOrphanTargetFields({ hasTargetField, targetKind, ctx }: { hasTargetField: boolean; targetKind: unknown; ctx: z.RefinementCtx }): boolean {
  if (hasTargetField && targetKind === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--target-kind is required when using --property-key, --from, --to, or --label',
    });
    return true;
  }
  return false;
}

/** Dispatch target-kind-specific validation to the appropriate sub-validator. */
function dispatchTargetKindValidation({ targetKind, propertyKey, from, to, label, ctx }: { targetKind: unknown; propertyKey: unknown; from: unknown; to: unknown; label: unknown; ctx: z.RefinementCtx }): void {
  if (targetKind === 'node') {
    validateNodeSelector({ propertyKey, from, to, label, ctx });
  } else if (targetKind === 'edge') {
    validateEdgeSelector({ propertyKey, from, to, label, ctx });
  } else if (targetKind === 'node_property') {
    validateNodePropertySelector({ from, to, label, ctx });
  } else if (targetKind === 'edge_property') {
    validateEdgePropertySelector({ propertyKey, from, to, label, ctx });
  }
}

/** Validate the conflict selector shape — ensure target-kind-specific fields are consistent. */
function validateConflictSelectorShape(val: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const targetKind = val['target-kind'];
  const propertyKey = val['property-key'];
  const { from, to, label } = val;
  const hasTargetField = propertyKey !== undefined ||
    from !== undefined ||
    to !== undefined ||
    label !== undefined;

  if (rejectOrphanTargetFields({ hasTargetField, targetKind, ctx })) {
    return;
  }
  dispatchTargetKindValidation({ targetKind, propertyKey, from, to, label, ctx });
}

/** Validate that node target selectors do not include edge-only fields. */
function validateNodeSelector({ propertyKey, from, to, label, ctx }: { propertyKey: unknown; from: unknown; to: unknown; label: unknown; ctx: z.RefinementCtx }): void {
  if (propertyKey !== undefined || from !== undefined || to !== undefined || label !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'node target selector only supports --entity-id',
    });
  }
}

/** Validate that edge target selectors have required identity fields and no property-key. */
function validateEdgeSelector({ propertyKey, from, to, label, ctx }: { propertyKey: unknown; from: unknown; to: unknown; label: unknown; ctx: z.RefinementCtx }): void {
  if (propertyKey !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'edge target selector does not support --property-key',
    });
  }
  validateEdgeIdentity({ from, to, label, ctx });
}

/** Validate that node_property selectors do not include edge identity fields. */
function validateNodePropertySelector({ from, to, label, ctx }: { from: unknown; to: unknown; label: unknown; ctx: z.RefinementCtx }): void {
  if (from !== undefined || to !== undefined || label !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'node_property target selector only supports --entity-id and --property-key',
    });
  }
}

/** Validate that edge_property selectors require property-key and edge identity fields. */
function validateEdgePropertySelector({ propertyKey, from, to, label, ctx }: { propertyKey: unknown; from: unknown; to: unknown; label: unknown; ctx: z.RefinementCtx }): void {
  if (propertyKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--property-key is required for edge_property target selector',
    });
  }
  validateEdgeIdentity({ from, to, label, ctx });
}

/** Validate that all three edge identity fields (from, to, label) are present. */
function validateEdgeIdentity({ from, to, label, ctx }: { from: unknown; to: unknown; label: unknown; ctx: z.RefinementCtx }): void {
  if (from === undefined || to === undefined || label === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--from, --to, and --label are required for edge and edge_property target selectors',
    });
  }
}

/** Normalize the kind option into an array of conflict kind strings. */
function normalizeKinds(kind: ConflictKind | ConflictKind[] | undefined): ConflictKind[] {
  if (Array.isArray(kind)) {
    return kind;
  }
  if (kind !== undefined) {
    return [kind];
  }
  return [];
}

/** Build a target selector object from raw parsed values, or null if no target-kind given. */
function buildTargetSelector(val: Record<string, unknown>): { targetKind: string; entityId?: string | undefined; propertyKey?: string | undefined; from?: string | undefined; to?: string | undefined; label?: string | undefined } | null {
  if (val['target-kind'] === undefined) {
    return null;
  }
  const typed = val as { from?: string; to?: string; label?: string; 'target-kind': string; 'entity-id'?: string; 'property-key'?: string };
  return {
    targetKind: typed['target-kind'],
    entityId: typed['entity-id'],
    propertyKey: typed['property-key'],
    from: typed.from,
    to: typed.to,
    label: typed.label,
  };
}

/** Return the value if defined, otherwise null. */
function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

type ConflictSpec = {
  strandId: string | null;
  entityId: string | null;
  target: { targetKind: 'node' | 'edge' | 'node_property' | 'edge_property'; entityId?: string; propertyKey?: string; from?: string; to?: string; label?: string } | null;
  kinds: ConflictKind[];
  writerId: string | null;
  lamportCeiling: number | null;
  evidence: 'full' | 'summary' | 'standard';
  maxPatches: number | null;
};

/** Transform raw parsed conflict CLI values into the internal conflict filter shape. */
function transformConflictValues(val: Record<string, unknown>): ConflictSpec {
  const typed = val as { strand?: string; 'entity-id'?: string; kind?: ConflictKind | ConflictKind[]; 'writer-id'?: string; 'lamport-ceiling'?: number; evidence?: string; 'max-patches'?: number };
  return {
    strandId: orNull(typed.strand),
    entityId: orNull(typed['entity-id']),
    target: buildTargetSelector(val) as ConflictSpec['target'],
    kinds: normalizeKinds(typed.kind),
    writerId: orNull(typed['writer-id']),
    lamportCeiling: orNull(typed['lamport-ceiling']),
    evidence: (typed.evidence ?? 'standard') as ConflictSpec['evidence'],
    maxPatches: orNull(typed['max-patches']),
  };
}

const debugConflictsSchema = z.object({
  'strand': z.string().optional(),
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
}).strict().superRefine((val, ctx) => validateConflictSelectorShape(val, ctx)).transform(transformConflictValues);

/** Spreads a key-value pair only if the value is not null. */
function spreadNonNull<T>(key: string, value: T | null): Record<string, T> {
  if (value === null) { return {}; }
  return { [key]: value };
}

/** Build ConflictAnalyzeOptions from the parsed CLI spec and resolved lamport ceiling. */
function buildConflictAnalyzeOptions(
  spec: ConflictSpec,
  lamportCeiling: number | null,
): Parameters<WarpGraphInstance['analyzeConflicts']>[0] {
  return {
    ...spreadNonNull('strandId', spec.strandId),
    ...(lamportCeiling !== null ? { at: { lamportCeiling } } : {}),
    ...spreadNonNull('entityId', spec.entityId),
    ...spreadNonNull('target', spec.target),
    ...(spec.kinds.length > 0 ? { kind: spec.kinds } : {}),
    ...spreadNonNull('writerId', spec.writerId),
    evidence: spec.evidence,
    ...(spec.maxPatches !== null ? { scanBudget: { maxPatches: spec.maxPatches } } : {}),
  };
}

/** Handle the 'conflicts' debug topic — analyze conflict provenance at the current frontier. */
export async function handleDebugTopic({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values } = parseCommandArgs(args, DEBUG_CONFLICT_OPTIONS, debugConflictsSchema);
  const spec = values as unknown as ConflictSpec;
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(spec.lamportCeiling, activeCursor);
  const analysis = await graph.analyzeConflicts(buildConflictAnalyzeOptions(spec, lamportCeiling));

  return {
    payload: {
      graph: graphName,
      debugTopic: 'conflicts',
      ...(spec.strandId !== null ? { strandId: spec.strandId } : {}),
      ...analysis,
    },
    exitCode: EXIT_CODES.OK,
  };
}
