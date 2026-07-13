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
 */
function normalizeLabels(val: { label?: string | string[] | undefined }): string[] {
  if (Array.isArray(val.label)) {
    return val.label;
  }
  if (val.label !== undefined && val.label.length > 0) {
    return [val.label];
  }
  return [];
}

type PathInput = {
  from?: string | undefined;
  to?: string | undefined;
  dir?: 'out' | 'in' | 'both' | undefined;
  label?: string | string[] | undefined;
  'max-depth'?: number | undefined;
};

/**
 * Map raw pathSchema output to the canonical shape consumed by the path command.
 */
function transformPath(val: PathInput) {
  return {
    from: val.from ?? null,
    to: val.to ?? null,
    ...(val.dir !== undefined ? { dir: val.dir } : {}),
    labels: normalizeLabels(val),
    ...(val['max-depth'] !== undefined ? { maxDepth: val['max-depth'] } : {}),
  };
}

export const pathSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  dir: z.enum(['out', 'in', 'both']).optional(),
  label: z.union([z.string(), z.array(z.string())]).optional(),
  'max-depth': z.coerce.number().int().nonnegative().refine(n => Number.isFinite(n), { message: 'must be a finite number' }).optional(),
}).strict().transform((val) => transformPath(val));

// ============================================================================
// Query
// ============================================================================

function normalizeStringList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value !== undefined && value.length > 0 ? [value] : [];
}

export const querySchema = z.object({
  match: z.string().optional(),
  outgoing: z.union([z.string(), z.array(z.string())]).optional(),
  incoming: z.union([z.string(), z.array(z.string())]).optional(),
  'where-prop': z.union([z.string(), z.array(z.string())]).optional(),
  select: z.string().optional(),
}).strict().transform((val) => ({
  match: val.match ?? null,
  outgoing: normalizeStringList(val.outgoing),
  incoming: normalizeStringList(val.incoming),
  whereProp: normalizeStringList(val['where-prop']),
  select: val.select,
}));

// ============================================================================
// Optic
// ============================================================================

export const opticWitnessSchema = z.object({
  property: z.string().min(1, 'Missing value for --property').optional(),
}).strict().transform((val) => ({
  propertyKey: val.property ?? null,
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
  'memory-budget': z.string().min(1).optional(),
  'large-graph': z.boolean().default(false),
  'repair-state-cache': z.boolean().default(false),
}).strict();

// ============================================================================
// Seek
// ============================================================================

type SeekInput = {
  tick?: string | undefined;
  latest: boolean;
  save?: string | undefined;
  load?: string | undefined;
  list: boolean;
  drop?: string | undefined;
  'clear-cache': boolean;
  'no-persistent-cache': boolean;
  diff: boolean;
  'diff-limit': number;
};

const SEEK_TICK_PATTERN = /^(?:[0-9]+|[+-][0-9]+)$/u;

/**
 * Count how many mutually exclusive seek action flags are active.
 */
function countSeekActions(val: SeekInput): number {
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
 */
function hasDiffCompatibleAction(val: SeekInput): boolean {
  return val.tick !== undefined || val.latest || val.load !== undefined;
}

/**
 * Emit a custom Zod issue if the predicate is true.
 */
function issueIf(ctx: z.RefinementCtx, condition: boolean, message: string): void {
  if (condition) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
}

/**
 * Validate mutual-exclusion and diff-flag constraints on seek inputs.
 */
function refineSeekActions(val: SeekInput, ctx: z.RefinementCtx): void {
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
 */
const SEEK_ACTION_TABLE: Array<{ key: keyof SeekInput; action: string; isBool: boolean }> = [
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
 */
function isSeekActionActive(val: SeekInput, entry: { key: keyof SeekInput; isBool: boolean }): boolean {
  return entry.isBool ? Boolean(val[entry.key]) : val[entry.key] !== undefined;
}

/**
 * Find the first active seek action entry, or undefined for status (no action).
 */
function findActiveSeekEntry(val: SeekInput): { key: keyof SeekInput; action: string; isBool: boolean } | undefined {
  return SEEK_ACTION_TABLE.find((entry) => isSeekActionActive(val, entry));
}

/**
 * Determine which seek action is active and extract its tick/name values.
 */
function resolveSeekAction(val: SeekInput): { action: string; tickValue: string | null; name: string | null } {
  const entry = findActiveSeekEntry(val);
  if (entry === undefined) {
    return { action: 'status', tickValue: null, name: null };
  }
  const tickValue = entry.action === 'tick' ? val.tick as string : null;
  const name = !entry.isBool && entry.action !== 'tick' ? val[entry.key] as string : null;
  return { action: entry.action, tickValue, name };
}

/**
 * Transform validated seek input into the canonical shape consumed by the seek command.
 */
function transformSeek(val: SeekInput) {
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
  tick: z.string()
    .regex(SEEK_TICK_PATTERN, 'Invalid --tick value. Use a non-negative integer, or +N/-N for relative.')
    .optional(),
  latest: z.boolean().default(false),
  save: z.string().min(1, 'Missing value for --save').optional(),
  load: z.string().min(1, 'Missing value for --load').optional(),
  list: z.boolean().default(false),
  drop: z.string().min(1, 'Missing value for --drop').optional(),
  'clear-cache': z.boolean().default(false),
  'no-persistent-cache': z.boolean().default(false),
  diff: z.boolean().default(false),
  'diff-limit': z.coerce.number().int({ message: '--diff-limit must be a positive integer' }).positive({ message: '--diff-limit must be a positive integer' }).refine(n => Number.isFinite(n), { message: '--diff-limit must be a finite number' }).default(2000),
}).strict().superRefine(refineSeekActions).transform((val) => transformSeek(val));

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
  ...(val.seed !== undefined ? { seed: val.seed } : {}),
  sampleRate: val['sample-rate'],
}));

// ============================================================================
// Reindex
// ============================================================================

// No command-level options; schema exists for forward compatibility
export const reindexSchema = z.object({}).strict();
