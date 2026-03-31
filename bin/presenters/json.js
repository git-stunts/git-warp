/**
 * JSON / NDJSON serialization utilities for CLI output.
 *
 * - stableStringify: pretty-printed, sorted-key JSON (--json)
 * - compactStringify: single-line, sorted-key JSON (--ndjson)
 * - sanitizePayload: strips internal _-prefixed keys before serialization
 */

/**
 * Sorts the keys of a plain object for deterministic output.
 * @param {Record<string, unknown>} rec - The object whose keys to sort
 * @returns {Record<string, unknown>} A new object with sorted keys
 */
function sortObjectKeys(rec) {
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const key of Object.keys(rec).sort()) {
    sorted[key] = normalize(rec[key]);
  }
  return sorted;
}

/**
 * Recursively sorts object keys for deterministic JSON output.
 * @param {unknown} input - The value to normalize
 * @returns {unknown} The normalized value with sorted keys
 */
function normalize(input) {
  if (Array.isArray(input)) {
    return input.map(normalize);
  }
  if (input !== null && input !== undefined && typeof input === 'object') {
    return sortObjectKeys(/** @type {Record<string, unknown>} */ (input));
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
 * Checks if a value is a non-null, non-array object suitable for key filtering.
 * @param {unknown} value - The value to check
 * @returns {value is Record<string, unknown>} True if value is a filterable object
 */
function isFilterableObject(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Removes all underscore-prefixed keys from an object.
 * @param {Record<string, unknown>} rec - The object to filter
 * @returns {Record<string, unknown>} A new object without underscore-prefixed keys
 */
function stripInternalKeys(rec) {
  /** @type {Record<string, unknown>} */
  const clean = {};
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
 * @param {Record<string, unknown> | unknown} payload - The payload to sanitize
 * @returns {Record<string, unknown> | unknown} The sanitized payload
 */
export function sanitizePayload(payload) {
  if (!isFilterableObject(payload)) {
    return payload;
  }
  return stripInternalKeys(payload);
}
