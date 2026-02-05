/**
 * Recursively stringifies a value with sorted object keys for deterministic output.
 * Used for computing checksums that must match across builders and readers.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {string} Canonical JSON string with sorted keys
 */
export function canonicalStringify(value) {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}
