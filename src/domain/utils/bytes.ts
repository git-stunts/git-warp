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
