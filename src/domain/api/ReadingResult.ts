import WarpError from '../errors/WarpError.ts';
import ImmutableBytes from '../services/snapshot/ImmutableBytes.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';
import ReadReceipt from './ReadReceipt.ts';

export type ReadingValue = SnapshotPropValue;

const FORBIDDEN_READING_VALUE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type ReadingResultOptions<TValue extends ReadingValue = ReadingValue> = {
  readonly value: TValue;
  readonly receipt: ReadReceipt;
};

export default class ReadingResult<TValue extends ReadingValue = ReadingValue> {
  readonly receipt: ReadReceipt;
  readonly value: TValue;

  constructor(options: ReadingResultOptions<TValue> | null | undefined) {
    const fields = requireReadingResultOptions(options);
    if (!isReadingValue(fields.value)) {
      throw new WarpError('ReadingResult value must be snapshot-compatible data', 'E_READING_RESULT_VALUE');
    }
    if (!(fields.receipt instanceof ReadReceipt)) {
      throw new WarpError('ReadingResult requires a ReadReceipt', 'E_READING_RESULT_RECEIPT');
    }

    this.value = fields.value;
    this.receipt = fields.receipt;
    Object.freeze(this);
  }
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
  if (!Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  try {
    return value.every((entry) => isReadingValueWithSeen(entry, seen));
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

function isForbiddenReadingValueKey(key: string): boolean {
  return FORBIDDEN_READING_VALUE_KEYS.has(key);
}

function canTraverseReadingValueObject<T>(value: T, seen: WeakSet<object>): value is T & object {
  return isReadingValueObjectCandidate(value) && !seen.has(value);
}

function isReadingValueObject<T>(
  value: T,
  seen: WeakSet<object>,
): value is T & { readonly [key: string]: ReadingValue } {
  if (!canTraverseReadingValueObject(value, seen)) {
    return false;
  }
  seen.add(value);
  try {
    return readingValueObjectEntriesAreValid(value, seen);
  } finally {
    seen.delete(value);
  }
}

function readingValueObjectEntriesAreValid(value: object, seen: WeakSet<object>): boolean {
  for (const [key, entry] of Object.entries(value)) {
    if (isForbiddenReadingValueKey(key) || !isReadingValueWithSeen(entry, seen)) {
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

function isReadingValue<T>(value: T): value is T & ReadingValue {
  return isReadingValueWithSeen(value, new WeakSet<object>());
}

function isReadingValueWithSeen<T>(value: T, seen: WeakSet<object>): value is T & ReadingValue {
  return isScalarReadingValue(value)
    || isReadingValueArray(value, seen)
    || isReadingValueObject(value, seen);
}

function requireReadingResultOptions<TValue extends ReadingValue>(
  options: ReadingResultOptions<TValue> | null | undefined,
): ReadingResultOptions<TValue> {
  if (options === null || options === undefined) {
    throw new WarpError('ReadingResult options are required', 'E_READING_RESULT_OPTIONS');
  }
  return options;
}
