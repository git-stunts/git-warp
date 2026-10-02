import WarpError from '../errors/WarpError.ts';
import type { PropValue } from '../types/PropValue.ts';
import type { IntentDescriptor } from './Intent.ts';
import StagedContent from './StagedContent.ts';

export const MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES = 16 * 1024 * 1024;

// The empty canonical envelope is charged once; members and commas follow.
const EMPTY_SEQUENCE_BYTES = '{"intents":[],"kind":"intent.sequence"}'.length;
const JSON_DELIMITERS_BYTES = 2;
const JSON_NULL_BYTES = 4;
const HIGH_SURROGATE_START = 0xd800;
const LOW_SURROGATE_START = 0xdc00;
const SURROGATE_END = 0xe000;
const ASCII_END = 0x80;
const TWO_BYTE_UTF8_END = 0x800;
const SHORT_ESCAPE_CODES = new Set([8, 9, 10, 12, 13, 34, 92]);

// Transport values only: no raw input is trusted or hydrated here.
type DescriptorValue =
  | PropValue
  | undefined
  | StagedContent
  | readonly DescriptorValue[]
  | { readonly [key: string]: DescriptorValue };

/** Size-only canonical boundary reader; never creates an encoded string or buffer. */
export default class AtomicDescriptorByteBudgetReader {
  #remaining = MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - EMPTY_SEQUENCE_BYTES;
  #members = 0;

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

  #readValue(value: DescriptorValue): void {
    if (typeof value === 'string') { this.#readString(value); return; }
    if (value === null || value === undefined) { this.#charge(JSON_NULL_BYTES); return; }
    if (typeof value !== 'object') { this.#readScalar(value); return; }
    this.#readComposite(value);
  }

  #readScalar(value: number | boolean): void {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      this.#charge(JSON_NULL_BYTES);
      return;
    }
    this.#charge(String(value).length);
  }

  #readComposite(value: Exclude<DescriptorValue, string | number | boolean | null | undefined>): void {
    if (value instanceof StagedContent) {
      this.#readRecord({ id: value.id, mime: value.mime, size: value.size });
      return;
    }
    if (value instanceof Uint8Array) { this.#readBinary(value); return; }
    if (isDescriptorArray(value)) { this.#readArray(value); return; }
    this.#readRecord(value);
  }

  #readArray(values: readonly DescriptorValue[]): void {
    this.#charge(JSON_DELIMITERS_BYTES);
    for (let index = 0; index < values.length; index += 1) {
      if (index > 0) { this.#charge(1); }
      this.#readValue(values[index]);
    }
  }

  #readRecord(value: { readonly [key: string]: DescriptorValue }): void {
    this.#charge(JSON_DELIMITERS_BYTES);
    let members = 0;
    // Ordering changes bytes, but never their length. No key array or sort is needed.
    for (const key in value) {
      if (Object.hasOwn(value, key) && value[key] !== undefined) {
        this.#readMember(key, value[key], members);
        members += 1;
      }
    }
  }

  #readMember(key: string, value: DescriptorValue, index: number): void {
    if (index > 0) { this.#charge(1); }
    this.#readString(key);
    this.#charge(1); // colon
    this.#readValue(value);
  }

  #readBinary(value: Uint8Array): void {
    // canonicalStringify treats Uint8Array as an object with decimal index keys.
    this.#charge(JSON_DELIMITERS_BYTES);
    for (let index = 0; index < value.length; index += 1) {
      this.#readMember(String(index), value[index], index);
    }
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

function isDescriptorArray(value: DescriptorValue): value is readonly DescriptorValue[] {
  return Array.isArray(value);
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
