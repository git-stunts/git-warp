/**
 * Shared validation helpers for Op constructors.
 *
 * @module domain/types/ops/validate
 */

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
 * Asserts that a string contains no NUL (\x00) bytes.
 * NUL is the edge key separator — it cannot appear in identifiers.
 *
 * @param {string} value
 * @param {string} opName
 * @param {string} field
 */
export function assertNoBannedBytes(value, opName, field) {
  if (value.includes('\x00')) {
    throw new Error(`${opName} '${field}' must not contain NUL (\\x00) bytes`);
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
