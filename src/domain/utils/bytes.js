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
    hex += HEX_TABLE[bytes[i]];
  }
  return hex;
}

/**
 * Decodes a hex string to a Uint8Array.
 *
 * @param {string} hex - Even-length hex string
 * @returns {Uint8Array}
 */
export function hexDecode(hex) {
  if (hex.length % 2 !== 0 || !/^[\da-fA-F]*$/.test(hex)) {
    throw new RangeError(`Invalid hex string: ${hex.length > 20 ? `${hex.slice(0, 20)}…` : hex}`);
  }
  const len = hex.length >>> 1;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encodes a Uint8Array to a base64 string.
 *
 * Uses btoa() which is available in Node 16+, Bun, Deno, and browsers.
 *
 * @param {Uint8Array} bytes
 * @returns {string} Base64-encoded string
 */
export function base64Encode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string to a Uint8Array.
 *
 * Uses atob() which is available in Node 16+, Bun, Deno, and browsers.
 *
 * @param {string} b64 - Base64-encoded string
 * @returns {Uint8Array}
 */
export function base64Decode(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
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
    totalLength += arrays[i].length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    result.set(arrays[i], offset);
    offset += arrays[i].length;
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
