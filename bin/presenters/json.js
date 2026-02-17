/**
 * JSON / NDJSON serialization utilities for CLI output.
 *
 * - stableStringify: pretty-printed, sorted-key JSON (--json)
 * - compactStringify: single-line, sorted-key JSON (--ndjson)
 * - sanitizePayload: strips internal _-prefixed keys before serialization
 */

/**
 * Recursively sorts object keys for deterministic JSON output.
 * @param {unknown} input
 * @returns {unknown}
 */
function normalize(input) {
  if (Array.isArray(input)) {
    return input.map(normalize);
  }
  if (input && typeof input === 'object') {
    const rec = /** @type {Record<string, unknown>} */ (input);
    /** @type {Record<string, unknown>} */
    const sorted = {};
    for (const key of Object.keys(rec).sort()) {
      sorted[key] = normalize(rec[key]);
    }
    return sorted;
  }
  return input;
}

/**
 * Pretty-printed JSON with sorted keys (2-space indent).
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  return JSON.stringify(normalize(value), null, 2);
}

/**
 * Single-line JSON with sorted keys (no indent).
 * @param {unknown} value
 * @returns {string}
 */
export function compactStringify(value) {
  return JSON.stringify(normalize(value));
}

/**
 * Shallow-clones a payload, removing all top-level underscore-prefixed keys.
 * These are internal rendering artifacts (e.g. _renderedSvg, _renderedAscii)
 * that should not leak into JSON/NDJSON output.
 * @param {Record<string, unknown> | unknown} payload
 * @returns {Record<string, unknown> | unknown}
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const rec = /** @type {Record<string, unknown>} */ (payload);
  /** @type {Record<string, unknown>} */
  const clean = {};
  for (const key of Object.keys(rec)) {
    if (!key.startsWith('_')) {
      clean[key] = rec[key];
    }
  }
  return clean;
}
