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
  // SHA-1 spec requires 64-bit big-endian message length. High 32 bits at
  // offset -8 are zero-initialized, so this is correct for messages < 512 MB.
  // Messages >= 2^32 bits (~512 MB) would need the high word set explicitly.
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
 * Processes a single 512-bit block, updating the hash state in-place.
 * @param {number[]} state - Five-element hash state [h0..h4]
 * @param {Uint32Array} w - 80-word expanded block
 */
function processBlock(state, w) {
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];

  for (let i = 0; i < 80; i++) {
    let f;
    let k;
    if (i < 20) {
      f = (b & c) | (~b & d);
      k = 0x5A827999;
    } else if (i < 40) {
      f = b ^ c ^ d;
      k = 0x6ED9EBA1;
    } else if (i < 60) {
      f = (b & c) | (b & d) | (c & d);
      k = 0x8F1BBCDC;
    } else {
      f = b ^ c ^ d;
      k = 0xCA62C1D6;
    }

    const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
    e = d;
    d = c;
    c = rotl(b, 30);
    b = a;
    a = temp;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
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
  const blocks = preprocess(data);
  const state = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];

  for (const w of blocks) {
    processBlock(state, w);
  }

  return state.map(v => v.toString(16).padStart(8, '0')).join('');
}
