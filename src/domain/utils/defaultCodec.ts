/**
 * Default codec implementation for domain services.
 *
 * Provides canonical CBOR encoding/decoding using cbor-x directly,
 * avoiding concrete adapter imports from the infrastructure layer.
 * This follows the same pattern as defaultClock.ts.
 *
 * Keys are recursively sorted before encoding for deterministic output,
 * which is critical for content-addressed storage (Git SHA matching).
 *
 * @module domain/utils/defaultCodec
 */

import { Encoder, decode as cborDecode } from 'cbor-x';
import type CodecPort from '../../ports/CodecPort.ts';

const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

/**
 * Recursively sorts object keys for deterministic CBOR encoding.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  return sortContainer(value);
}

/**
 * Sorts keys in an Array, Map, or plain object container.
 */
function sortContainer(value: object): unknown {
  if (Array.isArray(value)) { return value.map(sortKeys); }
  if (value instanceof Map) { return sortMapKeys(value); }
  return sortObjectKeys(value as Record<string, unknown>);
}

/**
 * Sorts keys of a Map and recursively sorts nested values.
 */
function sortMapKeys(map: Map<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Array.from(map.keys()).sort()) {
    sorted[String(key)] = sortKeys(map.get(key));
  }
  return sorted;
}

const CBOR_NATIVE: ReadonlyArray<Function> = [Uint8Array, Date, RegExp, Set];

/**
 * Returns true if the value is a built-in type with its own CBOR encoding.
 */
function isCborNative(value: object): boolean {
  return CBOR_NATIVE.some((T) => value instanceof T);
}

/**
 * Sorts keys of any object and recursively sorts nested values.
 * Skips built-in types that have their own CBOR representation.
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (isCborNative(obj)) { return obj; }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

const defaultCodec: CodecPort = {
  encode(data: unknown): Uint8Array {
    return encoder.encode(sortKeys(data));
  },
  decode(buffer: Uint8Array): unknown {
    return cborDecode(buffer) as unknown;
  },
};

export default defaultCodec;
