/**
 * Default codec implementation for domain services.
 *
 * Provides canonical CBOR encoding/decoding using cbor-x directly,
 * avoiding concrete adapter imports from the infrastructure layer.
 * This follows the same pattern as defaultClock.js.
 *
 * Keys are recursively sorted before encoding for deterministic output,
 * which is critical for content-addressed storage (Git SHA matching).
 *
 * @module domain/utils/defaultCodec
 */

import { Encoder, decode as cborDecode } from 'cbor-x';

const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

/**
 * Recursively sorts object keys for deterministic CBOR encoding.
 * @param {unknown} value - The value to sort keys of
 * @returns {unknown} The value with sorted keys
 */
function sortKeys(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  return sortContainer(value);
}

/**
 * Sorts keys in an Array, Map, or plain object container.
 * @param {object} value - A non-null object value
 * @returns {unknown} The value with sorted keys
 */
function sortContainer(value) {
  if (Array.isArray(value)) { return value.map(sortKeys); }
  if (value instanceof Map) { return sortMapKeys(value); }
  return sortObjectKeys(/** @type {Record<string, unknown>} */ (value));
}

/**
 * Sorts keys of a Map and recursively sorts nested values.
 * @param {Map<string, unknown>} map
 * @returns {Record<string, unknown>}
 */
function sortMapKeys(map) {
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const key of Array.from(map.keys()).sort()) {
    sorted[String(key)] = sortKeys(map.get(key));
  }
  return sorted;
}

/** @type {ReadonlyArray<Function>} */
const CBOR_NATIVE = [Uint8Array, Date, RegExp, Set];

/**
 * Returns true if the value is a built-in type with its own CBOR encoding.
 * @param {object} value
 * @returns {boolean}
 */
function isCborNative(value) {
  return CBOR_NATIVE.some((T) => value instanceof T);
}

/**
 * Sorts keys of any object and recursively sorts nested values.
 * Skips built-in types that have their own CBOR representation.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function sortObjectKeys(obj) {
  if (isCborNative(obj)) { return obj; }
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/** @type {import('../../ports/CodecPort.js').default} */
const defaultCodec = {
  encode(data) {
    return encoder.encode(sortKeys(data));
  },
  decode(buffer) {
    return /** @type {unknown} */ (cborDecode(buffer));
  },
};

export default defaultCodec;
