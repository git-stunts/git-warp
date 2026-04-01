import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import { openDebugContext, resolveLamportCeiling } from './shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const DEBUG_TOPIC = Object.freeze({
  name: 'conflicts',
  summary: 'Analyze conflict provenance at the current frontier',
});

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
 * @param {{hasTargetField: boolean, targetKind: unknown, ctx: import('zod').RefinementCtx}} params - Check params.
 * @returns {boolean} True if validation should stop early.
 */
function rejectOrphanTargetFields({ hasTargetField, targetKind, ctx }) {
  if (hasTargetField && targetKind === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--target-kind is required when using --property-key, --from, --to, or --label',
    });
    return true;
  }
  return false;
}

/**
 * Dispatch target-kind-specific validation to the appropriate sub-validator.
 * @param {{targetKind: unknown, propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params - Dispatch params.
 * @returns {void}
 */
function dispatchTargetKindValidation({ targetKind, propertyKey, from, to, label, ctx }) {
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

/**
 * Validate the conflict selector shape — ensure target-kind-specific fields are consistent.
 * @param {Record<string, unknown>} val - Raw parsed values.
 * @param {import('zod').RefinementCtx} ctx - Zod refinement context.
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

  if (rejectOrphanTargetFields({ hasTargetField, targetKind, ctx })) {
    return;
  }
  dispatchTargetKindValidation({ targetKind, propertyKey, from, to, label, ctx });
}

/**
 * Validate that node target selectors do not include edge-only fields.
 * @param {{propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params - Selector fields.
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
 * Validate that edge target selectors have required identity fields and no property-key.
 * @param {{propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params - Selector fields.
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
 * Validate that node_property selectors do not include edge identity fields.
 * @param {{from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params - Selector fields.
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
 * Validate that edge_property selectors require property-key and edge identity fields.
 * @param {{propertyKey: unknown, from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params - Selector fields.
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
 * Validate that all three edge identity fields (from, to, label) are present.
 * @param {{from: unknown, to: unknown, label: unknown, ctx: import('zod').RefinementCtx}} params - Edge identity fields.
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

/**
 * Normalize the kind option into an array of conflict kind strings.
 * @param {string|string[]|undefined} kind - Raw kind value from CLI.
 * @returns {string[]}
 */
function normalizeKinds(kind) {
  if (Array.isArray(kind)) {
    return kind;
  }
  if (kind !== undefined && kind !== '') {
    return [kind];
  }
  return [];
}

/**
 * Build a target selector object from raw parsed values, or null if no target-kind given.
 * @param {Record<string, unknown>} val - Raw parsed values.
 * @returns {object|null}
 */
function buildTargetSelector(val) {
  if (val['target-kind'] === undefined) {
    return null;
  }
  return {
    targetKind: val['target-kind'],
    entityId: val['entity-id'],
    propertyKey: val['property-key'],
    from: val.from,
    to: val.to,
    label: val.label,
  };
}

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
 * Transform raw parsed conflict CLI values into the internal conflict filter shape.
 * @param {Record<string, unknown>} val - Raw parsed values from Zod schema.
 * @returns {{strandId: string|null, entityId: string|null, target: object|null, kinds: string[], writerId: string|null, lamportCeiling: number|null, evidence: string, maxPatches: number|null}}
 */
function transformConflictValues(val) {
  return {
    strandId: orNull(/** @type {string|undefined} */ (val.strand)),
    entityId: orNull(/** @type {string|undefined} */ (val['entity-id'])),
    target: buildTargetSelector(val),
    kinds: normalizeKinds(/** @type {string|string[]|undefined} */ (val.kind)),
    writerId: orNull(/** @type {string|undefined} */ (val['writer-id'])),
    lamportCeiling: orNull(/** @type {number|undefined} */ (val['lamport-ceiling'])),
    evidence: /** @type {string|undefined} */ (val.evidence) ?? 'standard',
    maxPatches: orNull(/** @type {number|undefined} */ (val['max-patches'])),
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

/**
 * Convert a nullable value to undefined for optional API fields.
 * @param {unknown} value - Value that may be null.
 * @returns {unknown}
 */
function nullToUndefined(value) {
  return value === null ? undefined : value;
}

/**
 * Build ConflictAnalyzeOptions from the parsed CLI spec and resolved lamport ceiling.
 * @param {ReturnType<typeof debugConflictsSchema.parse>} spec - Parsed conflict filter spec.
 * @param {number|null} lamportCeiling - Resolved lamport ceiling.
 * @returns {import('../../../../src/domain/services/ConflictAnalyzerService.js').ConflictAnalyzeOptions}
 */
function buildConflictAnalyzeOptions(spec, lamportCeiling) {
  return {
    strandId: nullToUndefined(spec.strandId),
    at: lamportCeiling === null ? undefined : { lamportCeiling },
    entityId: nullToUndefined(spec.entityId),
    target: nullToUndefined(spec.target),
    kind: spec.kinds.length === 0 ? undefined : spec.kinds,
    writerId: nullToUndefined(spec.writerId),
    evidence: spec.evidence,
    scanBudget: spec.maxPatches === null ? undefined : { maxPatches: spec.maxPatches },
  };
}

/**
 * Handle the 'conflicts' debug topic — analyze conflict provenance at the current frontier.
 * @param {{options: CliOptions, args: string[]}} params - CLI invocation context.
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values } = parseCommandArgs(args, DEBUG_CONFLICT_OPTIONS, debugConflictsSchema);
  const { graph, graphName, activeCursor } = await openDebugContext(options);
  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const analysis = await graph.analyzeConflicts(buildConflictAnalyzeOptions(values, lamportCeiling));

  return {
    payload: {
      graph: graphName,
      debugTopic: 'conflicts',
      ...(values.strandId !== null ? { strandId: values.strandId } : {}),
      ...analysis,
    },
    exitCode: EXIT_CODES.OK,
  };
}
