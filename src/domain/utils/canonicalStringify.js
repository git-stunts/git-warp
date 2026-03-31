/**
 * Recursively stringifies a value with sorted object keys for deterministic output.
 * Used for computing checksums that must match across builders and readers.
 *
 * Matches JSON.stringify semantics:
 * - Top-level undefined returns "null"
 * - Array elements that are undefined/function/symbol become "null"
 * - Object properties with undefined/function/symbol values are omitted
 *
 * Throws TypeError on circular references rather than stack-overflowing.
 *
 * @param {unknown} value - Any JSON-serializable value
 * @returns {string} Canonical JSON string with sorted keys
 */
export function canonicalStringify(value) {
  return _canonicalStringify(value, new WeakSet());
}

/** @type {string} */
const NULL_LITERAL = 'null';

/**
 * Checks if a value should be serialized as null (undefined, function, or symbol).
 *
 * @param {unknown} val - The value to check
 * @returns {boolean} True if the value should be represented as null
 * @private
 */
function _isNullish(val) {
  return val === undefined || typeof val === 'function' || typeof val === 'symbol';
}

/**
 * Asserts that a reference object has not been visited (cycle detection).
 *
 * @param {object} ref - The reference object to check
 * @param {WeakSet<object>} seen - Set of already-visited objects
 * @throws {TypeError} If a circular reference is detected
 * @private
 */
function _assertNoCycle(ref, seen) {
  if (seen.has(ref)) {
    throw new TypeError('Circular reference detected in canonicalStringify');
  }
}

/**
 * Stringifies an array value with cycle detection.
 *
 * @param {unknown[]} arr - The array to stringify
 * @param {WeakSet<object>} seen - Cycle-detection set
 * @returns {string} JSON array string
 * @private
 */
function _stringifyArray(arr, seen) {
  _assertNoCycle(arr, seen);
  seen.add(arr);
  try {
    const elements = arr.map((el) => (_isNullish(el) ? NULL_LITERAL : _canonicalStringify(el, seen)));
    return `[${elements.join(',')}]`;
  } finally {
    seen.delete(arr);
  }
}

/**
 * Stringifies a plain object value with sorted keys and cycle detection.
 *
 * @param {object} ref - The object to stringify
 * @param {WeakSet<object>} seen - Cycle-detection set
 * @returns {string} JSON object string with sorted keys
 * @private
 */
function _stringifyObject(ref, seen) {
  _assertNoCycle(ref, seen);
  seen.add(ref);
  try {
    const obj = /** @type {Record<string, unknown>} */ (ref);
    const keys = Object.keys(obj).filter((k) => !_isNullish(obj[k])).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${_canonicalStringify(obj[k], seen)}`);
    return `{${pairs.join(',')}}`;
  } finally {
    seen.delete(ref);
  }
}

/**
 * Internal recursive helper with cycle detection.
 *
 * @param {unknown} value - Any JSON-serializable value
 * @param {WeakSet<object>} seen - Set of already-visited objects for cycle detection
 * @returns {string} Canonical JSON string with sorted keys
 * @private
 */
function _canonicalStringify(value, seen) {
  if (value === undefined || value === null) {
    return NULL_LITERAL;
  }
  if (Array.isArray(value)) {
    return _stringifyArray(value, seen);
  }
  if (typeof value === 'object') {
    return _stringifyObject(value, seen);
  }
  return JSON.stringify(value);
}
