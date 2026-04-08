const TO_PUBLIC_KEY: Map<string, string> = new Map([
  ['strand', 'strand'],
  ['strandId', 'strandId'],
  ['braidedStrandIds', 'braidedStrandIds'],
]);

const TO_INTERNAL_KEY: Map<string, string> = new Map([
  ['strand', 'strand'],
  ['strandId', 'strandId'],
  ['braidedStrandIds', 'braidedStrandIds'],
]);

const TO_PUBLIC_KIND: Map<string, string> = new Map([
  ['strand', 'strand'],
  ['strand_base', 'strand_base'],
]);

const TO_INTERNAL_KIND: Map<string, string> = new Map([
  ['strand', 'strand'],
  ['strand_base', 'strand_base'],
]);

/**
 * Returns true if a value is a primitive, null, or a non-plain-object type that
 * should not be recursively transformed.
 */
function isNonTransformable(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== 'object') {
    return true;
  }
  return isKnownNonPlainObject(value);
}

/**
 * Returns true if an object is a known non-plain-object type.
 */
function isKnownNonPlainObject(value: object): boolean {
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
 */
function maybeTransformKindEntry(key: string, entry: unknown, kindMap: Map<string, string>): unknown {
  if ((key === 'kind' || key === 'coordinateKind') && typeof entry === 'string') {
    return kindMap.get(entry) ?? entry;
  }
  return entry;
}

/**
 * Recursively transforms object keys and kind values using the provided mappings.
 */
function transform(value: unknown, keyMap: Map<string, string>, kindMap: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => transform(entry, keyMap, kindMap));
  }

  if (isNonTransformable(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [rawKey, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    const key = keyMap.get(rawKey) ?? rawKey;
    const entry = maybeTransformKindEntry(key, transform(rawEntry, keyMap, kindMap), kindMap);
    output[key] = entry;
  }

  return output;
}

/**
 * Converts a public strand-shaped object into the internal strand-shaped
 * equivalent. Intended for API inputs only.
 */
export function toInternalStrandShape<T>(value: T): T {
  return transform(value, TO_INTERNAL_KEY, TO_INTERNAL_KIND) as T;
}

/**
 * Converts an internal strand-shaped object into the public strand-shaped
 * equivalent. Intended for API outputs only.
 */
export function toPublicStrandShape<T>(value: T): T {
  return transform(value, TO_PUBLIC_KEY, TO_PUBLIC_KIND) as T;
}
