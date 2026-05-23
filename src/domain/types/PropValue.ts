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

function isScalarPropValue<T>(
  value: T,
): value is T & (string | number | boolean | null | Uint8Array) {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value instanceof Uint8Array
  );
}

function isPropValueArray<T>(value: T): value is T & PropValue[] {
  return Array.isArray(value) && value.every((entry) => isPropValue(entry));
}

function isPropValueObjectCandidate<T>(value: T): value is T & object {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return isNonArrayPlainObject(value);
}

function isPropValueObject<T>(value: T): value is T & { [key: string]: PropValue } {
  return isPropValueObjectCandidate(value)
    && Object.values(value).every((entry) => isPropValue(entry));
}

function isNonArrayPlainObject(value: object): boolean {
  if (Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null;
}

export function isPropValue<T>(value: T): value is T & PropValue {
  return isScalarPropValue(value)
    || isPropValueArray(value)
    || isPropValueObject(value);
}
