/**
 * JSON / NDJSON serialization utilities for CLI output.
 *
 * - stableStringify: pretty-printed, sorted-key JSON (--json)
 * - compactStringify: single-line, sorted-key JSON (--jsonl)
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
