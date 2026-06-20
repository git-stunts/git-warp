import { blake3 } from "@noble/hashes/blake3.js";

import RouteKeyError from "../../errors/RouteKeyError.ts";

/**
 * Length of a blake3 route key in bytes.
 *
 * blake3's default output is 32 bytes (256 bits). This is the only
 * length this module supports.
 */
export const ROUTE_KEY_BYTES = 32;

/**
 * Total bits available for nibble extraction from a route key.
 */
export const ROUTE_KEY_BITS = ROUTE_KEY_BYTES * 8;

/**
 * Supported nibble widths in bits.
 *
 * The trie geometry parameterizes branching factor via nibble width.
 * 4 bits gives 16-way branching, 6 bits gives 64-way branching, and
 * 8 bits gives 256-way branching. Non-byte-aligned widths may
 * straddle byte boundaries; extraction reads individual bits
 * MSB-first so every supported width has the same semantics.
 */
export type NibbleBits = 1 | 2 | 4 | 6 | 8;

const SUPPORTED_NIBBLE_BITS: ReadonlyArray<NibbleBits> = [1, 2, 4, 6, 8];

/**
 * Binary route key derived from an element ID via blake3.
 *
 * A route key is a deterministic 32-byte hash of an element identifier
 * (e.g., a node ID or edge key). Nibbles extracted from the key at
 * increasing depth provide a uniformly distributed path for trie
 * navigation, regardless of the original ID's distribution.
 *
 * Route keys are frozen at construction. Their bytes must not be
 * mutated by callers.
 */
export default class RouteKey {
  readonly bytes: Uint8Array;

  /**
   * Wrap an existing 32-byte array as a RouteKey.
   *
   * The byte array is cloned to prevent external mutation. If the
   * array length does not match ROUTE_KEY_BYTES, throws RouteKeyError.
   */
  constructor(bytes: Uint8Array) {
    if (bytes.length !== ROUTE_KEY_BYTES) {
      throw new RouteKeyError(
        `RouteKey requires ${String(ROUTE_KEY_BYTES)} bytes; received ${String(bytes.length)}`,
        { code: "E_ROUTE_KEY_BYTES" },
      );
    }
    this.bytes = new Uint8Array(bytes);
    Object.freeze(this);
  }

  /**
   * Derive a route key from a non-empty element ID.
   *
   * The element ID is UTF-8 encoded and hashed with blake3. Different
   * elements produce near-uniformly distributed route keys, so trie
   * paths based on these keys are balanced in expectation regardless
   * of element ID distribution.
   */
  static fromElement(element: string): RouteKey {
    if (element.length === 0) {
      throw new RouteKeyError(
        "RouteKey.fromElement requires a non-empty element ID",
        { code: "E_ROUTE_KEY_EMPTY_ELEMENT" },
      );
    }
    const encoded = new TextEncoder().encode(element);
    const digest = blake3(encoded);
    return new RouteKey(digest);
  }

  /**
   * Extract the nibble at the given zero-based depth.
   *
   * A nibble is the next `nibbleBits`-bit slice of the route key, read
   * from the most-significant bit at depth 0. The extracted value is
   * a non-negative integer in the range [0, 2^nibbleBits).
   *
   * Depth must be within the bounds determined by `nibbleBits`:
   *   0 <= depth < ROUTE_KEY_BITS / nibbleBits
   *
   * Out-of-range depth or unsupported nibbleBits throws RouteKeyError.
   */
  nibbleAt(depth: number, nibbleBits: NibbleBits): number {
    validateNibbleAtArgs(depth, nibbleBits);
    const bitOffset = depth * nibbleBits;
    return readBitsMsbFirst(this.bytes, bitOffset, nibbleBits);
  }

  /**
   * Return the route key as a lowercase hex string.
   *
   * Useful for logging and test assertions. Not for storage — storage
   * uses the raw bytes.
   */
  toHex(): string {
    let out = "";
    for (const b of this.bytes) {
      out += b.toString(16).padStart(2, "0");
    }
    return out;
  }
}

function validateNibbleAtArgs(depth: number, nibbleBits: NibbleBits): void {
  if (!SUPPORTED_NIBBLE_BITS.includes(nibbleBits)) {
    throw new RouteKeyError(
      `RouteKey.nibbleAt requires nibbleBits in {1,2,4,6,8}; received ${String(nibbleBits)}`,
      { code: "E_ROUTE_KEY_NIBBLE_BITS" },
    );
  }
  if (!Number.isInteger(depth) || depth < 0) {
    throw new RouteKeyError(
      `RouteKey.nibbleAt requires a non-negative integer depth; received ${String(depth)}`,
      { code: "E_ROUTE_KEY_DEPTH" },
    );
  }
  const maxDepth = Math.floor(ROUTE_KEY_BITS / nibbleBits);
  if (depth >= maxDepth) {
    throw new RouteKeyError(
      `RouteKey.nibbleAt depth ${String(depth)} exceeds maximum ${String(maxDepth - 1)} for nibbleBits=${String(nibbleBits)}`,
      { code: "E_ROUTE_KEY_DEPTH" },
    );
  }
}

function readBitsMsbFirst(bytes: Uint8Array, bitOffset: number, width: NibbleBits): number {
  let value = 0;
  for (let bitIndex = 0; bitIndex < width; bitIndex += 1) {
    value = (value << 1) | readBitMsbFirst(bytes, bitOffset + bitIndex);
  }
  return value;
}

function readBitMsbFirst(bytes: Uint8Array, bitOffset: number): number {
  const byteIndex = Math.floor(bitOffset / 8);
  const byte = bytes[byteIndex];
  if (byte === undefined) {
    throw new RouteKeyError(
      `RouteKey.nibbleAt internal error: byte index ${String(byteIndex)} out of bounds`,
      { code: "E_ROUTE_KEY_BYTES" },
    );
  }
  const bitInByte = bitOffset % 8;
  return (byte >>> (7 - bitInByte)) & 1;
}
