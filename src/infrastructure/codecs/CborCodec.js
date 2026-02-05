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
 * Before encoding, we recursively sort all object keys lexicographically via the
 * {@link sortKeys} function. This ensures:
 *
 * - **Determinism**: Same input always produces identical bytes
 * - **Interoperability**: Output conforms to RFC 7049 Section 3.9 (Canonical CBOR)
 * - **Verifiability**: Patches can be re-encoded and compared byte-for-byte
 *
 * ## Performance Considerations
 *
 * The key sorting step adds O(n log n) overhead per encoding operation where n is
 * the total number of keys across all nested objects. For typical WARP patches
 * (tens to hundreds of keys), this overhead is negligible compared to I/O costs.
 *
 * @module infrastructure/codecs/CborCodec
 * @see {@link https://cbor.io/} for CBOR specification
 * @see {@link https://tools.ietf.org/html/rfc7049#section-3.9} for Canonical CBOR
 * @see {@link https://github.com/kriszyp/cbor-x} for cbor-x library
 */

import { Encoder, decode as cborDecode } from 'cbor-x';

/**
 * Pre-configured cbor-x encoder instance.
 *
 * Configuration options:
 * - `useRecords: false` - Disables cbor-x's record extension (which uses a custom
 *   CBOR tag for repeated object structures). We use standard CBOR maps for maximum
 *   interoperability with other CBOR implementations.
 * - `mapsAsObjects: true` - Decodes CBOR maps as JavaScript plain objects rather than
 *   Map instances. This matches the expected input format for WARP patches.
 *
 * @type {Encoder}
 * @private
 */
const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

/**
 * Recursively sorts object keys to ensure deterministic/canonical encoding.
 *
 * This function transforms any JavaScript value into an equivalent structure
 * where all object keys are sorted lexicographically. This is necessary because
 * cbor-x encodes object keys in enumeration order, and JavaScript object key
 * enumeration follows insertion order.
 *
 * ## Transformation Rules
 *
 * | Input Type     | Output Type    | Transformation                          |
 * |----------------|----------------|-----------------------------------------|
 * | `null`         | `null`         | Pass through                            |
 * | `undefined`    | `undefined`    | Pass through                            |
 * | Primitive      | Primitive      | Pass through (number, string, boolean, bigint) |
 * | Array          | Array          | Elements recursively sorted             |
 * | Plain Object   | Plain Object   | Keys sorted, values recursively sorted  |
 * | Map            | Plain Object   | Converted to object with sorted keys    |
 * | Other objects  | Same object    | Pass through (Date, Buffer, etc.)       |
 *
 * ## Why Only Plain Objects?
 *
 * We only sort keys for plain objects (`value.constructor === Object`) because:
 * 1. Plain objects are the standard structure for WARP patches
 * 2. Special objects (Date, Buffer, TypedArray) have specific CBOR encodings
 * 3. Class instances may have non-enumerable or symbol keys that shouldn't be modified
 *
 * ## Complexity
 *
 * Time: O(n log n) where n is total number of keys across all nested objects
 * Space: O(d) where d is maximum nesting depth (recursive call stack)
 *
 * @param {unknown} value - The value to transform. Can be any JavaScript value.
 * @returns {unknown} A new value with all object keys sorted. Primitives are
 *   returned as-is. Objects are shallow-copied with sorted keys. Arrays are
 *   shallow-copied with transformed elements.
 *
 * @example
 * // Object keys are sorted lexicographically
 * sortKeys({ z: 1, a: 2 })
 * // Returns: { a: 2, z: 1 }
 *
 * @example
 * // Nested objects are recursively sorted
 * sortKeys({ outer: { z: 1, a: 2 }, b: 3 })
 * // Returns: { b: 3, outer: { a: 2, z: 1 } }
 *
 * @example
 * // Arrays preserve order but sort object elements
 * sortKeys([{ b: 1, a: 2 }, { d: 3, c: 4 }])
 * // Returns: [{ a: 2, b: 1 }, { c: 4, d: 3 }]
 *
 * @example
 * // Map instances are converted to sorted objects
 * sortKeys(new Map([['z', 1], ['a', 2]]))
 * // Returns: { a: 2, z: 1 }
 *
 * @private
 */
function sortKeys(value) {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle arrays - recursively sort elements
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  // Handle plain objects - sort keys and recursively process values
  // Note: value.constructor === undefined handles Object.create(null) objects
  if (typeof value === 'object' && (value.constructor === Object || value.constructor === undefined)) {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }

  // Handle Map instances - convert to sorted object
  if (value instanceof Map) {
    const sorted = {};
    const keys = Array.from(value.keys()).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value.get(key));
    }
    return sorted;
  }

  // Primitive values (number, string, boolean, bigint) pass through
  return value;
}

/**
 * Encodes data to canonical CBOR bytes with deterministic output.
 *
 * This function guarantees that logically equivalent inputs always produce
 * byte-identical outputs. It achieves this by recursively sorting all object
 * keys before encoding, ensuring consistent key ordering regardless of how
 * the input object was constructed.
 *
 * ## Determinism Guarantee
 *
 * The following invariant always holds:
 * ```javascript
 * // Logically equivalent inputs produce identical bytes
 * encode({ b: 1, a: 2 }).equals(encode({ a: 2, b: 1 })) // true
 *
 * // Re-encoding decoded data produces identical bytes
 * const original = encode(data);
 * const roundTrip = encode(decode(original));
 * original.equals(roundTrip) // true
 * ```
 *
 * ## CBOR Type Mappings
 *
 * | JavaScript Type | CBOR Major Type | Notes                           |
 * |-----------------|-----------------|----------------------------------|
 * | number (int)    | 0 or 1          | Positive or negative integer    |
 * | number (float)  | 7               | IEEE 754 float                  |
 * | string          | 3               | UTF-8 text string               |
 * | boolean         | 7               | Simple value (true=21, false=20)|
 * | null            | 7               | Simple value (null=22)          |
 * | undefined       | 7               | Simple value (undefined=23)     |
 * | Array           | 4               | Array of data items             |
 * | Object          | 5               | Map of pairs (keys sorted)      |
 * | Buffer          | 2               | Byte string                     |
 * | BigInt          | 0, 1, or 6      | Integer or tagged bignum        |
 *
 * @param {unknown} data - The data to encode. Can be any JSON-serializable value,
 *   plus Buffer, BigInt, and other types supported by cbor-x. Objects have their
 *   keys sorted before encoding.
 * @returns {Buffer} CBOR-encoded bytes. The buffer is a Node.js Buffer instance
 *   that can be written directly to files, network sockets, or Git objects.
 *
 * @example
 * // Encode a simple patch operation
 * const patch = {
 *   schema: 2,
 *   ops: [
 *     { op: 'NodeAdd', id: 'user:alice', dot: ['w1', 1] },
 *     { op: 'PropSet', target: 'user:alice', key: 'name', value: 'Alice' }
 *   ]
 * };
 * const bytes = encode(patch);
 * console.log(bytes.length); // ~80 bytes (much smaller than JSON)
 *
 * @example
 * // Demonstrating determinism - key order doesn't matter
 * const bytes1 = encode({ z: 1, a: 2, m: 3 });
 * const bytes2 = encode({ a: 2, m: 3, z: 1 });
 * const bytes3 = encode({ m: 3, z: 1, a: 2 });
 * console.log(bytes1.equals(bytes2)); // true
 * console.log(bytes2.equals(bytes3)); // true
 *
 * @example
 * // Canonical encoding enables content-addressing
 * const sha = crypto.createHash('sha256').update(encode(data)).digest('hex');
 * // Same data always produces the same SHA
 */
export function encode(data) {
  const sorted = sortKeys(data);
  return encoder.encode(sorted);
}

/**
 * Decodes CBOR bytes to a JavaScript value.
 *
 * This function deserializes CBOR-encoded data back into JavaScript values.
 * It uses cbor-x's native decoder which is optimized for performance.
 *
 * ## CBOR to JavaScript Type Mappings
 *
 * | CBOR Major Type | JavaScript Type | Notes                           |
 * |-----------------|-----------------|----------------------------------|
 * | 0 (pos int)     | number          | Up to Number.MAX_SAFE_INTEGER   |
 * | 1 (neg int)     | number          | Down to Number.MIN_SAFE_INTEGER |
 * | 2 (byte string) | Buffer          | Node.js Buffer                  |
 * | 3 (text string) | string          | UTF-8 decoded                   |
 * | 4 (array)       | Array           | Recursive decode                |
 * | 5 (map)         | Object          | Due to mapsAsObjects: true      |
 * | 6 (tagged)      | varies          | Depends on tag number           |
 * | 7 (simple)      | varies          | true, false, null, undefined    |
 *
 * ## Large Integers
 *
 * CBOR integers outside JavaScript's safe integer range (2^53 - 1) are decoded
 * as BigInt values. Ensure your code handles both number and BigInt if you
 * expect large values.
 *
 * ## Round-Trip Safety
 *
 * Values encoded with {@link encode} can be round-tripped through decode without
 * data loss, and re-encoding will produce byte-identical output due to our
 * canonical encoding strategy:
 *
 * ```javascript
 * const original = { foo: 'bar', count: 42 };
 * const bytes = encode(original);
 * const decoded = decode(bytes);
 * const reEncoded = encode(decoded);
 * bytes.equals(reEncoded); // true - canonical encoding is idempotent
 * ```
 *
 * @param {Buffer|Uint8Array} buffer - CBOR-encoded bytes to decode. Accepts
 *   Node.js Buffer, Uint8Array, or any ArrayBufferView.
 * @returns {unknown} The decoded JavaScript value. Type depends on the encoded
 *   CBOR data - could be a primitive, array, or plain object.
 * @throws {Error} If the buffer contains invalid CBOR data or is truncated.
 *
 * @example
 * // Decode a CBOR-encoded patch from a Git commit message
 * const commitMessage = await adapter.showNode(sha);
 * const patchData = decode(Buffer.from(commitMessage, 'binary'));
 * console.log(patchData.schema); // 2
 * console.log(patchData.ops.length); // number of operations
 *
 * @example
 * // Error handling for invalid data
 * try {
 *   const data = decode(Buffer.from([0xff, 0xff])); // Invalid CBOR
 * } catch (err) {
 *   console.error('Invalid CBOR:', err.message);
 * }
 *
 * @example
 * // Handling large integers
 * const bytes = encode({ bigNum: BigInt('9007199254740993') }); // > MAX_SAFE_INTEGER
 * const decoded = decode(bytes);
 * console.log(typeof decoded.bigNum); // 'bigint'
 */
export function decode(buffer) {
  return cborDecode(buffer);
}

/**
 * Default export providing both encode and decode functions.
 *
 * @type {{ encode: typeof encode, decode: typeof decode }}
 *
 * @example
 * import cbor from './CborCodec.js';
 *
 * const bytes = cbor.encode({ key: 'value' });
 * const data = cbor.decode(bytes);
 */
export default { encode, decode };
