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

const HEX_TABLE: readonly string[] = Object.freeze(
  Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
);

/**
 * Encodes a Uint8Array to a lowercase hex string.
 */
export function hexEncode(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[bytes[i]!];
  }
  return hex;
}

/**
 * Lookup table mapping character codes to hex values.
 * Codes outside the hex range map to 0xff (invalid sentinel).
 */
const HEX_VAL: Readonly<Uint8Array> = (() => {
  const t = new Uint8Array(128).fill(0xff);
  for (let i = 0; i < 10; i++) { t[0x30 + i] = i; }
  for (let i = 0; i < 6; i++) { t[0x61 + i] = 10 + i; t[0x41 + i] = 10 + i; }
  return t;
})();

/**
 * Returns the numeric value of a hex character code, or -1 if invalid.
 */
function hexCharValue(cc: number): number {
  const v = cc < 128 ? HEX_VAL[cc] ?? 0xff : 0xff;
  return v === 0xff ? -1 : v;
}

/**
 * Decodes a hex string to a Uint8Array.
 */
export function hexDecode(hex: string): Uint8Array {
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
 */
function assertEvenHexLength(hex: string): void {
  if (hex.length % 2 !== 0) {
    throw new RangeError(`Invalid hex string (odd length ${hex.length}): ${hex.length > 20 ? `${hex.slice(0, 20)}…` : hex}`);
  }
}

/**
 * Formats an error message for invalid hex strings.
 */
function hexErrorMessage(hex: string): string {
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
 */
export function base64Encode(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  const remainder = len % 3;
  const mainLen = len - remainder;

  for (let i = 0; i < mainLen; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1]!;
    const b2 = bytes[i + 2]!;
    const n = (b0 << 16) | (b1 << 8) | b2;
    result += B64_CHARS[(n >>> 18) & 0x3f]!
            + B64_CHARS[(n >>> 12) & 0x3f]!
            + B64_CHARS[(n >>> 6) & 0x3f]!
            + B64_CHARS[n & 0x3f]!;
  }

  return result + encodeBase64Remainder(bytes, mainLen, remainder);
}

/**
 * Encodes the one- or two-byte base64 tail.
 */
function encodeBase64Remainder(bytes: Uint8Array, mainLen: number, remainder: number): string {
  if (remainder === 1) {
    const n = bytes[mainLen]!;
    return `${B64_CHARS[(n >>> 2) & 0x3f]!}${B64_CHARS[(n << 4) & 0x3f]!}==`;
  }
  if (remainder === 2) {
    const n = (bytes[mainLen]! << 8) | bytes[mainLen + 1]!;
    return `${B64_CHARS[(n >>> 10) & 0x3f]!}${B64_CHARS[(n >>> 4) & 0x3f]!}${B64_CHARS[(n << 2) & 0x3f]!}=`;
  }
  return '';
}

/**
 * Validates a base64 string's character set and length.
 *
 * @throws {RangeError} If the string contains invalid characters or has an
 *   impossible length (length % 4 === 1 can never represent whole bytes).
 */
function validateBase64(b64: string): void {
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
 */
export function base64Decode(b64: string): Uint8Array {
  validateBase64(b64);
  const len = stripPaddingLength(b64);
  return decodeBase64Bytes(b64, len);
}

/**
 * Returns the effective length of a base64 string after stripping '=' padding.
 */
function stripPaddingLength(b64: string): number {
  let len = b64.length;
  if (b64[len - 1] === '=') { len--; }
  if (b64[len - 1] === '=') { len--; }
  return len;
}

/**
 * Looks up a base64 character value at the given index, returning 0 for out-of-range.
 */
function b64At(b64: string, idx: number, len: number): number {
  return idx < len ? B64_LOOKUP[b64.charCodeAt(idx)] ?? 0 : 0;
}

/**
 * Decodes base64 characters into bytes using the lookup table.
 */
function decodeBase64Bytes(b64: string, len: number): Uint8Array {
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
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLength += arrays[i]!.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i]!;
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Encodes a string to UTF-8 bytes.
 */
export function textEncode(str: string): Uint8Array {
  return _encoder.encode(str);
}

/**
 * Decodes UTF-8 bytes to a string.
 */
export function textDecode(bytes: Uint8Array): string {
  return _decoder.decode(bytes);
}
