/**
 * Shared validation helpers for Op constructors.
 *
 * Mirrors PatchBuilderV2._assertNoReservedBytes for consistency —
 * ops constructed outside PatchBuilderV2 (CBOR decode, tests, direct
 * construction) get the same validation.
 *
 * @module domain/types/ops/validate
 */

/** @const {string} NUL byte — edge key field separator */
const FIELD_SEPARATOR = '\x00';

/** @const {string} Edge property prefix — reserved for wire encoding */
const EDGE_PROP_PREFIX = '\x01';

/**
 * Asserts that a value is a non-empty string.
 *
 * @param {unknown} value
 * @param {string} opName - For error messages
 * @param {string} field - For error messages
 */
export function assertNonEmptyString(value, opName, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${opName} requires '${field}' to be a non-empty string`);
  }
}

/**
 * Asserts that a string identifier contains no reserved bytes.
 *
 * Rejects:
 * - NUL (\x00) — edge key field separator
 * - \x01 prefix — reserved for edge property encoding on the wire
 *
 * Matches PatchBuilderV2._assertNoReservedBytes.
 *
 * @param {string} value
 * @param {string} opName
 * @param {string} field
 */
export function assertNoReservedBytes(value, opName, field) {
  if (value.includes(FIELD_SEPARATOR)) {
    throw new Error(`${opName} '${field}' must not contain NUL (\\x00) bytes`);
  }
  if (value.length > 0 && value[0] === EDGE_PROP_PREFIX) {
    throw new Error(`${opName} '${field}' must not start with reserved prefix \\x01`);
  }
}

/**
 * Asserts that a value is an Array.
 *
 * @param {unknown} value
 * @param {string} opName
 * @param {string} field
 */
export function assertArray(value, opName, field) {
  if (!Array.isArray(value)) {
    throw new Error(`${opName} requires '${field}' to be an array`);
  }
}
