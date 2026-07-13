/**
 * PropValue — the set of values that can be stored in a CRDT property register.
 *
 * This is exactly what CBOR decode produces: JavaScript primitives,
 * binary data, and recursive compositions of the same. No domain
 * class instances live here — those are hydrated at decode boundaries.
 */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | PropValue[]
  | { [key: string]: PropValue };

const FORBIDDEN_PROPERTY_VALUE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isScalarPropValue<T>(
  value: T
): value is T & (string | number | boolean | null | Uint8Array) {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Uint8Array
  );
}

function isPropValueArray<T>(value: T, seen: WeakSet<object>): value is T & PropValue[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  try {
    return value.every((entry) => isPropValueWithSeen(entry, seen));
  } finally {
    seen.delete(value);
  }
}

function isPropValueObjectCandidate<T>(value: T): value is T & object {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return isNonArrayPlainObject(value);
}

function isForbiddenPropertyValueKey(key: string): boolean {
  return FORBIDDEN_PROPERTY_VALUE_KEYS.has(key);
}

function canTraversePropValueObject<T>(value: T, seen: WeakSet<object>): value is T & object {
  return isPropValueObjectCandidate(value) && !seen.has(value);
}

function isPropValueObject<T>(
  value: T,
  seen: WeakSet<object>
): value is T & { [key: string]: PropValue } {
  if (!canTraversePropValueObject(value, seen)) {
    return false;
  }
  seen.add(value);
  try {
    return propValueObjectEntriesAreValid(value, seen);
  } finally {
    seen.delete(value);
  }
}

function propValueObjectEntriesAreValid(value: object, seen: WeakSet<object>): boolean {
  for (const [key, entry] of Object.entries(value)) {
    if (isForbiddenPropertyValueKey(key) || !isPropValueWithSeen(entry, seen)) {
      return false;
    }
  }
  return true;
}

function isNonArrayPlainObject(value: object): boolean {
  if (Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}

export function isPropValue<T>(value: T): value is T & PropValue {
  return isPropValueWithSeen(value, new WeakSet<object>());
}

export function copyPropValue(value: PropValue): PropValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return copyCompositePropValue(value);
}

function copyCompositePropValue(
  value: Uint8Array | PropValue[] | { [key: string]: PropValue }
): PropValue {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return value.map(copyPropValue);
  }
  const copy: { [key: string]: PropValue } = {};
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: copyPropValue(entry),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function isPropValueWithSeen<T>(value: T, seen: WeakSet<object>): value is T & PropValue {
  return (
    isScalarPropValue(value) || isPropValueArray(value, seen) || isPropValueObject(value, seen)
  );
}
