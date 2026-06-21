import WarpError from '../errors/WarpError.ts';

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | undefined
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

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
 */
export function canonicalStringify(value: unknown): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return _canonicalStringify(value, new WeakSet());
}

export function sortedReplacer(_key: string, value: CanonicalJsonValue): CanonicalJsonValue {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => compareJsonKeys(left, right)),
    );
  }
  return value;
}

const NULL_LITERAL: string = 'null';

function compareJsonKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/**
 * Checks if a value should be serialized as null (undefined, function, or symbol).
 */
function _isNullish(val: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return val === undefined || typeof val === 'function' || typeof val === 'symbol';
}

/**
 * Asserts that a reference object has not been visited (cycle detection).
 *
 * @throws {TypeError} If a circular reference is detected
 */
function _assertNoCycle(ref: object, seen: WeakSet<object>): void {
  if (seen.has(ref)) {
    throw new WarpError('Circular reference detected in canonicalStringify', 'E_CIRCULAR_REFERENCE');
  }
}

/**
 * Stringifies an array value with cycle detection.
 */
function _stringifyArray(arr: unknown[], seen: WeakSet<object>): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
 */
function _stringifyObject(ref: object, seen: WeakSet<object>): string {
  _assertNoCycle(ref, seen);
  seen.add(ref);
  try {
    const obj = ref as Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    const keys = Object.keys(obj).filter((k) => !_isNullish(obj[k])).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${_canonicalStringify(obj[k], seen)}`); // nosemgrep: ts-no-json-stringify-in-core -- 0025B
    return `{${pairs.join(',')}}`;
  } finally {
    seen.delete(ref);
  }
}

/**
 * Internal recursive helper with cycle detection.
 */
function _canonicalStringify(value: unknown, seen: WeakSet<object>): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (value === undefined || value === null) {
    return NULL_LITERAL;
  }
  if (Array.isArray(value)) {
    return _stringifyArray(value, seen);
  }
  if (typeof value === 'object') {
    return _stringifyObject(value, seen);
  }
  return JSON.stringify(value); // nosemgrep: ts-no-json-stringify-in-core -- 0025B
}
