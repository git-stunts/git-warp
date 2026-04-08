/**
 * Shared validation utilities for conflict domain types.
 *
 * @module domain/types/conflict/validation
 */

/**
 * Validates that a value is a non-empty string.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @param {string} context - Class name for error messages.
 * @returns {string} The validated string.
 */
export function requireNonEmptyString(value, name, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context}: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Validates that a value is a non-negative integer.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @param {string} context - Class name for error messages.
 * @returns {number} The validated integer.
 */
export function requireNonNegativeInt(value, name, context) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${context}: ${name} must be a non-negative integer`);
  }
  return value;
}

/**
 * Validates that a value is a boolean.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @param {string} context - Class name for error messages.
 * @returns {boolean} The validated boolean.
 */
export function requireBoolean(value, name, context) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${context}: ${name} must be a boolean`);
  }
  return value;
}

/**
 * Validates that a value belongs to a fixed set of allowed strings.
 *
 * @param {unknown} value - The value to check.
 * @param {Set<string>} allowed - The set of valid values.
 * @param {{ name: string, context: string }} label - Field and class names for error messages.
 * @returns {string} The validated enum value.
 */
export function requireEnum(value, allowed, { name, context }) {
  if (!allowed.has(value)) {
    throw new TypeError(`${context}: ${name} must be one of ${[...allowed].join(', ')}`);
  }
  return value;
}

/**
 * Validates an optional string — must be non-empty when present.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @param {string} context - Class name for error messages.
 * @returns {string|undefined} The validated string or undefined.
 */
export function optionalString(value, name, context) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireNonEmptyString(value, name, context);
}

/**
 * Validates an optional enum — must be in the allowed set when present.
 *
 * @param {unknown} value - The value to check.
 * @param {Set<string>} allowed - The set of valid values.
 * @param {{ name: string, context: string }} label - Field and class names for error messages.
 * @returns {string|undefined} The validated enum value or undefined.
 */
export function optionalEnum(value, allowed, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireEnum(value, allowed, label);
}

/**
 * Deep-freezes an optional plain object. Returns undefined when absent.
 *
 * @param {unknown} value - The value to freeze.
 * @returns {Record<string, unknown>|undefined} The frozen object or undefined.
 */
export function freezeOptionalObject(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Object.freeze({ ...value });
}

/**
 * Freezes an array of strings, returning an empty frozen array when absent.
 *
 * @param {unknown} value - The value to freeze.
 * @returns {ReadonlyArray<string>} The frozen array.
 */
export function freezeStringArray(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  return Object.freeze(value.slice());
}

/**
 * Lexicographic string comparison for sorting.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Negative, zero, or positive.
 */
export function compareStrings(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
