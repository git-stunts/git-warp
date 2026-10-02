import WarpError from '../errors/WarpError.ts';
import assetByteLength from '../storage/assetByteLength.ts';
import type { IntentDescriptor } from './Intent.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';

export const MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES = 16 * 1024 * 1024;

// The empty canonical envelope is charged once; members and commas follow.
const EMPTY_SEQUENCE_BYTES = '{"intents":[],"kind":"intent.sequence"}'.length;
const JSON_DELIMITERS_BYTES = 2;
const JSON_NULL_BYTES = 4;
const MINIMUM_BINARY_MEMBER_BYTES = 6;
const MINIMUM_RECORD_VALUE_BYTES = 1;
const HIGH_SURROGATE_START = 0xd800;
const LOW_SURROGATE_START = 0xdc00;
const SURROGATE_END = 0xe000;
const ASCII_END = 0x80;
const TWO_BYTE_UTF8_END = 0x800;
const SHORT_ESCAPE_CODES = new Set([8, 9, 10, 12, 13, 34, 92]);

/** Size-only canonical boundary reader; never creates an encoded string or buffer. */
export default class AtomicDescriptorByteBudgetReader {
  #remaining = MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - EMPTY_SEQUENCE_BYTES;
  #members = 0;
  readonly #activeReferences = new WeakSet<object>();

  constructor() { Object.freeze(this); }

  get remainingBytes(): number { return this.#remaining; }

  preview(descriptor: IntentDescriptor): void {
    const remaining = this.#remaining;
    const members = this.#members;
    try {
      this.include(descriptor);
    } finally {
      this.#remaining = remaining;
      this.#members = members;
    }
  }

  include(descriptor: IntentDescriptor): void {
    if (this.#members > 0) { this.#charge(1); }
    this.#readValue(descriptor);
    this.#members += 1;
  }

  #charge(bytes: number): void {
    if (bytes > this.#remaining) {
      throw new WarpError(
        `Atomic intent descriptor exceeds ${String(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES)} bytes`,
        'E_INTENT_SEQUENCE_SIZE',
      );
    }
    this.#remaining -= bytes;
  }

  #readValue<T>(value: T): void {
    if (typeof value === 'string') { this.#readString(value); return; }
    if (value === null || isOmittedValue(value)) { this.#charge(JSON_NULL_BYTES); return; }
    if (typeof value === 'object') { this.#readComposite(value); return; }
    this.#readScalar(value);
  }

  #readScalar<T>(value: T): void {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      this.#charge(JSON_NULL_BYTES);
      return;
    }
    // BigInt is not a PropValue. Preserve the encoder's existing failure if a
    // substituted descriptor nevertheless contains it, without inventing a restriction.
    if (typeof value === 'bigint') { canonicalStringify(value); return; }
    this.#charge(String(value).length);
  }

  #readComposite(value: object): void {
    this.#enterReference(value);
    try {
      if (Array.isArray(value)) { this.#readArray(value); return; }
      if (value instanceof Uint8Array) { this.#requireBinaryMinimum(value); }
      this.#readRecord(value);
    } finally {
      this.#activeReferences.delete(value);
    }
  }

  #enterReference(value: object): void {
    if (this.#activeReferences.has(value)) {
      throw new WarpError('Circular reference detected in canonicalStringify', 'E_CIRCULAR_REFERENCE');
    }
    this.#activeReferences.add(value);
  }

  #readArray<T>(values: readonly T[]): void {
    this.#charge(JSON_DELIMITERS_BYTES);
    for (let index = 0; index < values.length; index += 1) {
      if (index > 0) { this.#charge(1); }
      // canonicalStringify maps before joining: holes have no literal, while
      // inherited elements and explicit undefined values are visited by map.
      if (index in values) { this.#readValue(values[index]); }
    }
  }

  #readRecord(value: object): void {
    this.#charge(JSON_DELIMITERS_BYTES);
    const keys = this.#selectedRecordKeys(value);
    keys.sort();
    // Canonical encoding reads once to select keys, then again in sorted order.
    for (const key of keys) {
      this.#remaining += MINIMUM_RECORD_VALUE_BYTES;
      this.#readValue(Reflect.get(value, key));
    }
  }

  #selectedRecordKeys(value: object): string[] {
    const keys: string[] = [];
    for (const key in value) {
      if (!Object.hasOwn(value, key) || isOmittedValue(Reflect.get(value, key))) { continue; }
      // Bound selected-key storage before collection; never create Object.keys
      // for a binary input whose native length already proves it cannot fit.
      if (keys.length > 0) { this.#charge(1); }
      this.#readString(key);
      this.#charge(1 + MINIMUM_RECORD_VALUE_BYTES); // colon and minimum value
      keys.push(key);
    }
    return keys;
  }

  #requireBinaryMinimum(value: Uint8Array): void {
    // Every native byte has at least a one-digit quoted key, colon, value and
    // separator. Reject impossible inputs before enumerating numeric keys.
    const length = assetByteLength(value);
    const minimum = length === 0 ? JSON_DELIMITERS_BYTES : length * MINIMUM_BINARY_MEMBER_BYTES + 1;
    if (minimum > this.#remaining) { this.#charge(minimum); }
  }

  #readString(value: string): void {
    // This lower bound rejects huge ropes before charCodeAt can flatten them.
    this.#charge(value.length + JSON_DELIMITERS_BYTES);
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (isSurrogatePair(code, value.charCodeAt(index + 1))) {
        this.#charge(2); // Four UTF-8 bytes replace two charged UTF-16 code units.
        index += 1;
      } else {
        this.#charge(stringExpansionBytes(code));
      }
    }
  }
}

function isOmittedValue<T>(value: T): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

function isSurrogatePair(first: number, second: number): boolean {
  return first >= HIGH_SURROGATE_START && first < LOW_SURROGATE_START
    && second >= LOW_SURROGATE_START && second < SURROGATE_END;
}

function stringExpansionBytes(code: number): number {
  if (SHORT_ESCAPE_CODES.has(code)) { return 1; }
  if (requiresUnicodeEscape(code)) { return 5; }
  if (code < ASCII_END) { return 0; }
  return code < TWO_BYTE_UTF8_END ? 1 : 2;
}

function requiresUnicodeEscape(code: number): boolean {
  return code < 32 || (code >= HIGH_SURROGATE_START && code < SURROGATE_END);
}
