import StrandError from '../../errors/StrandError.js';

export const STRAND_INTENT_ID_WIDTH = 4;
export const STRAND_TICK_ID_WIDTH = 4;
export const STRAND_COUNTERFACTUAL_REASON = 'footprint_overlap';

/**
 * Lexicographic comparator for deterministic sort ordering.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Zero-pad a numeric sequence to the specified width for lexicographic sorting.
 *
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
export function formatSequence(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * Construct a deterministic intent identifier from strand and sequence number.
 *
 * @param {string} strandId
 * @param {number} sequence
 * @returns {string}
 */
export function buildIntentId(strandId, sequence) {
  return `${strandId}.intent.${formatSequence(sequence, STRAND_INTENT_ID_WIDTH)}`;
}

/**
 * Construct a deterministic tick identifier from strand and sequence number.
 *
 * @param {string} strandId
 * @param {number} sequence
 * @returns {string}
 */
export function buildTickId(strandId, sequence) {
  return `${strandId}.tick.${formatSequence(sequence, STRAND_TICK_ID_WIDTH)}`;
}

/**
 * Validate and trim an optional string field, returning null for absent values.
 *
 * @param {string|null|undefined} value
 * @param {string} field
 * @returns {string|null}
 */
export function normalizeOptionalString(value, field) {
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
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
export function normalizeStringArray(value, field) {
  if (!Array.isArray(value)) {
    return [];
  }
  /** @type {string[]} */
  const normalized = [];
  for (const entry of value) {
    const maybeString = normalizeOptionalString(
      /** @type {string|null|undefined} */ (entry),
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
 *
 * @param {Array<{ patch: { lamport?: number } }>} patches
 * @returns {number}
 */
export function maxPatchLamport(patches) {
  let max = 0;
  for (const { patch } of patches) {
    const lamport = patch.lamport ?? 0;
    if (lamport > max) {
      max = lamport;
    }
  }
  return max;
}
