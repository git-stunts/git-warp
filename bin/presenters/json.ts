/**
 * JSON / NDJSON serialization utilities for CLI output.
 *
 * - stableStringify: pretty-printed, sorted-key JSON (--json)
 * - compactStringify: single-line, sorted-key JSON (--ndjson)
 * - sanitizePayload: strips internal _-prefixed keys before serialization
 */

/**
 * Sorts the keys of a plain object for deterministic output.
 */
function sortObjectKeys(rec: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    sorted[key] = normalize(rec[key]);
  }
  return sorted;
}

/**
 * Recursively sorts object keys for deterministic JSON output.
 */
function normalize(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(normalize);
  }
  if (input !== null && input !== undefined && typeof input === 'object') {
    return sortObjectKeys(input as Record<string, unknown>);
  }
  return input;
}

/**
 * Pretty-printed JSON with sorted keys (2-space indent).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2);
}

/**
 * Single-line JSON with sorted keys (no indent).
 */
export function compactStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/**
 * Checks if a value is a non-null, non-array object suitable for key filtering.
 */
function isFilterableObject(value: unknown): value is Record<string, unknown> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Removes all underscore-prefixed keys from an object.
 */
function stripInternalKeys(rec: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(rec)) {
    if (!key.startsWith('_')) {
      clean[key] = rec[key];
    }
  }
  return clean;
}

/**
 * Shallow-clones a payload, removing all top-level underscore-prefixed keys.
 * These are internal rendering artifacts (e.g. _renderedSvg, _renderedAscii)
 * that should not leak into JSON/NDJSON output.
 */
export function sanitizePayload(payload: unknown): unknown {
  if (!isFilterableObject(payload)) {
    return payload;
  }
  return stripInternalKeys(payload);
}
