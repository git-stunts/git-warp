/**
 * Default codec implementation for domain services.
 *
 * Provides canonical CBOR encoding/decoding using cbor-x directly,
 * avoiding concrete adapter imports from the infrastructure layer.
 *
 * Keys are recursively sorted before encoding for deterministic output,
 * which is critical for content-addressed storage (Git SHA matching).
 *
 * @module domain/utils/defaultCodec
 */

import { Encoder, decode as cborDecode } from 'cbor-x';
import CodecPort from '../../ports/CodecPort.ts';
import type CodecValue from '../types/codec/CodecValue.ts';

const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

/**
 * Encodable value — the superset of `CodecValue` plus `Map` and
 * plain records whose values are themselves encodable. The adapter
 * flattens Maps and record values to plain-object entry bags at the
 * sorting boundary; the sorted output still lives inside
 * `CodecValue`.
 */
type EncodableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Uint8Array
  | Date
  | ReadonlyArray<EncodableValue>
  | Map<string, EncodableValue>
  | { readonly [key: string]: EncodableValue };

const CBOR_NATIVE: ReadonlyArray<Function> = [Uint8Array, Date, RegExp, Set];

/**
 * Returns true if the value is a built-in type with its own CBOR encoding.
 */
function isCborNative(value: object): boolean {
  return CBOR_NATIVE.some((T) => value instanceof (T as new (...args: never[]) => object));
}

/**
 * Recursively sorts object keys for deterministic CBOR encoding.
 */
function sortKeys(value: EncodableValue): CodecValue {
  if (value === null || value === undefined) { return value; }
  if (typeof value !== 'object') { return value; }
  return sortObjectLike(value);
}

function sortObjectLike(value: object & EncodableValue): CodecValue {
  if (Array.isArray(value)) { return sortArray(value); }
  if (value instanceof Map) { return sortMapKeys(value); }
  if (isCborNative(value)) { return value as CodecValue; }
  return sortObjectKeys(value as { readonly [key: string]: EncodableValue });
}

function sortArray(value: ReadonlyArray<EncodableValue>): ReadonlyArray<CodecValue> {
  return value.map(sortKeys);
}

/**
 * Sorts keys of a Map and recursively sorts nested values. Maps
 * flatten to plain records so the sorted form is a CodecValue.
 */
function sortMapKeys(map: Map<string, EncodableValue>): { [key: string]: CodecValue } {
  const sorted: { [key: string]: CodecValue } = {};
  for (const key of Array.from(map.keys()).sort()) {
    const value = map.get(key);
    if (value !== undefined) {
      sorted[String(key)] = sortKeys(value);
    }
  }
  return sorted;
}

/**
 * Sorts keys of any object and recursively sorts nested values.
 * Skips built-in types that have their own CBOR representation.
 */
function sortObjectKeys(obj: { readonly [key: string]: EncodableValue }): CodecValue {
  if (isCborNative(obj)) { return obj as CodecValue; }
  const sorted: { [key: string]: CodecValue } = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (value !== undefined) {
      sorted[key] = sortKeys(value);
    }
  }
  return sorted;
}

/**
 * Default CBOR codec used by domain services that receive no codec
 * override. Delegates encoding to cbor-x with canonical key ordering.
 */
class DefaultCodec extends CodecPort {
  override encode<TEncoded = CodecValue>(data: TEncoded): Uint8Array {
    return encoder.encode(sortKeys(data as EncodableValue));
  }

  override decode<TDecoded = CodecValue>(buffer: Uint8Array): TDecoded {
    return cborDecode(buffer) as TDecoded;
  }
}

const defaultCodec = new DefaultCodec();
Object.freeze(defaultCodec);

export default defaultCodec;
