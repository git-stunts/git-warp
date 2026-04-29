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

function isScalarPropValue(value: unknown): value is string | number | boolean | null | Uint8Array {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value instanceof Uint8Array
  );
}

function isPropValueArray(value: unknown): value is PropValue[] {
  return Array.isArray(value) && value.every((entry) => isPropValue(entry));
}

function isPropValueObject(value: unknown): value is { [key: string]: PropValue } {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Uint8Array)
    && Object.values(value).every((entry) => isPropValue(entry));
}

export function isPropValue(value: unknown): value is PropValue {
  return isScalarPropValue(value)
    || isPropValueArray(value)
    || isPropValueObject(value);
}
