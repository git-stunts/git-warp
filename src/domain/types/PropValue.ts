import type CodecValue from './codec/CodecValue.ts';

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

function isScalarPropValue(value: CodecValue): value is string | number | boolean | null | Uint8Array {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value instanceof Uint8Array
  );
}

function isPropValueArray(value: CodecValue): value is PropValue[] {
  return Array.isArray(value) && value.every((entry) => isPropValue(entry));
}

function isPropValueObjectCandidate(value: CodecValue): value is { readonly [key: string]: CodecValue } {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return isNonArrayPlainObject(value);
}

function isPropValueObject(value: CodecValue): value is { [key: string]: PropValue } {
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

export function isPropValue(value: CodecValue): value is PropValue {
  return isScalarPropValue(value)
    || isPropValueArray(value)
    || isPropValueObject(value);
}
