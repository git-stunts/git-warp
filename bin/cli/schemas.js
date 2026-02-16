import { z } from 'zod';

// ============================================================================
// History
// ============================================================================

export const historySchema = z.object({
  node: z.string().optional(),
}).strict();

// ============================================================================
// Install-hooks
// ============================================================================

export const installHooksSchema = z.object({
  force: z.boolean().default(false),
}).strict();

// ============================================================================
// Verify-audit
// ============================================================================

export const verifyAuditSchema = z.object({
  since: z.string().min(1, 'Missing value for --since').optional(),
  writer: z.string().min(1, 'Missing value for --writer').optional(),
  'trust-mode': z.enum(['warn', 'enforce']).optional(),
  'trust-pin': z.string().min(1, 'Missing value for --trust-pin').optional(),
}).strict();

// ============================================================================
// Path
// ============================================================================

export const pathSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  dir: z.enum(['out', 'in', 'both']).optional(),
  label: z.union([z.string(), z.array(z.string())]).optional(),
  'max-depth': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val) => ({
  from: val.from ?? null,
  to: val.to ?? null,
  dir: val.dir,
  labels: Array.isArray(val.label) ? val.label : val.label ? [val.label] : [],
  maxDepth: val['max-depth'],
}));

// ============================================================================
// Query
// ============================================================================

export const querySchema = z.object({
  match: z.string().optional(),
  'where-prop': z.union([z.string(), z.array(z.string())]).optional(),
  select: z.string().optional(),
}).strict().transform((val) => ({
  match: val.match ?? null,
  whereProp: Array.isArray(val['where-prop']) ? val['where-prop'] : val['where-prop'] ? [val['where-prop']] : [],
  select: val.select,
}));

// ============================================================================
// View
// ============================================================================

export const viewSchema = z.object({
  list: z.boolean().default(false),
  log: z.boolean().default(false),
}).strict();

// ============================================================================
// Trust
// ============================================================================

export const trustSchema = z.object({
  mode: z.enum(['warn', 'enforce']).optional(),
  'trust-pin': z.string().min(1, 'Missing value for --trust-pin').optional(),
}).strict().transform((val) => ({
  mode: val.mode ?? null,
  trustPin: val['trust-pin'] ?? null,
}));

// ============================================================================
// Doctor
// ============================================================================

export const doctorSchema = z.object({
  strict: z.boolean().default(false),
}).strict();

// ============================================================================
// Seek
// ============================================================================

export const seekSchema = z.object({
  tick: z.string().optional(),
  latest: z.boolean().default(false),
  save: z.string().min(1, 'Missing value for --save').optional(),
  load: z.string().min(1, 'Missing value for --load').optional(),
  list: z.boolean().default(false),
  drop: z.string().min(1, 'Missing value for --drop').optional(),
  'clear-cache': z.boolean().default(false),
  'no-persistent-cache': z.boolean().default(false),
  diff: z.boolean().default(false),
  'diff-limit': z.coerce.number().int({ message: '--diff-limit must be a positive integer' }).positive({ message: '--diff-limit must be a positive integer' }).default(2000),
}).strict().superRefine((val, ctx) => {
  // Count mutually exclusive action flags
  const actions = [
    val.tick !== undefined,
    val.latest,
    val.save !== undefined,
    val.load !== undefined,
    val.list,
    val.drop !== undefined,
    val['clear-cache'],
  ].filter(Boolean);

  if (actions.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one seek action flag allowed at a time (--tick, --latest, --save, --load, --list, --drop, --clear-cache)',
    });
  }

  // --diff only with tick/latest/load
  const DIFF_ACTIONS = val.tick !== undefined || val.latest || val.load !== undefined;
  if (val.diff && !DIFF_ACTIONS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--diff cannot be used without --tick, --latest, or --load',
    });
  }

  // --diff-limit requires --diff
  if (val['diff-limit'] !== 2000 && !val.diff) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--diff-limit requires --diff',
    });
  }
}).transform((val) => {
  /** @type {string} */
  let action = 'status';
  /** @type {string|null} */
  let tickValue = null;
  /** @type {string|null} */
  let name = null;

  if (val.tick !== undefined) {
    action = 'tick';
    tickValue = val.tick;
  } else if (val.latest) {
    action = 'latest';
  } else if (val.save !== undefined) {
    action = 'save';
    name = val.save;
  } else if (val.load !== undefined) {
    action = 'load';
    name = val.load;
  } else if (val.list) {
    action = 'list';
  } else if (val.drop !== undefined) {
    action = 'drop';
    name = val.drop;
  } else if (val['clear-cache']) {
    action = 'clear-cache';
  }

  return {
    action,
    tickValue,
    name,
    noPersistentCache: val['no-persistent-cache'],
    diff: val.diff,
    diffLimit: val['diff-limit'],
  };
});
