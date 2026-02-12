/**
 * JSON / NDJSON serialization utilities for CLI output.
 *
 * - stableStringify: pretty-printed, sorted-key JSON (--json)
 * - compactStringify: single-line, sorted-key JSON (--ndjson)
 * - sanitizePayload: strips internal _-prefixed keys before serialization
 */

/**
 * Recursively sorts object keys for deterministic JSON output.
 * @param {*} input
 * @returns {*}
 */
function normalize(input) {
  if (Array.isArray(input)) {
    return input.map(normalize);
  }
  if (input && typeof input === 'object') {
    /** @type {Record<string, *>} */
    const sorted = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = normalize(input[key]);
    }
    return sorted;
  }
  return input;
}

/**
 * Pretty-printed JSON with sorted keys (2-space indent).
 * @param {*} value
 * @returns {string}
 */
export function stableStringify(value) {
  return JSON.stringify(normalize(value), null, 2);
}

/**
 * Single-line JSON with sorted keys (no indent).
 * @param {*} value
 * @returns {string}
 */
export function compactStringify(value) {
  return JSON.stringify(normalize(value));
}

/**
 * Shallow-clones a payload, removing all top-level underscore-prefixed keys.
 * These are internal rendering artifacts (e.g. _renderedSvg, _renderedAscii)
 * that should not leak into JSON/NDJSON output.
 * @param {*} payload
 * @returns {*}
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  /** @type {Record<string, *>} */
  const clean = {};
  for (const key of Object.keys(payload)) {
    if (!key.startsWith('_')) {
      clean[key] = payload[key];
    }
  }
  return clean;
}
