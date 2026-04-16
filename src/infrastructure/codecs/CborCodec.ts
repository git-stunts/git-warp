/**
 * @fileoverview CBOR Codec with Canonical/Deterministic Encoding.
 *
 * This module wraps the `cbor-x` library to provide **canonical CBOR encoding**
 * for WARP graph patches. Canonical encoding is critical for WARP's content-addressed
 * storage model: the same logical patch must always produce identical bytes so that
 * Git SHA comparisons work correctly.
 *
 * ## Why Canonical Encoding Matters
 *
 * WARP stores patches as Git commits where the commit message contains CBOR-encoded
 * patch data. Git identifies commits by SHA-256 hash of their content. If the same
 * logical patch could encode to different byte sequences (e.g., due to non-deterministic
 * object key ordering), then:
 *
 * 1. **Duplicate patches** could exist with different SHAs
 * 2. **Deduplication** would fail - the same operation stored multiple times
 * 3. **Causality tracking** would break - version vectors rely on exact SHA matching
 * 4. **Sync protocols** would transfer redundant data
 *
 * ## The cbor-x Limitation
 *
 * Unlike some CBOR libraries, `cbor-x` does not provide built-in canonical/deterministic
 * encoding. JavaScript object key enumeration order is insertion-order (per ES2015+),
 * which means `{ b: 1, a: 2 }` and `{ a: 2, b: 1 }` would encode differently despite
 * being logically equivalent.
 *
 * ## Our Solution: Pre-encoding Key Sorting
 *
 * Before encoding, we recursively sort all object keys using JavaScript's default
 * lexicographic sort (via {@link sortKeys}). This produces deterministic,
 * lexicographically-sorted CBOR for WARP patches.
 *
 * **Important**: This is NOT RFC 7049 Section 3.9 canonical CBOR, which requires
 * byte-length-first ordering (shorter keys before longer keys, then lexicographic
 * within same length). Our approach uses simple lexicographic ordering, which is
 * sufficient for WARP's content-addressing needs but not interoperable with systems
 * expecting strict RFC 7049 canonical form.
 *
 * This ensures:
 *
 * - **Determinism**: Same input always produces identical bytes
 * - **Verifiability**: Patches can be re-encoded and compared byte-for-byte
 *
 * @module infrastructure/codecs/CborCodec
 * @see {@link https://cbor.io/} for CBOR specification
 * @see {@link https://tools.ietf.org/html/rfc7049#section-3.9} for Canonical CBOR
 * @see {@link https://github.com/kriszyp/cbor-x} for cbor-x library
 */

import { Encoder, decode as cborDecode } from 'cbor-x';
import CodecPort from '../../ports/CodecPort.ts';
import MessageCodecError from '../../domain/errors/MessageCodecError.ts';

/**
 * Pre-configured cbor-x encoder instance.
 *
 * Configuration options:
 * - `useRecords: false` - Disables cbor-x's record extension (which uses a custom
 *   CBOR tag for repeated object structures). We use standard CBOR maps for maximum
 *   interoperability with other CBOR implementations.
 * - `mapsAsObjects: true` - Decodes CBOR maps as JavaScript plain objects rather than
 *   Map instances. This matches the expected input format for WARP patches.
 */
const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

 
const CBOR_NATIVE_TYPES: ReadonlyArray<Function> = [Uint8Array, Date, RegExp, Set, Map];

/**
 * Returns true if the value is a built-in type with its own CBOR encoding.
 */
function isCborNative(value: object): boolean {
  return CBOR_NATIVE_TYPES.some((T) => value instanceof (T as new (...args: unknown[]) => unknown));
}

/**
 * Checks if a value should have its keys sorted for canonical CBOR.
 * Returns true for plain objects AND domain class instances.
 * Returns false for built-in types with their own CBOR representation.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !isCborNative(value);
}

/**
 * Sorts the keys of a plain object and recursively processes values.
 */
function sortPlainObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  // Key sort ensures deterministic CBOR encoding regardless of insertion order.
  // Required for content-addressed storage where byte-identical encoding is critical.
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/**
 * Converts a Map to a sorted plain object with recursive value processing.
 * Validates that all Map keys are strings (required for CBOR encoding).
 */
function sortMapToObject(map: Map<unknown, unknown>): Record<string, unknown> {
  const keys = Array.from(map.keys());
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new MessageCodecError(
        `Map keys must be strings for CBOR encoding, got ${typeof key}`,
        { code: 'E_CBOR_MAP_KEY_TYPE', context: { actual: typeof key } },
      );
    }
  }
  const sorted: Record<string, unknown> = {};
  (keys as string[]).sort();
  for (const key of (keys as string[])) {
    sorted[key] = sortKeys(map.get(key));
  }
  return sorted;
}

/**
 * Recursively sorts object keys to ensure deterministic/canonical encoding.
 *
 * This function transforms any JavaScript value into an equivalent structure
 * where all object keys are sorted lexicographically. This is necessary because
 * cbor-x encodes object keys in enumeration order, and JavaScript object key
 * enumeration follows insertion order.
 */
function sortKeys(value: unknown): unknown {
  // Nullish values and primitives pass through
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }

  return _sortComposite(value);
}

/**
 * Sorts keys for composite values (arrays, plain objects, Maps).
 */
function _sortComposite(value: object): unknown {
  if (Array.isArray(value)) {
    return (value as unknown[]).map(sortKeys);
  }
  if (isPlainObject(value)) {
    return sortPlainObject(value);
  }
  if (value instanceof Map) {
    return sortMapToObject(value as Map<unknown, unknown>);
  }
  return value;
}

/**
 * Encodes data to canonical CBOR bytes with deterministic output.
 *
 * This function guarantees that logically equivalent inputs always produce
 * byte-identical outputs. It achieves this by recursively sorting all object
 * keys before encoding, ensuring consistent key ordering regardless of how
 * the input object was constructed.
 */
export function encode(data: unknown): Uint8Array {
  const sorted = sortKeys(data);
  return encoder.encode(sorted) as Uint8Array;
}

/**
 * Decodes CBOR bytes to a JavaScript value.
 *
 * This function deserializes CBOR-encoded data back into JavaScript values.
 * It uses cbor-x's native decoder which is optimized for performance.
 */
export function decode(buffer: Uint8Array): unknown {
  return cborDecode(buffer);
}

/**
 * CBOR codec implementing CodecPort with canonical/deterministic encoding.
 */
export class CborCodec extends CodecPort {
  /**
   * Encodes data to canonical CBOR bytes with sorted keys.
   */
  override encode<TEncoded = unknown>(data: TEncoded): Uint8Array {
    return encode(data);
  }

  /**
   * Decodes CBOR bytes to a typed JavaScript value. The caller
   * supplies the expected `TDecoded` at the call site; the
   * adapter's cbor-x round-trip returns whatever shape the bytes
   * encoded to, cast to the caller's declared type.
   */
  override decode<TDecoded = unknown>(buffer: Uint8Array): TDecoded {
    return decode(buffer) as TDecoded;
  }
}

export default new CborCodec();
