const TO_PUBLIC_KEY = new Map([
  ['strand', 'strand'],
  ['strandId', 'strandId'],
  ['braidedStrandIds', 'braidedStrandIds'],
]);

const TO_INTERNAL_KEY = new Map([
  ['strand', 'strand'],
  ['strandId', 'strandId'],
  ['braidedStrandIds', 'braidedStrandIds'],
]);

const TO_PUBLIC_KIND = new Map([
  ['strand', 'strand'],
  ['strand_base', 'strand_base'],
]);

const TO_INTERNAL_KIND = new Map([
  ['strand', 'strand'],
  ['strand_base', 'strand_base'],
]);

/**
 * Returns true if a value is a primitive, null, or a non-plain-object type that
 * should not be recursively transformed.
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonTransformable(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return true;
  }
  return isKnownNonPlainObject(value);
}

/**
 * Returns true if an object is a known non-plain-object type.
 * @param {object} value
 * @returns {boolean}
 */
function isKnownNonPlainObject(value) {
  return (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Uint8Array ||
    value instanceof Date ||
    value instanceof RegExp
  );
}

/**
 * Replaces a kind/coordinateKind string value using the provided mapping.
 * @param {string} key
 * @param {unknown} entry
 * @param {Map<string, string>} kindMap
 * @returns {unknown}
 */
function maybeTransformKindEntry(key, entry, kindMap) {
  if ((key === 'kind' || key === 'coordinateKind') && typeof entry === 'string') {
    return kindMap.get(entry) ?? entry;
  }
  return entry;
}

/**
 * Recursively transforms object keys and kind values using the provided mappings.
 * @param {unknown} value
 * @param {Map<string, string>} keyMap
 * @param {Map<string, string>} kindMap
 * @returns {unknown}
 */
function transform(value, keyMap, kindMap) {
  if (Array.isArray(value)) {
    return value.map((entry) => transform(entry, keyMap, kindMap));
  }

  if (isNonTransformable(value)) {
    return value;
  }

  /** @type {Record<string, unknown>} */
  const output = {};

  for (const [rawKey, rawEntry] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
    const key = keyMap.get(rawKey) ?? rawKey;
    const entry = maybeTransformKindEntry(key, transform(rawEntry, keyMap, kindMap), kindMap);
    output[key] = entry;
  }

  return output;
}

/**
 * Converts a public strand-shaped object into the internal strand-shaped
 * equivalent. Intended for API inputs only.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function toInternalStrandShape(value) {
  return /** @type {T} */ (transform(value, TO_INTERNAL_KEY, TO_INTERNAL_KIND));
}

/**
 * Converts an internal strand-shaped object into the public strand-shaped
 * equivalent. Intended for API outputs only.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function toPublicStrandShape(value) {
  return /** @type {T} */ (transform(value, TO_PUBLIC_KEY, TO_PUBLIC_KIND));
}
