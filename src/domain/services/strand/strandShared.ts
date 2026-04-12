import StrandError from '../../errors/StrandError.ts';

export const STRAND_INTENT_ID_WIDTH = 4;
export const STRAND_TICK_ID_WIDTH = 4;
export const STRAND_COUNTERFACTUAL_REASON = 'footprint_overlap';

// Re-export constants consumed by StrandCoordinator
export const STRAND_SCHEMA_VERSION = 1;
export const STRAND_COORDINATE_VERSION = 'frontier-lamport/v1';
export const STRAND_OVERLAY_KIND = 'patch-log';

/**
 * Lexicographic comparator for deterministic sort ordering.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Zero-pad a numeric sequence to the specified width for lexicographic sorting.
 */
export function formatSequence(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Construct a deterministic intent identifier from strand and sequence number.
 */
export function buildIntentId(strandId: string, sequence: number): string {
  return `${strandId}.intent.${formatSequence(sequence, STRAND_INTENT_ID_WIDTH)}`;
}

/**
 * Construct a deterministic tick identifier from strand and sequence number.
 */
export function buildTickId(strandId: string, sequence: number): string {
  return `${strandId}.tick.${formatSequence(sequence, STRAND_TICK_ID_WIDTH)}`;
}

/**
 * Validate and trim an optional string field, returning null for absent values.
 */
export function normalizeOptionalString(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new StrandError(`${field} must be a string`, {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field, valueType: typeof value },
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new StrandError(`${field} must not be empty`, {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field },
    });
  }
  return trimmed;
}

/**
 * Coerce an unknown value into a deduplicated, sorted array of non-empty strings.
 */
export function normalizeStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: string[] = [];
  for (const entry of value) {
    const maybeString = normalizeOptionalString(
      entry as string | null | undefined,
      field,
    );
    if (maybeString !== null) {
      normalized.push(maybeString);
    }
  }
  return [...new Set(normalized)].sort(compareStrings);
}

/**
 * Find the highest Lamport timestamp across a collection of patches.
 */
export function maxPatchLamport(patches: Array<{ patch: { lamport?: number } }>): number {
  let max = 0;
  for (const { patch } of patches) {
    const lamport = patch.lamport ?? 0;
    if (lamport > max) {
      max = lamport;
    }
  }
  return max;
}

/**
 * Return true when a value is a non-empty string.
 */
export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
