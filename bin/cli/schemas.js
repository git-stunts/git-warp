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

/**
 * Coerce an optional label field (string | string[]) into a string array.
 * @param {{ label?: string | string[] }} val
 * @returns {string[]}
 */
function normalizeLabels(val) {
  if (Array.isArray(val.label)) {
    return val.label;
  }
  if (val.label !== undefined && val.label.length > 0) {
    return [val.label];
  }
  return [];
}

/**
 * @typedef {{
 *   from?: string,
 *   to?: string,
 *   dir?: 'out' | 'in' | 'both',
 *   label?: string | string[],
 *   'max-depth'?: number,
 * }} PathInput
 */

/**
 * Map raw pathSchema output to the canonical shape consumed by the path command.
 * @param {PathInput} val
 */
function transformPath(val) {
  return {
    from: val.from ?? null,
    to: val.to ?? null,
    dir: val.dir,
    labels: normalizeLabels(val),
    maxDepth: val['max-depth'],
  };
}

export const pathSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  dir: z.enum(['out', 'in', 'both']).optional(),
  label: z.union([z.string(), z.array(z.string())]).optional(),
  'max-depth': z.coerce.number().int().nonnegative().refine(n => Number.isFinite(n), { message: 'must be a finite number' }).optional(),
}).strict().transform(transformPath);

// ============================================================================
// Query
// ============================================================================

export const querySchema = z.object({
  match: z.string().optional(),
  'where-prop': z.union([z.string(), z.array(z.string())]).optional(),
  select: z.string().optional(),
}).strict().transform((val) => ({
  match: val.match ?? null,
  whereProp: Array.isArray(val['where-prop']) ? val['where-prop'] : (val['where-prop'] !== undefined && val['where-prop'].length > 0) ? [val['where-prop']] : [],
  select: val.select,
}));

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

/**
 * @typedef {{
 *   tick?: string,
 *   latest: boolean,
 *   save?: string,
 *   load?: string,
 *   list: boolean,
 *   drop?: string,
 *   'clear-cache': boolean,
 *   'no-persistent-cache': boolean,
 *   diff: boolean,
 *   'diff-limit': number,
 * }} SeekInput
 */

/**
 * Count how many mutually exclusive seek action flags are active.
 * @param {SeekInput} val
 * @returns {number}
 */
function countSeekActions(val) {
  return [
    val.tick !== undefined,
    val.latest,
    val.save !== undefined,
    val.load !== undefined,
    val.list,
    val.drop !== undefined,
    val['clear-cache'],
  ].filter(Boolean).length;
}

/**
 * Return true when at least one diff-compatible action is set.
 * @param {SeekInput} val
 * @returns {boolean}
 */
function hasDiffCompatibleAction(val) {
  return val.tick !== undefined || val.latest || val.load !== undefined;
}

/**
 * Emit a custom Zod issue if the predicate is true.
 * @param {z.RefinementCtx} ctx
 * @param {boolean} condition
 * @param {string} message
 */
function issueIf(ctx, condition, message) {
  if (condition) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
}

/**
 * Validate mutual-exclusion and diff-flag constraints on seek inputs.
 * @param {SeekInput} val
 * @param {z.RefinementCtx} ctx
 */
function refineSeekActions(val, ctx) {
  issueIf(ctx, countSeekActions(val) > 1,
    'Only one seek action flag allowed at a time (--tick, --latest, --save, --load, --list, --drop, --clear-cache)');
  issueIf(ctx, val.diff && !hasDiffCompatibleAction(val),
    '--diff cannot be used without --tick, --latest, or --load');
  issueIf(ctx, val['diff-limit'] !== 2000 && !val.diff,
    '--diff-limit requires --diff');
}

/**
 * Entries mapping seek flag keys to their action name.
 * Boolean-typed flags use `isBool: true`; string-typed flags carry a value.
 * Order matters: first active entry wins.
 * @type {Array<{ key: keyof SeekInput, action: string, isBool: boolean }>}
 */
const SEEK_ACTION_TABLE = [
  { key: 'tick', action: 'tick', isBool: false },
  { key: 'latest', action: 'latest', isBool: true },
  { key: 'save', action: 'save', isBool: false },
  { key: 'load', action: 'load', isBool: false },
  { key: 'list', action: 'list', isBool: true },
  { key: 'drop', action: 'drop', isBool: false },
  { key: 'clear-cache', action: 'clear-cache', isBool: true },
];

/**
 * Return true when the given table entry's flag is active in val.
 * @param {SeekInput} val
 * @param {{ key: keyof SeekInput, isBool: boolean }} entry
 * @returns {boolean}
 */
function isSeekActionActive(val, entry) {
  return entry.isBool ? Boolean(val[entry.key]) : val[entry.key] !== undefined;
}

/**
 * Find the first active seek action entry, or undefined for status (no action).
 * @param {SeekInput} val
 * @returns {{ key: keyof SeekInput, action: string, isBool: boolean } | undefined}
 */
function findActiveSeekEntry(val) {
  return SEEK_ACTION_TABLE.find((entry) => isSeekActionActive(val, entry));
}

/**
 * Determine which seek action is active and extract its tick/name values.
 * @param {SeekInput} val
 * @returns {{ action: string, tickValue: string | null, name: string | null }}
 */
function resolveSeekAction(val) {
  const entry = findActiveSeekEntry(val);
  if (entry === undefined) {
    return { action: 'status', tickValue: null, name: null };
  }
  const tickValue = entry.action === 'tick' ? /** @type {string} */ (val.tick) : null;
  const name = !entry.isBool && entry.action !== 'tick' ? /** @type {string} */ (val[entry.key]) : null;
  return { action: entry.action, tickValue, name };
}

/**
 * Transform validated seek input into the canonical shape consumed by the seek command.
 * @param {SeekInput} val
 */
function transformSeek(val) {
  const { action, tickValue, name } = resolveSeekAction(val);
  return {
    action,
    tickValue,
    name,
    noPersistentCache: val['no-persistent-cache'],
    diff: val.diff,
    diffLimit: val['diff-limit'],
  };
}

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
  'diff-limit': z.coerce.number().int({ message: '--diff-limit must be a positive integer' }).positive({ message: '--diff-limit must be a positive integer' }).refine(n => Number.isFinite(n), { message: '--diff-limit must be a finite number' }).default(2000),
}).strict().superRefine(refineSeekActions).transform(transformSeek);

// ============================================================================
// Bisect
// ============================================================================

export const bisectSchema = z.object({
  good: z.string().min(1, 'Missing value for --good').regex(/^[0-9a-f]{40}$/, 'Must be a full 40-character hex SHA'),
  bad: z.string().min(1, 'Missing value for --bad').regex(/^[0-9a-f]{40}$/, 'Must be a full 40-character hex SHA'),
  test: z.string().min(1, 'Missing value for --test'),
}).strict();

// ============================================================================
// Verify-index
// ============================================================================

export const verifyIndexSchema = z.object({
  seed: z.coerce.number().int().min(-2147483648).max(2147483647).refine(n => Number.isFinite(n), { message: 'must be a finite number' }).optional(),
  'sample-rate': z.coerce.number().gt(0, '--sample-rate must be greater than 0').max(1).refine(n => Number.isFinite(n), { message: 'must be a finite number' }).optional().default(0.1),
}).strict().transform((val) => ({
  seed: val.seed,
  sampleRate: val['sample-rate'],
}));

// ============================================================================
// Reindex
// ============================================================================

// No command-level options; schema exists for forward compatibility
export const reindexSchema = z.object({}).strict();
