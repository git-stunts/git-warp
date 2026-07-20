import ImmutableBytes from '../services/snapshot/ImmutableBytes.ts';
import type { ReadingValue } from './ReadingValue.ts';

const FORBIDDEN_READING_VALUE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isReadingValue<T>(value: T): value is T & ReadingValue {
  return isReadingValueWithSeen(value, new WeakSet<object>());
}

function isReadingValueWithSeen<T>(value: T, seen: WeakSet<object>): value is T & ReadingValue {
  return isScalarReadingValue(value)
    || isReadingValueArray(value, seen)
    || isReadingValueObject(value, seen);
}

function isScalarReadingValue<T>(
  value: T,
): value is T & (string | number | boolean | null | Uint8Array | ImmutableBytes) {
  return value === null
    || isPrimitiveReadingValue(value)
    || value instanceof Uint8Array
    || value instanceof ImmutableBytes;
}

function isPrimitiveReadingValue<T>(value: T): value is T & (string | number | boolean) {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isReadingValueArray<T>(
  value: T,
  seen: WeakSet<object>,
): value is T & readonly ReadingValue[] {
  if (!Array.isArray(value) || seen.has(value)) {
    return false;
  }
  seen.add(value);
  try {
    return value.every((entry) => isReadingValueWithSeen(entry, seen));
  } finally {
    seen.delete(value);
  }
}

function isReadingValueObject<T>(
  value: T,
  seen: WeakSet<object>,
): value is T & { readonly [key: string]: ReadingValue } {
  if (!isReadingValueObjectCandidate(value) || seen.has(value)) {
    return false;
  }
  seen.add(value);
  try {
    return readingValueObjectEntriesAreValid(value, seen);
  } finally {
    seen.delete(value);
  }
}

function isReadingValueObjectCandidate<T>(value: T): value is T & object {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return isNonArrayPlainObject(value);
}

function readingValueObjectEntriesAreValid(value: object, seen: WeakSet<object>): boolean {
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_READING_VALUE_KEYS.has(key) || !isReadingValueWithSeen(entry, seen)) {
      return false;
    }
  }
  return true;
}

function isNonArrayPlainObject(value: object): boolean {
  if (
    Array.isArray(value)
    || value instanceof Uint8Array
    || value instanceof ImmutableBytes
  ) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null;
}
