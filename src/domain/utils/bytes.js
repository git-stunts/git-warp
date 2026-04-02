/**
 * Pure byte-manipulation utilities for the domain layer.
 *
 * These functions replace Node.js Buffer methods with portable
 * Uint8Array-based equivalents that work identically on Node,
 * Bun, Deno, and browsers.
 *
 * @module domain/utils/bytes
 */

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

/** @type {readonly string[]} */
const HEX_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
);

/**
 * Encodes a Uint8Array to a lowercase hex string.
 *
 * @param {Uint8Array} bytes
 * @returns {string} Lowercase hex string
 */
export function hexEncode(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[/** @type {number} */ (bytes[i])];
  }
  return hex;
}

/**
 * Lookup table mapping character codes to hex values.
 * Codes outside the hex range map to 0xff (invalid sentinel).
 * @type {Readonly<Uint8Array>}
 */
const HEX_VAL = (() => {
  const t = new Uint8Array(128).fill(0xff);
  for (let i = 0; i < 10; i++) { t[0x30 + i] = i; }
  for (let i = 0; i < 6; i++) { t[0x41 + i] = 10 + i; t[0x61 + i] = 10 + i; }
  return t;
})();

/**
 * Returns the numeric value of a hex character code, or -1 if invalid.
 *
 * @param {number} cc - Character code
 * @returns {number} 0–15 or -1
 */
function hexCharValue(cc) {
  const v = cc < 128 ? HEX_VAL[cc] ?? 0xff : 0xff;
  return v === 0xff ? -1 : v;
}

/**
 * Decodes a hex string to a Uint8Array.
 *
 * @param {string} hex - Even-length hex string
 * @returns {Uint8Array}
 */
export function hexDecode(hex) {
  assertEvenHexLength(hex);
  const len = hex.length >>> 1;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const hi = hexCharValue(hex.charCodeAt(i * 2));
    const lo = hexCharValue(hex.charCodeAt(i * 2 + 1));
    if (hi === -1 || lo === -1) {
      throw new RangeError(hexErrorMessage(hex));
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
}

/**
 * Asserts that a hex string has even length.
 * @param {string} hex
 */
function assertEvenHexLength(hex) {
  if (hex.length % 2 !== 0) {
    throw new RangeError(`Invalid hex string (odd length ${hex.length}): ${hex.length > 20 ? `${hex.slice(0, 20)}…` : hex}`);
  }
}

/**
 * Formats an error message for invalid hex strings.
 * @param {string} hex
 * @returns {string}
 */
function hexErrorMessage(hex) {
  return `Invalid hex string (length ${hex.length}): ${hex.length > 20 ? `${hex.slice(0, 20)}…` : hex}`;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

/**
 * Encodes a Uint8Array to a base64 string.
 *
 * Uses a direct table-based implementation that avoids intermediate binary
 * strings, preventing memory spikes on large buffers.
 *
 * @param {Uint8Array} bytes
 * @returns {string} Base64-encoded string
 */
export function base64Encode(bytes) {
  let result = '';
  const len = bytes.length;
  const remainder = len % 3;
  const mainLen = len - remainder;

  for (let i = 0; i < mainLen; i += 3) {
    const b0 = /** @type {number} */ (bytes[i]);
    const b1 = /** @type {number} */ (bytes[i + 1]);
    const b2 = /** @type {number} */ (bytes[i + 2]);
    const n = (b0 << 16) | (b1 << 8) | b2;
    result += /** @type {string} */ (B64_CHARS[(n >>> 18) & 0x3f])
            + /** @type {string} */ (B64_CHARS[(n >>> 12) & 0x3f])
            + /** @type {string} */ (B64_CHARS[(n >>> 6) & 0x3f])
            + /** @type {string} */ (B64_CHARS[n & 0x3f]);
  }

  if (remainder === 1) {
    const n = /** @type {number} */ (bytes[mainLen]);
    result += `${B64_CHARS[(n >>> 2) & 0x3f]}${B64_CHARS[(n << 4) & 0x3f]}==`;
  } else if (remainder === 2) {
    const n = (/** @type {number} */ (bytes[mainLen]) << 8) | /** @type {number} */ (bytes[mainLen + 1]);
    result += `${B64_CHARS[(n >>> 10) & 0x3f]}${B64_CHARS[(n >>> 4) & 0x3f]}${B64_CHARS[(n << 2) & 0x3f]}=`;
  }

  return result;
}

/**
 * Validates a base64 string's character set and length.
 *
 * @param {string} b64 - Base64-encoded string to validate
 * @throws {RangeError} If the string contains invalid characters or has an
 *   impossible length (length % 4 === 1 can never represent whole bytes).
 */
function validateBase64(b64) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new RangeError(`Invalid base64 string: ${b64.length > 20 ? `${b64.slice(0, 20)}…` : b64}`);
  }
  // Length % 4 === 1 is always invalid (a single base64 char encodes only 6 bits,
  // which cannot form a complete byte). Accept 0, 2, 3 (unpadded) and 0 (padded).
  if (b64.length % 4 === 1) {
    throw new RangeError(`Invalid base64 string (bad length ${b64.length}): ${b64.length > 20 ? `${b64.slice(0, 20)}…` : b64}`);
  }
}

/**
 * Decodes a base64 string to a Uint8Array.
 *
 * Uses a direct table-based implementation that avoids intermediate binary
 * strings, preventing memory spikes on large buffers.
 *
 * @param {string} b64 - Base64-encoded string
 * @returns {Uint8Array}
 */
export function base64Decode(b64) {
  validateBase64(b64);
  const len = stripPaddingLength(b64);
  return decodeBase64Bytes(b64, len);
}

/**
 * Returns the effective length of a base64 string after stripping '=' padding.
 * @param {string} b64
 * @returns {number}
 */
function stripPaddingLength(b64) {
  let len = b64.length;
  if (b64[len - 1] === '=') { len--; }
  if (b64[len - 1] === '=') { len--; }
  return len;
}

/**
 * Looks up a base64 character value at the given index, returning 0 for out-of-range.
 * @param {string} b64
 * @param {number} idx
 * @param {number} len
 * @returns {number}
 */
function b64At(b64, idx, len) {
  return idx < len ? B64_LOOKUP[b64.charCodeAt(idx)] ?? 0 : 0;
}

/**
 * Decodes base64 characters into bytes using the lookup table.
 * @param {string} b64 - Base64 string
 * @param {number} len - Effective length (padding stripped)
 * @returns {Uint8Array}
 */
function decodeBase64Bytes(b64, len) {
  const outLen = (len * 3) >>> 2;
  const bytes = new Uint8Array(outLen);
  let j = 0;

  for (let i = 0; i < len; i += 4) {
    const a = b64At(b64, i, len);
    const b = b64At(b64, i + 1, len);
    const c = b64At(b64, i + 2, len);
    const d = b64At(b64, i + 3, len);

    bytes[j++] = (a << 2) | (b >>> 4);
    if (j < outLen) { bytes[j++] = ((b << 4) | (c >>> 2)) & 0xff; }
    if (j < outLen) { bytes[j++] = ((c << 6) | d) & 0xff; }
  }

  return bytes;
}

/**
 * Concatenates multiple Uint8Arrays into a single Uint8Array.
 *
 * @param {...Uint8Array} arrays
 * @returns {Uint8Array}
 */
export function concatBytes(...arrays) {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLength += /** @type {Uint8Array} */ (arrays[i]).length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    const arr = /** @type {Uint8Array} */ (arrays[i]);
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Encodes a string to UTF-8 bytes.
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
export function textEncode(str) {
  return _encoder.encode(str);
}

/**
 * Decodes UTF-8 bytes to a string.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function textDecode(bytes) {
  return _decoder.decode(bytes);
}
