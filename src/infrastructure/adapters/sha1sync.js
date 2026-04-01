/* @ts-self-types="../../../sha1sync.d.ts" */

/**
 * Synchronous SHA-1 for browser use with InMemoryGraphAdapter.
 *
 * This is a minimal, standards-compliant SHA-1 implementation used
 * solely for Git content addressing (blob/tree/commit object IDs).
 * It is NOT used for security purposes.
 *
 * @module infrastructure/adapters/sha1sync
 */

/**
 * Left-rotate a 32-bit integer by n bits.
 * @param {number} x
 * @param {number} n
 * @returns {number}
 */
function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/**
 * Pads and parses a message into 512-bit blocks for SHA-1.
 * @param {Uint8Array} msg
 * @returns {Uint32Array[]}
 */
function preprocess(msg) {
  const bitLen = msg.length * 8;
  const totalBytes = msg.length + 1 + ((119 - (msg.length % 64)) % 64) + 8;
  const padded = new Uint8Array(totalBytes);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  // SHA-1 spec requires 64-bit big-endian message length in the final 8 bytes.
  // High 32 bits are zero-initialized by the Uint8Array, so we only set the
  // low 32 bits. msg.length is safe because `bitLen = msg.length * 8` stays
  // within uint32 range for messages under 512 MB (0x20000000 bytes).
  dv.setUint32(totalBytes - 4, bitLen, false);

  const blocks = [];
  for (let i = 0; i < totalBytes; i += 64) {
    const block = new Uint32Array(80);
    for (let j = 0; j < 16; j++) {
      block[j] = dv.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      block[j] = rotl(block[j - 3] ^ block[j - 8] ^ block[j - 14] ^ block[j - 16], 1);
    }
    blocks.push(block);
  }
  return blocks;
}

/**
 * Returns the SHA-1 round constant for a given round index.
 * @param {number} i - Round index (0-79)
 * @returns {number}
 */
function roundK(i) {
  if (i < 20) { return 0x5A827999; }
  if (i < 40) { return 0x6ED9EBA1; }
  if (i < 60) { return 0x8F1BBCDC; }
  return 0xCA62C1D6;
}

/**
 * Computes the SHA-1 round function f(b, c, d) for a given round index.
 * @param {number} i - Round index (0-79)
 * @param {number[]} vars - Working variables [a, b, c, d, e]
 * @returns {number}
 */
function roundF(i, vars) {
  const b = vars[1];
  const c = vars[2];
  const d = vars[3];
  if (i < 20) { return (b & c) | (~b & d); }
  if (i < 40) { return b ^ c ^ d; }
  if (i < 60) { return (b & c) | (b & d) | (c & d); }
  return b ^ c ^ d;
}

/**
 * Processes a single 512-bit block, updating the hash state in-place.
 * @param {number[]} state - Five-element hash state [h0..h4]
 * @param {Uint32Array} w - 80-word expanded block
 */
function processBlock(state, w) {
  /** @type {number[]} */
  const v = [state[0], state[1], state[2], state[3], state[4]];

  for (let i = 0; i < 80; i++) {
    const f = roundF(i, v);
    const k = roundK(i);
    const temp = (rotl(v[0], 5) + f + v[4] + k + w[i]) >>> 0;
    v[4] = v[3];
    v[3] = v[2];
    v[2] = rotl(v[1], 30);
    v[1] = v[0];
    v[0] = temp;
  }

  for (let i = 0; i < 5; i++) {
    state[i] = (state[i] + v[i]) >>> 0;
  }
}

/**
 * Computes the SHA-1 hash of a Uint8Array, returning a 40-char hex string.
 *
 * @param {Uint8Array} data
 * @returns {string} 40-hex SHA-1 digest
 *
 * @example
 * import { sha1sync } from './sha1sync.js';
 * const hex = sha1sync(new TextEncoder().encode('hello'));
 * // => 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
 */
export function sha1sync(data) {
  if (data.length >= 0x20000000) {
    throw new RangeError('sha1sync: input exceeds 512 MB limit');
  }
  const blocks = preprocess(data);
  const state = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];

  for (const w of blocks) {
    processBlock(state, w);
  }

  return state.map(v => v.toString(16).padStart(8, '0')).join('');
}
